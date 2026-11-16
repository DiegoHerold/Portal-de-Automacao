"""Fluxos em blocos, Fase 2, no PostgreSQL: criar, rascunho com erros, publicar versões imutáveis,
subfluxo, arquivar, limite de blocos, permissão e auditoria."""

from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import text

from tests.db.semente import automacao
from tests.db.test_fase4_acompanhar import como

EXEMPLOS = Path(__file__).resolve().parents[3] / "contracts" / "flows" / "v1" / "examples"
API = "/api/v1/fluxos"


def _exemplo(nome: str) -> dict:
    return json.loads((EXEMPLOS / nome).read_text(encoding="utf-8"))


def _com_integracao(sessao) -> None:
    """A chave da automação é única: cria a automação de teste uma vez só."""
    if sessao.execute(text("SELECT 1 FROM automations WHERE key = 'integracao_contabil'")).first():
        return
    automation_id, _ = automacao(sessao)
    sessao.execute(text("UPDATE automations SET key = 'integracao_contabil' WHERE id = :a"), {"a": automation_id})
    sessao.commit()


def _erro(resposta) -> str:
    return resposta.json()["error"]["message"]


def test_ciclo_do_fluxo_rascunho_publicar_versoes(cliente, sessao) -> None:
    _com_integracao(sessao)
    assert cliente.post(API, json={"nome": "  "}).status_code == 422
    criado = cliente.post(API, json={"nome": "Integração da Planet", "descricao": "50 TXT em 5 máquinas"})
    assert criado.status_code == 201, criado.text
    fluxo = criado.json()
    fid = fluxo["id"]
    assert fluxo["rascunho"]["contrato"] == "fluxo/v1" and fluxo["erros"] == [] and fluxo["versao_publicada"] is None

    # Vazio não publica; rascunho com erro grava e devolve o erro no bloco.
    assert "vazio" in _erro(cliente.post(f"{API}/{fid}/publicar"))
    quebrado = _exemplo("planet-em-5-maquinas.json")
    quebrado["corpo"][1]["variavel"] = "nao_declarada"
    r = cliente.put(f"{API}/{fid}/rascunho", json=quebrado)
    assert r.status_code == 200 and r.json()["erros"][0]["bloco"] == "b2"
    recusa = cliente.post(f"{API}/{fid}/publicar")
    assert recusa.status_code == 422 and recusa.json()["error"]["details"]["erros"][0]["bloco"] == "b2"
    assert cliente.post(f"{API}/{fid}/validar", json=_exemplo("planet-em-5-maquinas.json")).json()["erros"] == []

    # Corrigido: versão 1; nada mudou: recusa; mudou: versão 2. A versão 1 não muda.
    assert cliente.put(f"{API}/{fid}/rascunho", json=_exemplo("planet-em-5-maquinas.json")).json()["erros"] == []
    v1 = cliente.post(f"{API}/{fid}/publicar", json={"notas": "primeira"})
    assert v1.status_code == 201 and v1.json()["numero"] == 1, v1.text
    assert "Nada mudou" in _erro(cliente.post(f"{API}/{fid}/publicar"))
    novo = _exemplo("planet-em-5-maquinas.json")
    novo["corpo"][0]["partes"] = 4
    cliente.put(f"{API}/{fid}/rascunho", json=novo)
    assert next(f for f in cliente.get(API).json()["fluxos"] if f["id"] == fid)["rascunho_mudou"] is True
    assert cliente.post(f"{API}/{fid}/publicar").json()["numero"] == 2
    assert cliente.get(f"{API}/{fid}/versoes/1").json()["ast"]["corpo"][0]["partes"] == 5
    detalhe = cliente.get(f"{API}/{fid}").json()
    assert [v["numero"] for v in detalhe["versoes"]] == [2, 1] and detalhe["versao_publicada"] == 2
    assert cliente.get(f"{API}/{fid}/versoes/9").status_code == 404

    acoes = sessao.execute(text("SELECT action FROM audit_events WHERE resource_type = 'fluxo' AND resource_id = :f"
                                " ORDER BY occurred_at"), {"f": fid}).scalars().all()
    assert acoes == ["fluxo.criado", "fluxo.publicado", "fluxo.publicado"]


def test_subfluxo_arquivar_e_limite_de_blocos(cliente, sessao) -> None:
    _com_integracao(sessao)
    filho = cliente.post(API, json={"nome": "Avisar o time"}).json()["id"]
    pai = cliente.post(API, json={"nome": "Fechamento"}).json()["id"]
    chama_filho = {"contrato": "fluxo/v1", "corpo": [{"id": "s1", "tipo": "chamar_subfluxo", "fluxo": filho}]}
    assert "ainda não tem versão publicada" in cliente.put(f"{API}/{pai}/rascunho", json=chama_filho).json()["erros"][0]["mensagem"]
    cliente.put(f"{API}/{filho}/rascunho", json={"contrato": "fluxo/v1", "corpo": [
        {"id": "a1", "tipo": "registrar", "texto": {"tipo": "texto", "valor": "oi"}}]})
    assert cliente.post(f"{API}/{filho}/publicar").status_code == 201
    assert cliente.put(f"{API}/{pai}/rascunho", json=chama_filho).json()["erros"] == []
    assert cliente.post(f"{API}/{pai}/publicar").status_code == 201
    # O filho não pode passar a chamar o pai (circular).
    volta = {"contrato": "fluxo/v1", "corpo": [{"id": "a1", "tipo": "chamar_subfluxo", "fluxo": pai}]}
    assert "circular" in cliente.put(f"{API}/{filho}/rascunho", json=volta).json()["erros"][0]["mensagem"]

    # Arquivar: some da lista, não publica e deixa de valer como subfluxo.
    assert cliente.put(f"{API}/{filho}", json={"situacao": "arquivado"}).json()["situacao"] == "arquivado"
    assert filho not in {f["id"] for f in cliente.get(API).json()["fluxos"]}
    assert filho in {f["id"] for f in cliente.get(API, params={"arquivados": "true"}).json()["fluxos"]}
    assert "arquivado" in _erro(cliente.post(f"{API}/{filho}/publicar"))
    assert cliente.get(f"{API}/{pai}").json()["erros"][0]["bloco"] == "s1"

    # Limite de blocos (Governança > Limites).
    from modules.governance.domain.configuracoes import limite
    from modules.governance.infrastructure.repositories.sqlalchemy_configuracoes import SqlAlchemyConfiguracoes

    SqlAlchemyConfiguracoes(sessao).gravar_limite(limite("fluxo.max_blocos"), 10)
    sessao.commit()
    try:
        grande = {"contrato": "fluxo/v1", "corpo": [
            {"id": f"r{i}", "tipo": "registrar", "texto": {"tipo": "texto", "valor": "x"}} for i in range(6)]}
        assert "o limite é 10" in cliente.put(f"{API}/{pai}/rascunho", json=grande).json()["erros"][0]["mensagem"]
    finally:
        SqlAlchemyConfiguracoes(sessao).gravar_limite(limite("fluxo.max_blocos"), 500)
        sessao.commit()


def test_contrato_e_permissoes(cliente, sessao) -> None:
    contrato = cliente.get(f"{API}/contrato").json()
    assert contrato["properties"]["contrato"]["const"] == "fluxo/v1"
    with como(cliente, 999, "sem_permissao"):
        assert cliente.get(API).status_code == 403
        assert cliente.post(API, json={"nome": "x"}).status_code == 403
