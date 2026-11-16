"""Fluxos em blocos: decisões de uma pessoa (Fase 5, 13/11/2026).

- ``fluxo_decisoes``: o bloco "Perguntar a uma pessoa": pergunta, opções, quem pode responder e a
  resposta (vale uma vez). Avisa no sino e por e-mail, com um botão por opção.

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "b4c5d6e7f8a9"
down_revision = "a3b4c5d6e7f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fluxo_decisoes",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("execucao_id", sa.String(40), sa.ForeignKey("fluxo_execucoes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("fluxo_id", sa.String(40), sa.ForeignKey("fluxos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("bloco", sa.String(80), nullable=True),
        sa.Column("pergunta", sa.Text(), nullable=False),
        sa.Column("opcoes", JSONB(), nullable=False),
        sa.Column("destinatarios", JSONB(), nullable=False),
        sa.Column("situacao", sa.String(20), nullable=False, server_default="aguardando"),
        sa.Column("resposta", sa.Integer(), nullable=True),
        sa.Column("respondida_por", sa.String(120), nullable=True),
        sa.Column("respondida_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("respondida_via", sa.String(20), nullable=True),
        sa.Column("criada_em", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_fluxo_decisoes_execucao_id", "fluxo_decisoes", ["execucao_id"])
    op.create_index("ix_fluxo_decisoes_situacao", "fluxo_decisoes", ["situacao"])


def downgrade() -> None:
    op.drop_table("fluxo_decisoes")
