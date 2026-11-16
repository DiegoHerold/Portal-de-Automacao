"""Fluxos em blocos: subfluxos (Fase 7, 13/11/2026).

- ``fluxo_execucoes.execucao_pai_id``: o bloco "Chamar outro fluxo" cria uma execução filha, ligada à
  execução que chamou (e ao bloco, em ``bloco_pai``). Cancelar a mãe cancela a filha.

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "c5d6e7f8a9b0"
down_revision = "b4c5d6e7f8a9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("fluxo_execucoes", sa.Column("execucao_pai_id", sa.String(40),
                                               sa.ForeignKey("fluxo_execucoes.id", ondelete="CASCADE"), nullable=True))
    op.add_column("fluxo_execucoes", sa.Column("bloco_pai", sa.String(80), nullable=True))
    op.create_index("ix_fluxo_execucoes_execucao_pai_id", "fluxo_execucoes", ["execucao_pai_id"])


def downgrade() -> None:
    op.drop_index("ix_fluxo_execucoes_execucao_pai_id", table_name="fluxo_execucoes")
    op.drop_column("fluxo_execucoes", "bloco_pai")
    op.drop_column("fluxo_execucoes", "execucao_pai_id")
