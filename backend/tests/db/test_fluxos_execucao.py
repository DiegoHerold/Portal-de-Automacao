"""Fluxos em blocos, Fase 3, no PostgreSQL: executar, avançar em fatias, esperar e retomar,
pausar, continuar, cancelar, versão presa ao início, limite de tempo, limpeza e duas fatias
concorrentes nunca pegando a mesma execução."""

from __future__ import annotations

import threading
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

API = "/api/v1/fluxos"
num = lambda v: {"tipo": "numero", "valor": v}  # noqa: E731
var = lambda n: {"tipo": "var", "nome": n}  # noqa: E731

PROGRAMA = {
    "contrato": "fluxo/v1",
    "entradas": [{"nome": "vezes", "tipo": "numero", "obrigatoria": True, "rotulo": "Vezes"}],
    "variaveis": [{"nome": "total", "tipo": "numero"}, {"nome": "motivo", "tipo": "texto"}],
    "corpo": [
        {"id": "b1", "tipo": "definir", "variavel": "total", "valor": num(0)},
        {"id": "b2", "tipo": "repetir_vezes", "vezes": {"tipo": "entrada", "nome": "vezes"}, "corpo": [
            {"id": "b3", "tipo": "alterar", "variavel": "total", "por": num(10)}]},
        {"id": "b4", "tipo": "tentar", "motivo_em": "motivo", "corpo": [
            {"id": "b5", "tipo": "definir", "variavel": "total", "valor": {"tipo": "op", "op": "/", "a": var("total"), "b": num(0)}}],
         "se_falhar": [{"id": "b6", "tipo": "registrar", "texto": var("motivo"), "nivel": "aviso"}]},
        {"id": "b7", "tipo": "esperar", "segundos": num(600)},
        {"id": "b8", "tipo": "concluir", "valor": var("total")},
    ],
}


def _publicado(cliente, programa: dict = PROGRAMA) -> str:
    fid = cliente.post(API, json={"nome": "Teste do motor"}).json()["id"]
    assert cliente.put(f"{API}/{fid}/rascunho", json=programa).json()["erros"] == []
    assert cliente.post(f"{API}/{fid}/publicar").status_code == 201
    return fid


def _execucoes(sessao, agora: datetime | None = None):
    from modules.orchestration.fluxos.execucoes import Execucoes, limites_do_portal
    from modules.governance.infrastructure.adapters import build_governance_adapters

    return Execucoes(sessao, build_governance_adapters(sessao).audit, limites_do_portal(sessao),
                     agora=(lambda: agora) if agora else None)


def test_executar_esperar_retomar_e_concluir(cliente, sessao) -> None:
    fid = _publicado(cliente)
    assert "Falta a entrada Vezes" in cliente.post(f"{API}/{fid}/executar", json={"entradas": {}}).json()["error"]["message"]
    inicio = cliente.post(f"{API}/{fid}/executar", json={"entradas": {"vezes": 3}})
    assert inicio.status_code == 201, inicio.text
    eid = inicio.json()["id"]
    assert inicio.json()["situacao"] == "rodando" and inicio.json()["versao"] == 1

    # Uma versão nova publicada depois não muda a execução que já começou.
    outro = {**PROGRAMA, "corpo": [{"id": "z1", "tipo": "concluir", "valor": num(-1)}]}
    cliente.put(f"{API}/{fid}/rascunho", json=outro)
    cliente.post(f"{API}/{fid}/publicar")

    _execucoes(sessao).avancar_prontas()
    sessao.commit()
    meio = cliente.get(f"{API}/execucoes/{eid}").json()
    assert meio["situacao"] == "esperando" and meio["bloco_atual"] == "b7" and meio["variaveis"]["total"] == 30
    resumos = [p["resumo"] for p in meio["passos"]]
    assert "Divisão por zero." in resumos and "[volta 3] total = 30" in resumos

    # Antes do horário, nada anda; depois, conclui.
    _execucoes(sessao).avancar_prontas()
    sessao.commit()
    assert cliente.get(f"{API}/execucoes/{eid}").json()["situacao"] == "esperando"
    _execucoes(sessao, datetime.now(UTC) + timedelta(minutes=11)).avancar_prontas()
    sessao.commit()
    fim = cliente.get(f"{API}/execucoes/{eid}").json()
    assert fim["situacao"] == "concluida" and fim["resultado"] == 30 and fim["terminado_em"]
    assert [e["id"] for e in cliente.get(f"{API}/{fid}/execucoes").json()["execucoes"]] == [eid]
    assert sessao.execute(text("SELECT count(*) FROM audit_events WHERE action = 'fluxo.executado' AND resource_id = :e"),
                          {"e": eid}).scalar_one() == 1


def test_pausar_continuar_cancelar(cliente, sessao) -> None:
    fid = _publicado(cliente)
    eid = cliente.post(f"{API}/{fid}/executar", json={"entradas": {"vezes": 1}}).json()["id"]
    assert cliente.post(f"{API}/execucoes/{eid}/pausar").json()["situacao"] == "pausada"
    _execucoes(sessao).avancar_prontas()  # pausada não anda
    sessao.commit()
    assert cliente.get(f"{API}/execucoes/{eid}").json()["passos_dados"] == 0
    assert cliente.post(f"{API}/execucoes/{eid}/continuar").json()["situacao"] == "rodando"
    assert cliente.post(f"{API}/execucoes/{eid}/continuar").status_code == 422
    cancelada = cliente.post(f"{API}/execucoes/{eid}/cancelar").json()
    assert cancelada["situacao"] == "cancelada" and cancelada["passos"][-1]["resumo"] == "Cancelada por uma pessoa."
    assert cliente.post(f"{API}/execucoes/{eid}/cancelar").status_code == 422
    assert cliente.post(f"{API}/execucoes/{eid}/voar").status_code == 404


def test_tempo_maximo_e_limpeza_da_linha_do_tempo(cliente, sessao) -> None:
    from modules.governance.infrastructure.adapters.limpeza import build_aplicar_limpeza

    fid = _publicado(cliente)
    eid = cliente.post(f"{API}/{fid}/executar", json={"entradas": {"vezes": 1}}).json()["id"]
    _execucoes(sessao, datetime.now(UTC) + timedelta(days=8)).avancar_prontas()  # padrão: 7 dias
    sessao.commit()
    fim = cliente.get(f"{API}/execucoes/{eid}").json()
    assert fim["situacao"] == "falhou" and "tempo máximo" in fim["motivo"]

    sessao.execute(text("UPDATE fluxo_execucoes SET terminado_em = now() - interval '200 days' WHERE id = :e"), {"e": eid})
    sessao.commit()
    build_aplicar_limpeza(sessao).execute()
    assert sessao.execute(text("SELECT count(*) FROM fluxo_passos WHERE execucao_id = :e"), {"e": eid}).scalar_one() == 0
    assert cliente.get(f"{API}/execucoes/{eid}").json()["situacao"] == "falhou"  # a execução fica


def test_duas_fatias_ao_mesmo_tempo_nao_pegam_a_mesma_execucao(cliente, sessao, engine) -> None:
    longo = {"contrato": "fluxo/v1", "variaveis": [{"nome": "n", "tipo": "numero"}], "corpo": [
        {"id": "a", "tipo": "repetir_vezes", "vezes": num(300), "corpo": [{"id": "b", "tipo": "alterar", "variavel": "n", "por": num(1)}]},
        {"id": "c", "tipo": "concluir", "valor": var("n")}]}
    fid = _publicado(cliente, longo)
    eid = cliente.post(f"{API}/{fid}/executar", json={}).json()["id"]
    fabrica = sessionmaker(bind=engine, expire_on_commit=False)
    feitas: list[int] = []
    barreira = threading.Barrier(2)

    def worker() -> None:
        with fabrica() as db:
            barreira.wait()
            execs = _execucoes(db)
            execs.db = db
            feitas.append(execs.avancar_prontas())
            db.commit()

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    detalhe = cliente.get(f"{API}/execucoes/{eid}").json()
    # 200 passos por fatia: se as duas fatias tivessem rodado a mesma execução, teria 400 passos.
    assert detalhe["passos_dados"] == 200 and detalhe["situacao"] == "rodando"
    numeros = sessao.execute(text("SELECT numero FROM fluxo_passos WHERE execucao_id = :e ORDER BY numero"), {"e": eid}).scalars().all()
    assert numeros == list(range(1, len(numeros) + 1))
