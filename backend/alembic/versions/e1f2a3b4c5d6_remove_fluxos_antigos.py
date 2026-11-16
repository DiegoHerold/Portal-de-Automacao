"""Remove os Fluxos antigos (grafo de nós) - Fase 1 dos Fluxos em blocos (13/11/2026).

Os fluxos serão refeitos como programas em blocos (ADR-021, docs/telas/fluxos.md).
- Saem as tabelas ``flows``, ``flow_versions``, ``flow_nodes``, ``flow_edges``, ``flow_executions`` e
  ``flow_node_executions`` (no banco real: 2 fluxos, 0 execuções; apagar foi autorizado).
- Os agendamentos guardam ``flow_id``, ``flow_version_id`` e ``flow_execution_id`` sem chave
  estrangeira (o ``CASCADE`` tira as chaves); a Fase 8 liga essas colunas aos fluxos novos.
- O limite ``flow.max_nodes`` sai do catálogo.

Sem volta: o downgrade não recria os fluxos antigos.

Revision ID: e1f2a3b4c5d6
Revises: c9c0d1e2f3a5
"""

from __future__ import annotations

from alembic import op

revision = "e1f2a3b4c5d6"
down_revision = "c9c0d1e2f3a5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS flow_node_executions, flow_executions, flow_edges, flow_nodes, "
               "flow_versions, flows CASCADE")
    op.execute("DELETE FROM system_limits WHERE key = 'flow.max_nodes'")


def downgrade() -> None:
    # Os fluxos antigos não voltam: foram substituídos pelos fluxos em blocos (ADR-021).
    pass
