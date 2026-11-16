"""Fluxos em blocos, Fase 4, no PostgreSQL: executar e dividir automação pela fila de verdade,
resultado pelos jobs e itens, partes do trabalho (``_parte``), cancelamento em cascata, avisos e a
permissão de quem disparou."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import text

from tests.db.semente import automacao, publicar
from tests.db.test_fase4_acompanhar import como

API = "/api/v1/fluxos"
txt = lambda v: {"tipo": "texto", "valor": v}  # noqa: E731
var = lambda n: {"tipo": "var", "nome": n}  # noqa: E731
EMPRESAS = [{"nome": "empresas", "tipo": {"lista": "texto"}, "obrigatoria": True}]


def _automacao_com_chave(sessao, chave: str, partes: bool = False) -> int:
    automation_id, version_id = automacao(sessao)
    publicar(sessao, version_id)
    sessao.execute(text("UPDATE automations SET key = :k WHERE id = :a"), {"k": chave, "a": automation_id})
    if partes:
        sessao.execute(text("UPDATE automation_versions SET manifest = jsonb_set(manifest, '{execution,split_work}', 'true')"
                            " WHERE id = :v"), {"v": version_id})
    sessao.commit()
    return automation_id


def _publicado(cliente, programa: dict) -> str:
    fid = cliente.post(API, json={"nome": "Fluxo com automação"}).json()["id"]
    erros = cliente.put(f"{API}/{fid}/rascunho", json=programa).json()["erros"]
    assert erros == [], erros
    assert cliente.post(f"{API}/{fid}/publicar").status_code == 201
    return fid


def _avancar(sessao, minutos: float = 0) -> None:
    from modules.governance.infrastructure.adapters import build_governance_adapters
    from modules.orchestration.fluxos.execucoes import Execucoes, limites_do_portal

    agora = datetime.now(UTC) + timedelta(minutes=minutos)
    Execucoes(sessao, build_governance_adapters(sessao).audit, limites_do_portal(sessao), agora=lambda: agora).avancar_prontas()
    sessao.commit()


def _jobs(sessao, eid: str) -> list[str]:
    espera = sessao.execute(text("SELECT estado->'espera' FROM fluxo_execucoes WHERE id = :e"), {"e": eid}).scalar_one()
    return [j["job"] for j in espera["jobs"]]


def _terminar(sessao, job: str, status: str, itens: dict[str, str]) -> None:
    sessao.execute(text("UPDATE task_executions SET status = :s, completed_at = now() WHERE id = :t"), {"s": status, "t": job})
    for chave, situacao in itens.items():
        sessao.execute(text("UPDATE execution_items SET status = :s WHERE task_execution_id = :t AND item_key = :k"),
                       {"s": situacao, "t": job, "k": chave})
    sessao.commit()


def test_executar_pela_fila_e_resultado_pelos_itens(cliente, sessao) -> None:
    _automacao_com_chave(sessao, "integracao_fluxo_a")
    fid = _publicado(cliente, {"contrato": "fluxo/v1", "entradas": EMPRESAS, "variaveis": [{"nome": "r", "tipo": "resultado"}],
                               "corpo": [
        {"id": "b1", "tipo": "executar_automacao", "automacao": "integracao_fluxo_a", "guardar_em": "r",
         "itens": {"tipo": "entrada", "nome": "empresas"}, "parametros": {"competencia": txt("10/2026")}},
        {"id": "b2", "tipo": "concluir", "valor": var("r")}]})
    eid = cliente.post(f"{API}/{fid}/executar", json={"entradas": {"empresas": ["8010", "8020"]}}).json()["id"]
    _avancar(sessao)
    detalhe = cliente.get(f"{API}/execucoes/{eid}").json()
    assert detalhe["situacao"] == "esperando" and detalhe["bloco_atual"] == "b1"
    jobs = _jobs(sessao, eid)
    assert len(jobs) == 2  # a fila já faz um job por item
    origem = sessao.execute(text("SELECT DISTINCT e.origin FROM orchestration_executions e JOIN task_executions t"
                                 " ON t.execution_id = e.id WHERE t.id = ANY(:j)"), {"j": jobs}).scalars().all()
    assert origem == ["flow"]
    parametros = sessao.execute(text("SELECT parameters FROM task_executions WHERE id = :t"), {"t": jobs[0]}).scalar_one()
    assert parametros == {"competencia": "10/2026"}

    _avancar(sessao, 1)  # ainda rodando: segue esperando
    assert cliente.get(f"{API}/execucoes/{eid}").json()["situacao"] == "esperando"
    _terminar(sessao, jobs[0], "succeeded", {"8010": "ok"})
    _terminar(sessao, jobs[1], "failed", {"8020": "erro"})
    _avancar(sessao, 2)
    fim = cliente.get(f"{API}/execucoes/{eid}").json()
    assert fim["situacao"] == "concluida", fim
    r = fim["resultado"]
    assert (r["situacao"], r["itens_ok"], r["itens_com_erro"], r["total_ok"], r["total_com_erro"]) == ("parcial", ["8010"], ["8020"], 1, 1)


def test_dividir_por_itens_e_por_partes_do_trabalho(cliente, sessao) -> None:
    _automacao_com_chave(sessao, "integracao_sem_partes")
    _automacao_com_chave(sessao, "integracao_com_partes", partes=True)
    por_itens = _publicado(cliente, {"contrato": "fluxo/v1", "entradas": EMPRESAS, "corpo": [
        {"id": "d1", "tipo": "dividir_automacao", "automacao": "integracao_sem_partes", "modo": "itens",
         "itens": {"tipo": "entrada", "nome": "empresas"}, "partes": 2}]})
    eid = cliente.post(f"{API}/{por_itens}/executar", json={"entradas": {"empresas": ["1", "2", "3", "4", "5"]}}).json()["id"]
    _avancar(sessao)
    jobs = _jobs(sessao, eid)
    tamanhos = sorted(sessao.execute(text("SELECT count(*) FROM execution_items WHERE task_execution_id = ANY(:j)"
                                          " GROUP BY task_execution_id"), {"j": jobs}).scalars().all())
    assert len(jobs) == 2 and tamanhos == [2, 3]  # 5 itens em 2 partes, numa execução só

    def por_partes(automacao_chave: str) -> str:
        return _publicado(cliente, {"contrato": "fluxo/v1", "variaveis": [{"nome": "r", "tipo": "resultado"}],
                                    "entradas": [{"nome": "arquivos", "tipo": {"lista": "texto"}}], "corpo": [
            {"id": "d1", "tipo": "dividir_automacao", "automacao": automacao_chave, "modo": "fatias", "item": txt("PLANET"),
             "fatias": {"tipo": "entrada", "nome": "arquivos"}, "partes": 5, "guardar_em": "r"},
            {"id": "d2", "tipo": "concluir", "valor": {"tipo": "campo", "de": var("r"), "campo": "fatias_com_erro"}}]})

    arquivos = [f"{i:02d}.txt" for i in range(1, 51)]
    recusada = cliente.post(f"{API}/{por_partes('integracao_sem_partes')}/executar", json={"entradas": {"arquivos": arquivos}}).json()["id"]
    _avancar(sessao)
    falha = cliente.get(f"{API}/execucoes/{recusada}").json()
    assert falha["situacao"] == "falhou" and "não aceita rodar em partes" in falha["motivo"]

    eid = cliente.post(f"{API}/{por_partes('integracao_com_partes')}/executar", json={"entradas": {"arquivos": arquivos}}).json()["id"]
    _avancar(sessao)
    jobs = _jobs(sessao, eid)
    partes = sessao.execute(text("SELECT parameters->'_parte' FROM task_executions WHERE id = ANY(:j)"), {"j": jobs}).scalars().all()
    assert len(jobs) == 5 and sorted(p["indice"] for p in partes) == [1, 2, 3, 4, 5]
    assert all(p["total"] == 5 and len(p["fatias"]) == 10 for p in partes)
    for job in jobs:
        _terminar(sessao, job, "succeeded", {"PLANET": "ok"})
    terceira = next(p for p in partes if p["indice"] == 3)
    falhou = sessao.execute(text("SELECT id FROM task_executions WHERE id = ANY(:j) AND parameters->'_parte'->>'indice' = '3'"),
                            {"j": jobs}).scalar_one()
    _terminar(sessao, falhou, "failed", {"PLANET": "erro"})
    _avancar(sessao, 1)
    fim = cliente.get(f"{API}/execucoes/{eid}").json()
    assert fim["situacao"] == "concluida" and fim["resultado"] == terceira["fatias"]


def test_cancelar_o_fluxo_para_a_automacao_e_avisar(cliente, sessao) -> None:
    _automacao_com_chave(sessao, "integracao_cancelar")
    fid = _publicado(cliente, {"contrato": "fluxo/v1", "entradas": EMPRESAS, "corpo": [
        {"id": "a1", "tipo": "avisar", "para": {"tipo": "quem_executou"}, "texto": txt("Começou o fechamento")},
        {"id": "b1", "tipo": "executar_automacao", "automacao": "integracao_cancelar", "itens": {"tipo": "entrada", "nome": "empresas"}}]})
    eid = cliente.post(f"{API}/{fid}/executar", json={"entradas": {"empresas": ["9001"]}}).json()["id"]
    _avancar(sessao)
    aviso = sessao.execute(text("SELECT n.titulo, n.texto, d.user_id FROM notifications n JOIN notification_deliveries d"
                                " ON d.notification_id = n.id WHERE n.chave LIKE :c"), {"c": f"fluxo:{eid}:a1:%"}).one()
    assert aviso.texto == "Começou o fechamento" and aviso.user_id == 1 and aviso.titulo.startswith("Fluxo ")
    jobs = _jobs(sessao, eid)
    cancelada = cliente.post(f"{API}/execucoes/{eid}/cancelar").json()
    assert cancelada["situacao"] == "cancelada"
    assert any("paradas" in p["resumo"] for p in cancelada["passos"])
    sessao.expire_all()
    status = sessao.execute(text("SELECT status FROM task_executions WHERE id = ANY(:j)"), {"j": jobs}).scalars().all()
    assert status == ["cancelled"]


def test_quem_disparou_precisa_poder_executar_a_automacao(cliente, sessao) -> None:
    _automacao_com_chave(sessao, "integracao_restrita")
    fid = _publicado(cliente, {"contrato": "fluxo/v1", "corpo": [
        {"id": "b1", "tipo": "executar_automacao", "automacao": "integracao_restrita"}]})
    role = sessao.execute(text("SELECT id FROM roles WHERE slug = 'sem_permissao_fluxos'")).scalar()
    if role is None:  # papel sem nenhuma permissão (nem a legada de executar por categoria)
        role = sessao.execute(text("INSERT INTO roles (name, slug, status, is_system) VALUES ('Sem permissão', 'sem_permissao_fluxos',"
                                   " 'active', false) RETURNING id")).scalar_one()
    uid = sessao.execute(text("INSERT INTO users (name, email, password_hash, role_id, status, is_active)"
                              " VALUES ('Gestor de fluxos', 'gestor.fluxos@teste.invalid', 'x', :r, 'active', true) RETURNING id"),
                         {"r": role}).scalar_one()
    sessao.commit()
    with como(cliente, uid, "admin"):  # pode mexer em fluxos, mas o cadastro dele não executa a automação
        eid = cliente.post(f"{API}/{fid}/executar", json={}).json()["id"]
    _avancar(sessao)
    fim = cliente.get(f"{API}/execucoes/{eid}").json()
    assert fim["situacao"] == "falhou" and "não pode executar" in fim["motivo"]
