"""Decisões de fluxo (Fase 5): o bloco "Perguntar a uma pessoa" espera alguém responder.

- Só quem foi perguntado (ou um administrador) responde.
- **Vale a primeira resposta** (trava da linha): quem chegar depois vê quem respondeu, quando e por onde.
- Responder acorda o fluxo na hora (``acordar_em`` = agora); a tarefa periódica segue pelo ramo.
- Aparecem na página Pendências e o e-mail leva a ``/pendencias/decisoes/{id}?opcao=N``.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Callable
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from modules.governance.domain.audit import AuditEvent
from modules.orchestration.fluxos.aplicacao import FluxoNaoEncontrado, PedidoInvalido
from modules.orchestration.fluxos.modelos import FluxoDecisaoRecord, FluxoExecucaoRecord, FluxoRecord


class SemPermissao(PermissionError):
    pass


class JaRespondida(Exception):
    def __init__(self, resolucao: dict[str, Any]) -> None:
        super().__init__("Esta pergunta já foi respondida.")
        self.resolucao = resolucao


def _eh_admin(user: Any) -> bool:
    papel = getattr(user, "role", None)
    return getattr(papel, "slug", papel) == "admin"


def _nome(user: Any) -> str:
    return str(getattr(user, "name", None) or getattr(user, "email", None) or getattr(user, "id", ""))


class Decisoes:
    def __init__(self, db: Session, auditoria: Any, agora: Callable[[], datetime] | None = None) -> None:
        self.db = db
        self.auditoria = auditoria
        self._agora = agora or (lambda: datetime.now(UTC))

    def listar(self, user: Any) -> list[dict[str, Any]]:
        abertas = self.db.scalars(select(FluxoDecisaoRecord).where(FluxoDecisaoRecord.situacao == "aguardando")
                                  .order_by(FluxoDecisaoRecord.criada_em))
        return [self._dados(d, user) for d in abertas if self._pode(d, user)]

    def obter(self, user: Any, decisao_id: str) -> dict[str, Any]:
        decisao = self.db.get(FluxoDecisaoRecord, decisao_id)
        if decisao is None:
            raise FluxoNaoEncontrado("Pergunta não encontrada.")
        if not self._pode(decisao, user):
            raise SemPermissao("Esta pergunta não foi feita para você.")
        return self._dados(decisao, user)

    def responder(self, user: Any, decisao_id: str, opcao: Any, via: str = "portal") -> dict[str, Any]:
        decisao = self.db.scalar(select(FluxoDecisaoRecord).where(FluxoDecisaoRecord.id == decisao_id).with_for_update())
        if decisao is None:
            raise FluxoNaoEncontrado("Pergunta não encontrada.")
        if not self._pode(decisao, user):
            raise SemPermissao("Esta pergunta não foi feita para você.")
        if decisao.situacao != "aguardando":
            raise JaRespondida(self._resolucao(decisao))
        if not isinstance(opcao, int) or isinstance(opcao, bool) or not 0 <= opcao < len(decisao.opcoes):
            raise PedidoInvalido("Escolha uma das opções.")
        agora = self._agora()
        decisao.situacao, decisao.resposta, decisao.respondida_em = "respondida", opcao, agora
        decisao.respondida_por, decisao.respondida_via = _nome(user)[:120], "email" if via == "email" else "portal"
        execucao = self.db.get(FluxoExecucaoRecord, decisao.execucao_id)
        if execucao is not None and execucao.situacao == "esperando":
            execucao.acordar_em = agora  # a próxima volta da tarefa já segue pelo ramo escolhido
        self.auditoria.append(AuditEvent(
            id=f"aud_{uuid4().hex}", actor_type="user", actor_id=str(getattr(user, "id", "")) or None,
            action="fluxo.decisao_respondida", resource_type="fluxo_execucao", resource_id=decisao.execucao_id,
            after={"decisao": decisao.id, "resposta": decisao.opcoes[opcao], "via": decisao.respondida_via},
            occurred_at=agora))
        self.db.flush()
        return self._dados(decisao, user)

    # -- apoio -------------------------------------------------------------------------
    def _pode(self, decisao: FluxoDecisaoRecord, user: Any) -> bool:
        return _eh_admin(user) or getattr(user, "id", None) in (decisao.destinatarios or [])

    @staticmethod
    def _resolucao(decisao: FluxoDecisaoRecord) -> dict[str, Any]:
        return {"situacao": decisao.situacao, "resposta": decisao.opcoes[decisao.resposta] if decisao.resposta is not None else None,
                "respondida_por": decisao.respondida_por, "respondida_em": decisao.respondida_em,
                "respondida_via": decisao.respondida_via}

    def _dados(self, decisao: FluxoDecisaoRecord, user: Any) -> dict[str, Any]:
        fluxo = self.db.get(FluxoRecord, decisao.fluxo_id)
        return {"id": decisao.id, "fluxo": {"id": decisao.fluxo_id, "nome": fluxo.nome if fluxo else None},
                "execucao_id": decisao.execucao_id, "pergunta": decisao.pergunta, "opcoes": decisao.opcoes,
                "desde": decisao.criada_em, "pode_responder": decisao.situacao == "aguardando" and self._pode(decisao, user),
                **self._resolucao(decisao)}
