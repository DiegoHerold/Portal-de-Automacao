# Backend

API FastAPI do Portal de Automacoes. O backend esta em migracao arquitetural
para monolito modular: `backend/modules/` define os contextos oficiais.
`backend/app/` foi removido no corte final da migracao.

O Portal e o Control Plane. O Automation Agent e o Execution Plane. Redis,
Celery e WebSocket sao mecanismos de transporte/execucao interna, nao fonte
oficial de estado.

## Rodando localmente

Para o Portal completo, use `..\scripts\portal.ps1` (ver
`../docs/visao-geral.md`). Para desenvolver so a API, depois do `setup`:

1. Pare a API gerenciada se ela estiver no ar.
2. Rode `.venv\Scripts\python -m uvicorn main:app --reload`.

## Arquitetura

- Visao geral, modulos e como rodar: `../docs/visao-geral.md`.
- Decisoes: `../docs/decisoes.md`.
- Contratos Portal-Agent: `../contracts/`.

## Bootstrap automatico

- Roles padrao, categorias e usuario admin sao criados no startup da API.
- Credenciais iniciais: `admin@portal.local` / `admin123`.
