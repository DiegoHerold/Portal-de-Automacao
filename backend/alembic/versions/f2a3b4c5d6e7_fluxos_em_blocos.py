"""Fluxos em blocos: cadastro e versões (Fase 2, 13/11/2026).

- ``fluxos``: nome, descrição, situação (ativo/arquivado) e o rascunho (AST do contrato
  ``contracts/flows/v1``, pode estar inválido enquanto alguém monta).
- ``fluxo_versoes``: cada publicação, imutável, com a AST validada.

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "f2a3b4c5d6e7"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fluxos",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("nome", sa.String(160), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("situacao", sa.String(20), nullable=False, server_default="ativo"),
        sa.Column("rascunho", JSONB(), nullable=False),
        sa.Column("rascunho_atualizado_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("rascunho_atualizado_por", sa.String(120), nullable=True),
        sa.Column("criado_por", sa.String(120), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_fluxos_situacao", "fluxos", ["situacao"])
    op.create_table(
        "fluxo_versoes",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("fluxo_id", sa.String(40), sa.ForeignKey("fluxos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("ast", JSONB(), nullable=False),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("publicada_por", sa.String(120), nullable=True),
        sa.Column("publicada_em", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("fluxo_id", "numero", name="uq_fluxo_versoes_numero"),
    )
    op.create_index("ix_fluxo_versoes_fluxo_id", "fluxo_versoes", ["fluxo_id"])


def downgrade() -> None:
    op.drop_table("fluxo_versoes")
    op.drop_table("fluxos")
