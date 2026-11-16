# Portal de Automações

O Portal de Automações é o control plane do ecossistema de automações da Biason: guarda o catálogo de automações,
decide o que roda e onde, acompanha cada execução e guarda o estado oficial. O Automation Agent é o execution
plane: roda nas máquinas, aceita ou recusa ofertas, prepara pacote e runtime, executa e devolve eventos e arquivos.

## Documentação

- [docs/README.md](docs/README.md): índice, com um documento por aba do Portal.
- [docs/visao-geral.md](docs/visao-geral.md): arquitetura, módulos, pastas, como rodar e como testar.
- [docs/decisoes.md](docs/decisoes.md): decisões de arquitetura (ADR-001 a ADR-021).
- [docs/design-system.md](docs/design-system.md): regras visuais das telas.
- `contracts/`: contratos versionados (protocolo, eventos, manifestos, fluxos).
- `sdk/python/README.md`: como escrever uma automação com o SDK.
- `automation-agent/docs/`: o Agent e a ferramenta de certificação.

## Primeiro uso

1. Prepare a máquina com `.\scripts\portal.ps1 setup` no Windows ou `sudo ./scripts/portal.sh setup` no Linux
   (requisitos em `docs/visao-geral.md`).
2. Suba o Portal com `.\scripts\portal.ps1 start` ou `sudo ./scripts/portal.sh start` (serviços do systemd, que
   voltam sozinhos quando o servidor reinicia).
3. Acesse `http://localhost:3000` e entre com o administrador criado no primeiro início (veja `backend/README.md`).

## Stack

- `backend/`: FastAPI, SQLAlchemy, Alembic, PostgreSQL, Redis, Celery, armazenamento local ou S3 e gateway do Agent.
- `frontend/`: Next.js, TypeScript e Tailwind.
- `scripts/portal.ps1`: instala, sobe e derruba o Portal nativamente no Windows.
- `scripts/portal.sh`: o mesmo no Linux, com os serviços no systemd (`portal-automacoes.target`).
