"""Leituras e gravações dos fluxos em blocos (tabelas ``fluxos`` e ``fluxo_versoes``)."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from modules.orchestration.fluxos.domain.validador import subfluxos_chamados
from modules.orchestration.fluxos.modelos import FluxoRecord, FluxoVersaoRecord


class SqlAlchemyFluxos:
    def __init__(self, db: Session) -> None:
        self.db = db

    def todos(self, incluir_arquivados: bool) -> list[FluxoRecord]:
        consulta = select(FluxoRecord).order_by(func.lower(FluxoRecord.nome))
        if not incluir_arquivados:
            consulta = consulta.where(FluxoRecord.situacao == "ativo")
        return list(self.db.scalars(consulta))

    def obter(self, fluxo_id: str) -> FluxoRecord | None:
        return self.db.get(FluxoRecord, fluxo_id)

    def criar(self, nome: str, descricao: str | None, rascunho: dict[str, Any], por: str | None, agora: datetime) -> FluxoRecord:
        fluxo = FluxoRecord(id=f"flx_{uuid4().hex[:20]}", nome=nome, descricao=descricao, situacao="ativo", rascunho=rascunho,
                            rascunho_atualizado_em=agora, rascunho_atualizado_por=por, criado_por=por, criado_em=agora,
                            atualizado_em=agora)
        self.db.add(fluxo)
        self.db.flush()
        return fluxo

    def gravar(self, fluxo: FluxoRecord, agora: datetime, **campos: Any) -> None:
        for nome, valor in campos.items():
            setattr(fluxo, nome, valor)
        fluxo.atualizado_em = agora
        self.db.flush()

    def versoes(self, fluxo_id: str) -> list[FluxoVersaoRecord]:
        return list(self.db.scalars(select(FluxoVersaoRecord).where(FluxoVersaoRecord.fluxo_id == fluxo_id)
                                    .order_by(FluxoVersaoRecord.numero.desc())))

    def versao(self, fluxo_id: str, numero: int) -> FluxoVersaoRecord | None:
        return self.db.scalar(select(FluxoVersaoRecord).where(FluxoVersaoRecord.fluxo_id == fluxo_id,
                                                              FluxoVersaoRecord.numero == numero))

    def ultima_versao(self, fluxo_id: str) -> FluxoVersaoRecord | None:
        return self.db.scalar(select(FluxoVersaoRecord).where(FluxoVersaoRecord.fluxo_id == fluxo_id)
                              .order_by(FluxoVersaoRecord.numero.desc()).limit(1))

    def ultimas_por_fluxo(self, ids: list[str]) -> dict[str, FluxoVersaoRecord]:
        if not ids:
            return {}
        saida: dict[str, FluxoVersaoRecord] = {}
        for versao in self.db.scalars(select(FluxoVersaoRecord).where(FluxoVersaoRecord.fluxo_id.in_(ids))
                                      .order_by(FluxoVersaoRecord.fluxo_id, FluxoVersaoRecord.numero.desc())):
            saida.setdefault(versao.fluxo_id, versao)
        return saida

    def publicar(self, fluxo: FluxoRecord, ast: dict[str, Any], notas: str | None, por: str | None,
                 agora: datetime) -> FluxoVersaoRecord:
        atual = self.db.scalar(select(func.max(FluxoVersaoRecord.numero)).where(FluxoVersaoRecord.fluxo_id == fluxo.id))
        versao = FluxoVersaoRecord(id=f"flv_{uuid4().hex[:20]}", fluxo_id=fluxo.id, numero=int(atual or 0) + 1, ast=ast,
                                   notas=notas, publicada_por=por, publicada_em=agora)
        self.db.add(versao)
        fluxo.atualizado_em = agora
        self.db.flush()
        return versao


class ContextoDoPortal:
    """O que o validador consulta: automações do Catálogo, subfluxos publicados e o limite de blocos."""

    def __init__(self, db: Session) -> None:
        from modules.governance.infrastructure.limites import ler_limite

        self.db = db
        self.repo = SqlAlchemyFluxos(db)
        self.max_blocos = ler_limite(db, "fluxo.max_blocos")

    def automacao_existe(self, chave: str) -> bool:
        from modules.catalog.infrastructure.orm.models import CatalogAutomationRecord

        return self.db.scalar(select(CatalogAutomationRecord.id).where(CatalogAutomationRecord.key == chave).limit(1)) is not None

    def subfluxo(self, fluxo_id: str) -> tuple[bool, set[str]]:
        fluxo = self.repo.obter(fluxo_id)
        versao = self.repo.ultima_versao(fluxo_id) if fluxo is not None and fluxo.situacao == "ativo" else None
        if versao is None:
            return False, set()
        return True, subfluxos_chamados(versao.ast)
