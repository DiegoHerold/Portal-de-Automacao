"""Fluxos em blocos, Fase 5, no PostgreSQL: "Perguntar a uma pessoa" cria a decisão, avisa no sino e
por e-mail (um botão por opção), só quem foi perguntado responde, vale a primeira resposta, o fluxo
segue pelo ramo escolhido e cancelar o fluxo cancela a pergunta."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import text

from tests.db.test_fase4_acompanhar import como

API = "/api/v1/fluxos"
txt = lambda v: {"tipo": "texto", "valor": v}  # noqa: E731

PERGUNTA = {"contrato": "fluxo/v1", "variaveis": [{"nome": "escolha", "tipo": "texto"}], "corpo": [
    {"id": "p1", "tipo": "perguntar", "para": {"tipo": "quem_executou"}, "pergunta": txt("Sobraram arquivos com erro. O que fazer?"),
     "guardar_em": "escolha", "opcoes": [
         {"rotulo": "tentar de novo", "corpo": [{"id": "a1", "tipo": "concluir", "valor": txt("repetiu")}]},
         {"rotulo": "encerrar", "corpo": [{"id": "b1", "tipo": "falhar", "motivo": txt("Encerrado por uma pessoa")}]}]},
    {"id": "fim", "tipo": "concluir", "valor": txt("não chega aqui")}]}


def _publicado(cliente) -> str:
    fid = cliente.post(API, json={"nome": "Decisão da Planet"}).json()["id"]
    assert cliente.put(f"{API}/{fid}/rascunho", json=PERGUNTA).json()["erros"] == []
    assert cliente.post(f"{API}/{fid}/publicar").status_code == 201
    return fid


def _avancar(sessao, minutos: float = 0) -> None:
    from modules.governance.infrastructure.adapters import build_governance_adapters
    from modules.orchestration.fluxos.execucoes import Execucoes, limites_do_portal

    agora = datetime.now(UTC) + timedelta(minutes=minutos)
    Execucoes(sessao, build_governance_adapters(sessao).audit, limites_do_portal(sessao), agora=lambda: agora).avancar_prontas()
    sessao.commit()


def _decisao(sessao, eid: str) -> str:
    return sessao.execute(text("SELECT id FROM fluxo_decisoes WHERE execucao_id = :e"), {"e": eid}).scalar_one()


def test_perguntar_avisar_responder_uma_vez_e_seguir_pelo_ramo(cliente, sessao) -> None:
    fid = _publicado(cliente)
    eid = cliente.post(f"{API}/{fid}/executar", json={}).json()["id"]
    _avancar(sessao)
    detalhe = cliente.get(f"{API}/execucoes/{eid}").json()
    assert detalhe["situacao"] == "esperando" and detalhe["bloco_atual"] == "p1"
    did = _decisao(sessao, eid)

    # Sino e e-mail (correio central) com um botão por opção, que leva ao Portal.
    aviso = sessao.execute(text("SELECT n.link, d.user_id FROM notifications n JOIN notification_deliveries d ON d.notification_id = n.id"
                                " WHERE n.chave = :c"), {"c": f"decisao:{did}"}).one()
    assert aviso.link == f"/pendencias/decisoes/{did}" and aviso.user_id == 1
    corpo = sessao.execute(text("SELECT html FROM emails WHERE tipo = 'decisao_de_fluxo' ORDER BY criado_em DESC LIMIT 1")).scalar_one()
    assert f"/pendencias/decisoes/{did}?opcao=0" in corpo and f"/pendencias/decisoes/{did}?opcao=1" in corpo
    assert "tentar de novo" in corpo and "encerrar" in corpo

    # Aparece nas pendências de quem foi perguntado; outra pessoa não vê nem responde.
    abertas = cliente.get(f"{API}/decisoes").json()["decisoes"]
    assert [d["id"] for d in abertas] == [did] and abertas[0]["opcoes"] == ["tentar de novo", "encerrar"]
    with como(cliente, 4242, "operator"):
        assert cliente.get(f"{API}/decisoes").json()["decisoes"] == []
        assert cliente.post(f"{API}/decisoes/{did}/responder", json={"opcao": 0}).status_code == 403
    assert cliente.post(f"{API}/decisoes/{did}/responder", json={"opcao": 7}).status_code == 422

    # A primeira resposta vale e acorda o fluxo; a segunda recebe quem, quando e por onde.
    r = cliente.post(f"{API}/decisoes/{did}/responder", json={"opcao": 1, "via": "email"})
    assert r.status_code == 200 and r.json()["resposta"] == "encerrar" and r.json()["respondida_via"] == "email"
    segunda = cliente.post(f"{API}/decisoes/{did}/responder", json={"opcao": 0})
    assert segunda.status_code == 409
    assert segunda.json()["error"]["details"]["resolucao"]["resposta"] == "encerrar"
    _avancar(sessao)  # acordar_em = agora: a próxima volta já segue
    fim = cliente.get(f"{API}/execucoes/{eid}").json()
    assert fim["situacao"] == "falhou" and fim["motivo"] == "Encerrado por uma pessoa"
    assert fim["variaveis"]["escolha"] == "encerrar"
    assert any(p["resumo"].startswith("Respondido por") and p["resumo"].endswith("encerrar") for p in fim["passos"])
    assert cliente.get(f"{API}/decisoes").json()["decisoes"] == []
    assert sessao.execute(text("SELECT count(*) FROM audit_events WHERE action = 'fluxo.decisao_respondida' AND resource_id = :e"),
                          {"e": eid}).scalar_one() == 1


def test_cancelar_o_fluxo_cancela_a_pergunta(cliente, sessao) -> None:
    fid = _publicado(cliente)
    eid = cliente.post(f"{API}/{fid}/executar", json={}).json()["id"]
    _avancar(sessao)
    did = _decisao(sessao, eid)
    assert cliente.post(f"{API}/execucoes/{eid}/cancelar").json()["situacao"] == "cancelada"
    situacao = sessao.execute(text("SELECT situacao FROM fluxo_decisoes WHERE id = :d"), {"d": did}).scalar_one()
    assert situacao == "cancelada"
    assert cliente.post(f"{API}/decisoes/{did}/responder", json={"opcao": 0}).status_code == 409
