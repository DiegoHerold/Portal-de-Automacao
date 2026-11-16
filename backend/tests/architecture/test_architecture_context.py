from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
DOCS = ROOT / "docs"
CONTRACTS = ROOT / "contracts"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_overview_names_control_and_execution_planes() -> None:
    visao = read(DOCS / "visao-geral.md")

    assert "control plane" in visao
    assert "execution plane" in visao
    assert "O PostgreSQL é a fonte de verdade" in visao
    assert "transporte ou aceleração" in visao


# Cada aba do menu (frontend/src/lib/navigation.ts) tem o seu documento em docs/telas/.
ABAS = {
    "/dashboard": "painel", "/fila": "fila", "/maquinas": "maquinas", "/historico": "historico",
    "/pendencias": "pendencias", "/executions": "execucoes", "/flows": "fluxos", "/webhooks": "webhooks",
    "/schedules": "agendamentos", "/automations": "automacoes", "/categories": "categorias", "/runtimes": "runtimes",
    "/workers": "agent", "/storage": "armazenamento", "/audit": "auditoria", "/secrets": "segredos",
    "/service-accounts": "contas-de-servico", "/users": "usuarios", "/teams": "times", "/roles": "papeis",
    "/organizations": "organizacoes", "/governance/limits": "limites", "/governance/retention": "retencao",
    "/emails": "emails", "/settings": "configuracoes",
}


def test_required_documents_exist() -> None:
    required = ["README.md", "visao-geral.md", "decisoes.md", "design-system.md", "telas/login.md"]
    required += [f"telas/{nome}.md" for nome in ABAS.values()]

    missing = [name for name in required if not (DOCS / name).exists()]

    assert missing == []


def test_every_menu_tab_has_a_document() -> None:
    import re

    navegacao = read(ROOT / "frontend" / "src" / "lib" / "navigation.ts")
    rotas = set(re.findall(r'href: "(/[^"]*)"', navegacao))

    assert rotas, "o menu mudou de formato"
    assert sorted(rotas - set(ABAS)) == [], "aba nova no menu sem documento em docs/telas/"


def test_protocol_contracts_require_message_identity() -> None:
    envelope = json.loads(read(CONTRACTS / "protocol" / "v1" / "envelope.schema.json"))

    assert envelope["properties"]["protocol_version"]["const"] == "1.0"
    assert "message_id" in envelope["required"]
    assert "message_type" in envelope["required"]
    assert "agent_id" in envelope["required"]
    assert "agent_instance_id" in envelope["required"]


def test_all_contract_json_files_are_valid_json() -> None:
    contract_files = sorted(CONTRACTS.rglob("*.json"))

    assert contract_files
    for path in contract_files:
        json.loads(read(path))


def test_execution_contracts_separate_offer_accept_reject_and_commit() -> None:
    expected = [
        CONTRACTS / "messages" / "portal-to-agent" / "execution-offer.schema.json",
        CONTRACTS / "messages" / "portal-to-agent" / "execution-commit.schema.json",
        CONTRACTS / "messages" / "agent-to-portal" / "execution-accepted.schema.json",
        CONTRACTS / "messages" / "agent-to-portal" / "execution-rejected.schema.json",
    ]

    for path in expected:
        assert path.exists()
        json.loads(read(path))


def test_rejection_is_not_modeled_as_automation_failure() -> None:
    states = json.loads(read(CONTRACTS / "executions" / "states.json"))

    assert "rejected" in states["execution_attempt"]
    assert "rejected" in states["execution_offer"]
    assert "rejected" not in states["execution"]
    assert "rejected" not in states["task_execution"]


def test_decisions_keep_every_adr_number() -> None:
    decisoes = read(DOCS / "decisoes.md")

    for numero in range(1, 22):
        assert f"| {numero:03d} |" in decisoes, f"ADR-{numero:03d}"


def test_modular_monolith_context_directories_exist() -> None:
    modules_root = ROOT / "backend" / "modules"
    expected_contexts = [
        "access",
        "catalog",
        "fleet",
        "orchestration",
        "dispatch",
        "telemetry",
        "storage",
        "governance",
    ]

    missing = [name for name in expected_contexts if not (modules_root / name / "README.md").exists()]

    assert missing == []


def test_context_layer_directories_are_explicit() -> None:
    modules_root = ROOT / "backend" / "modules"
    expected_contexts = [
        "access",
        "catalog",
        "fleet",
        "orchestration",
        "dispatch",
        "telemetry",
        "storage",
        "governance",
    ]
    expected_layers = ["domain", "application", "infrastructure", "api", "tests"]

    missing = [
        f"{context}/{layer}"
        for context in expected_contexts
        for layer in expected_layers
        if not (modules_root / context / layer).exists()
    ]

    assert missing == []


def test_domain_modules_do_not_import_frameworks_or_orms() -> None:
    domain_files = sorted((ROOT / "backend" / "modules").glob("*/domain/**/*.py"))

    assert domain_files
    for path in domain_files:
        source = read(path)
        forbidden_imports = [
            "from fastapi",
            "import fastapi",
            "from sqlalchemy",
            "import sqlalchemy",
        ]
        assert not any(import_text in source for import_text in forbidden_imports), path


def test_frontend_shell_and_design_rules_exist() -> None:
    design = read(DOCS / "design-system.md")
    expected_frontend_files = [
        ROOT / "frontend" / "src" / "components" / "layout" / "app-shell.tsx",
        ROOT / "frontend" / "src" / "app" / "(dashboard)" / "layout.tsx",
        ROOT / "frontend" / "src" / "app" / "(dashboard)" / "dashboard" / "page.tsx",
    ]

    assert "ADR-020" in design
    assert all(path.exists() for path in expected_frontend_files)


def test_contracts_include_official_message_and_rejection_vocabularies() -> None:
    message_types = json.loads(read(CONTRACTS / "messages" / "message-types.json"))
    rejection_codes = json.loads(read(CONTRACTS / "errors" / "rejection-codes.json"))

    for message_type in ["execution.offer", "execution.commit", "execution.rejected", "agent.capacity.updated"]:
        assert (
            message_type in message_types["portal_to_agent"]
            or message_type in message_types["agent_to_portal"]
        )

    for code in [
        "INSUFFICIENT_CPU_CAPACITY",
        "AGENT_DISABLED",
        "RUNTIME_UNAVAILABLE",
        "PACKAGE_UNAVAILABLE",
        "PROTOCOL_INCOMPATIBLE",
    ]:
        assert code in rejection_codes["rejection_codes"]


def test_new_backend_domain_and_application_ports_are_importable() -> None:
    backend_root = ROOT / "backend"
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))

    from modules import PORTAL_CONTEXTS
    from modules.catalog.domain.manifest import parse_automation_manifest
    from modules.dispatch.application.ports import AgentCommand, AgentCommandStore
    from modules.dispatch.domain.offer import ExecutionOfferStatus, RejectionCode
    from modules.fleet.domain.agent import Agent, AgentInstance
    from modules.orchestration.domain.execution import Execution, ExecutionAttempt
    from modules.telemetry.application.ports import InboxMessage, TransactionalOutbox
    from modules.telemetry.domain.event import ExecutionEvent

    assert len(PORTAL_CONTEXTS) == 8
    assert parse_automation_manifest
    assert AgentCommand
    assert AgentCommandStore
    assert ExecutionOfferStatus.PENDING == "pending"
    assert RejectionCode.PROTOCOL_INCOMPATIBLE == "PROTOCOL_INCOMPATIBLE"
    assert Agent
    assert AgentInstance
    assert Execution
    assert ExecutionAttempt
    assert InboxMessage
    assert TransactionalOutbox
    assert ExecutionEvent


def test_catalog_legacy_services_delegate_to_modules() -> None:
    # backend/app foi removido no corte final; a rota de importacao substituiu o service legado.
    import_api = read(ROOT / "backend" / "modules" / "catalog" / "api" / "imports.py")

    assert "ConfirmStagedAutomationImport" in import_api
    assert "AutomationVersionRepository" not in import_api
    assert "infrastructure.orm" not in import_api


def test_catalog_persistence_migration_defines_reliability_tables() -> None:
    migration = read(ROOT / "backend" / "alembic" / "versions" / "9d8b0f2c4a11_catalog_persistence_reliability.py")

    for table in [
        "automation_manifests",
        "automation_packages",
        "runtimes",
        "runtime_versions",
        "stored_objects",
        "upload_sessions",
        "outbox_messages",
        "inbox_messages",
        "agent_commands",
        "idempotency_records",
        "audit_events",
    ]:
        assert f'"{table}"' in migration


def test_fleet_gateway_migration_defines_agent_tables_and_command_sequence() -> None:
    migration = read(ROOT / "backend" / "alembic" / "versions" / "1f2a3b4c5d6e_fleet_agent_gateway.py")

    for table in [
        "agents",
        "agent_instances",
        "agent_registration_tokens",
        "agent_credentials",
        "agent_machine_profiles",
        "agent_resource_snapshots",
        "agent_capabilities",
        "agent_configurations",
        "agent_pools",
        "interactive_session_snapshots",
        "agent_connections",
        "agent_diagnostics",
    ]:
        assert f'"{table}"' in migration
    assert "uq_agent_command_agent_sequence" in migration


def test_worker_and_agent_legacy_services_were_removed() -> None:
    # Fase de remoção do legado: /workers e /agents:register/heartbeat REST
    # antigos foram totalmente substituídos por modules/fleet (rotas /workers
    # e /agents) e pelo Agent Gateway oficial (backend/gateway/agent_gateway).
    # Nenhum consumidor restante (nem frontend, nem bootstrap/api.py)
    # referenciava estes arquivos — confirmar que não voltaram.
    removed_paths = [
        ROOT / "backend" / "app" / "services" / "worker_service.py",
        ROOT / "backend" / "app" / "services" / "agent_gateway_service.py",
        ROOT / "backend" / "app" / "api" / "v1" / "endpoints" / "agents.py",
        ROOT / "backend" / "app" / "api" / "v1" / "endpoints" / "workers.py",
        ROOT / "backend" / "app" / "workers",
    ]
    for path in removed_paths:
        assert not path.exists(), path


def test_gateway_endpoint_does_not_access_orm_directly() -> None:
    gateway_root = ROOT / "backend" / "gateway" / "agent_gateway"
    for path in sorted(gateway_root.glob("*.py")):
        source = read(path)
        assert "from modules.fleet.infrastructure.orm" not in source, path.name
        assert "from modules.dispatch.infrastructure.orm" not in source, path.name


def test_agent_context_file_exists() -> None:
    context = read(ROOT / "AGENTS.md")

    assert "Portal e o Control Plane" in context
    assert "Automation Agent e o Execution Plane" in context
    assert "Nao criar microsservicos prematuramente" in context
