"""Limpeza do sistema nos fluxos em blocos (regra ``fluxos.passos`` do catálogo de configurações)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from modules.orchestration.fluxos.modelos import FluxoExecucaoRecord, FluxoPassoRecord
from modules.shared.infrastructure.limpeza import apagar_em_lote


def passos(db: Session, corte: datetime, lote: int) -> int:
    """Passos de execuções terminadas antes do corte. A execução (situação e resultado) fica."""
    terminadas = select(FluxoExecucaoRecord.id).where(FluxoExecucaoRecord.terminado_em < corte)
    return apagar_em_lote(db, FluxoPassoRecord.id, FluxoPassoRecord.execucao_id.in_(terminadas), lote=lote)
