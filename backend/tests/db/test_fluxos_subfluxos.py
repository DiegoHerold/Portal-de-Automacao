"""Fluxos em blocos, Fase 7, no PostgreSQL: "Chamar outro fluxo" cria uma execução filha, a mãe espera
e recebe o resultado; o mesmo subfluxo serve a dois fluxos; entrada errada vira falha da mãe; cancelar
a mãe cancela a filha; o detalhe mostra o que a execução espera agora (tela ao vivo)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

API = "/api/v1/fluxos"
txt = lambda v: {"tipo": "texto", "valor": v}  # noqa: E731
var = lambda n: {"tipo": "var", "nome": n}  # noqa: E731

FILHO = {"contrato": "fluxo/v1", "entradas": [{"nome": "empresa", "tipo": "texto", "obrigatoria": True, "rotulo": "Empresa"}],
         "corpo": [{"id": "f1", "tipo": "concluir",
                    "valor": {"tipo": "fn", "nome": "juntar_texto", "args": [txt("conferida "), {"tipo": "entrada", "nome": "empresa"}]}}]}
DEMORADO = {"contrato": "fluxo/v1", "corpo": [{"id": "d1", "tipo": "esperar", "segundos": {"tipo": "numero", "valor": 600}},
                                             {"id": "d2", "tipo": "concluir"}]}


def _publicado(cliente, nome: str, programa: dict) -> str:
    fid = cliente.post(API, json={"nome": nome}).json()["id"]
    erros = cliente.put(f"{API}/{fid}/rascunho", json=programa).json()["erros"]
    assert erros == [], erros
    assert cliente.post(f"{API}/{fid}/publicar").status_code == 201
    return fid


def _avancar(sessao, vezes: int = 1, minutos: float = 0) -> None:
    from modules.governance.infrastructure.adapters import build_governance_adapters
    from modules.orchestration.fluxos.execucoes import Execucoes, limites_do_portal

    agora = datetime.now(UTC) + timedelta(minutes=minutos)
    for _ in range(vezes):
        Execucoes(sessao, build_governance_adapters(sessao).audit, limites_do_portal(sessao), agora=lambda: agora).avancar_prontas()
        sessao.commit()


def test_mesmo_subfluxo_em_dois_fluxos(cliente, sessao) -> None:
    filho = _publicado(cliente, "Conferir empresa", FILHO)
    um = _publicado(cliente, "Fechamento da Planet", {"contrato": "fluxo/v1", "variaveis": [{"nome": "r", "tipo": "qualquer"}], "corpo": [
        {"id": "a1", "tipo": "chamar_subfluxo", "fluxo": filho, "entradas": {"empresa": txt("8010")}, "guardar_em": "r"},
        {"id": "a2", "tipo": "concluir", "valor": var("r")}]})
    outro = _publicado(cliente, "Fechamento do mês", {"contrato": "fluxo/v1", "variaveis": [{"nome": "todas", "tipo": {"lista": "texto"}},
                                                                                           {"nome": "r", "tipo": "qualquer"}], "corpo": [
        {"id": "b1", "tipo": "definir", "variavel": "todas", "valor": {"tipo": "lista", "itens": []}},
        {"id": "b2", "tipo": "para_cada", "variavel": "empresa", "lista": {"tipo": "lista", "itens": [txt("100"), txt("200")]}, "corpo": [
            {"id": "b3", "tipo": "chamar_subfluxo", "fluxo": filho, "entradas": {"empresa": var("empresa")}, "guardar_em": "r"},
            {"id": "b4", "tipo": "adicionar", "lista": "todas", "valor": var("r")}]},
        {"id": "b5", "tipo": "concluir", "valor": var("todas")}]})

    e1 = cliente.post(f"{API}/{um}/executar", json={}).json()["id"]
    e2 = cliente.post(f"{API}/{outro}/executar", json={}).json()["id"]
    _avancar(sessao)
    agora = cliente.get(f"{API}/execucoes/{e1}").json()
    assert agora["situacao"] == "esperando" and agora["agora"]["tipo"] == "subfluxo"
    assert agora["agora"]["fluxo_nome"] == "Conferir empresa" and agora["agora"]["bloco"] == "a1"

    _avancar(sessao, vezes=8)
    fim1 = cliente.get(f"{API}/execucoes/{e1}").json()
    fim2 = cliente.get(f"{API}/execucoes/{e2}").json()
    assert fim1["situacao"] == "concluida" and fim1["resultado"] == "conferida 8010"
    assert fim2["situacao"] == "concluida" and fim2["resultado"] == ["conferida 100", "conferida 200"]

    # A mãe lista as filhas; a filha aponta a mãe e o bloco que chamou.
    assert [(f["fluxo_nome"], f["bloco"], f["situacao"]) for f in fim2["filhas"]] == [
        ("Conferir empresa", "b3", "concluida"), ("Conferir empresa", "b3", "concluida")]
    filha = cliente.get(f"{API}/execucoes/{fim1['filhas'][0]['id']}").json()
    assert filha["mae"] == {"id": e1, "fluxo_id": um, "fluxo_nome": "Fechamento da Planet", "bloco": "a1"}
    assert filha["origem"] == "subfluxo" and filha["entradas"] == {"empresa": "8010"}
    assert filha["disparado_por"] == fim1["disparado_por"]
    assert len(cliente.get(f"{API}/{filho}/execucoes").json()["execucoes"]) == 3
    assert cliente.get(f"{API}/{um}/execucoes").json()["execucoes"][0]["disparado_por_nome"]


def test_entrada_errada_falha_a_mae_e_cancelar_a_mae_cancela_a_filha(cliente, sessao) -> None:
    filho = _publicado(cliente, "Conferir empresa (entradas)", FILHO)
    sem_entrada = _publicado(cliente, "Chama sem a empresa", {"contrato": "fluxo/v1", "corpo": [
        {"id": "c1", "tipo": "chamar_subfluxo", "fluxo": filho}]})
    eid = cliente.post(f"{API}/{sem_entrada}/executar", json={}).json()["id"]
    _avancar(sessao)
    falhou = cliente.get(f"{API}/execucoes/{eid}").json()
    assert falhou["situacao"] == "falhou" and "Falta a entrada Empresa" in falhou["motivo"]

    demorado = _publicado(cliente, "Demorado", DEMORADO)
    mae = _publicado(cliente, "Chama o demorado", {"contrato": "fluxo/v1", "corpo": [
        {"id": "m1", "tipo": "chamar_subfluxo", "fluxo": demorado}]})
    eid = cliente.post(f"{API}/{mae}/executar", json={}).json()["id"]
    _avancar(sessao, vezes=2)
    filha_id = cliente.get(f"{API}/execucoes/{eid}").json()["agora"]["execucao"]
    assert cliente.get(f"{API}/execucoes/{filha_id}").json()["situacao"] == "esperando"
    cancelada = cliente.post(f"{API}/execucoes/{eid}/cancelar")
    assert cancelada.status_code == 200, cancelada.text
    assert any(p["resumo"] == "O fluxo chamado foi cancelado." for p in cancelada.json()["passos"])
    filha = cliente.get(f"{API}/execucoes/{filha_id}").json()
    assert filha["situacao"] == "cancelada" and filha["motivo"] == "O fluxo que chamou foi cancelado."
