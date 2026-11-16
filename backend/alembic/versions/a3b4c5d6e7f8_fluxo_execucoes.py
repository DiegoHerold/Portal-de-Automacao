"""Fluxos em blocos: execuções e passos (Fase 3, 13/11/2026).

- ``fluxo_execucoes``: uma execução de uma versão publicada; ``estado`` é o do motor (variáveis e
  pilha de quadros), gravado a cada fatia; ``pedido`` (cancelar/pausar) vale na próxima fatia.
- ``fluxo_passos``: a linha do tempo (bloco, resumo, nível), com regra de limpeza no catálogo.

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "a3b4c5d6e7f8"
down_revision = "f2a3b4c5d6e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fluxo_execucoes",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("fluxo_id", sa.String(40), sa.ForeignKey("fluxos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("versao_id", sa.String(40), sa.ForeignKey("fluxo_versoes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("versao_numero", sa.Integer(), nullable=False),
        sa.Column("situacao", sa.String(20), nullable=False),
        sa.Column("pedido", sa.String(20), nullable=True),
        sa.Column("entradas", JSONB(), nullable=False),
        sa.Column("estado", JSONB(), nullable=False),
        sa.Column("resultado", JSONB(), nullable=True),
        sa.Column("motivo", sa.Text(), nullable=True),
        sa.Column("bloco_atual", sa.String(80), nullable=True),
        sa.Column("passos_dados", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("acordar_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("origem", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("disparado_por", sa.String(120), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("terminado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_fluxo_execucoes_fluxo_id", "fluxo_execucoes", ["fluxo_id"])
    op.create_index("ix_fluxo_execucoes_situacao", "fluxo_execucoes", ["situacao"])
    op.create_index("ix_fluxo_execucoes_acordar_em", "fluxo_execucoes", ["acordar_em"])
    op.create_table(
        "fluxo_passos",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("execucao_id", sa.String(40), sa.ForeignKey("fluxo_execucoes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("bloco", sa.String(80), nullable=True),
        sa.Column("tipo", sa.String(40), nullable=False),
        sa.Column("resumo", sa.Text(), nullable=False),
        sa.Column("nivel", sa.String(10), nullable=False, server_default="info"),
        sa.Column("quando", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_fluxo_passos_execucao_numero", "fluxo_passos", ["execucao_id", "numero"])


def downgrade() -> None:
    op.drop_table("fluxo_passos")
    op.drop_table("fluxo_execucoes")
