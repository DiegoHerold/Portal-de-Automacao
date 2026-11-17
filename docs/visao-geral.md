# Visão geral

## O que é

O **Portal de Automações** é o control plane do ecossistema de automações da Biason: guarda o catálogo de
automações, decide o que roda e onde, acompanha cada execução e guarda o estado oficial. O **Automation Agent**
é o execution plane: roda nas máquinas, observa a máquina, aceita ou recusa ofertas, prepara pacote e runtime,
executa e manda eventos e arquivos de volta.

- **Portal decide e o Agent confirma**: o Portal escolhe Agents candidatos; o Agent faz a validação final e pode
  recusar. Oferta recusada não é falha da automação, e o Agent só começa depois do `execution.commit`.
- **O PostgreSQL é a fonte de verdade**. WebSocket, SSE, Redis, Celery e mensageria são transporte ou aceleração.
- **Nenhuma máquina abre porta de entrada**: o Agent e o modo direto só fazem conexões de saída.
- **Dois modos de conexão** com o mesmo contrato de eventos e o mesmo SDK: modo agente (a automação fala só com o
  Agent local) e modo direto (a automação fala direto com o Portal).
- **Máquina é entidade própria**; automação de tela ocupa a máquina sozinha, somando os dois modos.

As decisões completas estão em [decisoes.md](decisoes.md).

## Como as peças se encaixam

```text
Pessoa ── navegador ──> Frontend (Next.js, porta 3000)
                            │ HTTP (API REST) e SSE (avisos ao vivo)
                            ▼
                     API do Portal (FastAPI, porta 8000) ── PostgreSQL (fonte de verdade)
                            │             │
                 Celery (worker + beat)   Redis (fila interna, só loopback)
                            │
        WebSocket de saída  │  HTTPS para pacotes e arquivos
                            ▼
        Automation Agent (em cada máquina) ── roda a automação (SDK Python)
        ou automação em modo direto ── HTTPS direto para o Portal
```

## Módulos do backend

Monólito modular em `backend/modules/<contexto>/`, cada um com `domain` (regras puras, sem FastAPI nem
SQLAlchemy), `application` (casos de uso), `infrastructure` (banco e adaptadores), `api` e `tests`. Só o contexto
dono altera a sua entidade; os outros usam casos de uso ou contratos.

| Contexto | Cuida de | Telas principais |
|---|---|---|
| Access | pessoas, papéis, times, organizações, login, contas de serviço, acesso por automação | Usuários, Times, Papéis, Organizações, Contas de serviço, Login |
| Catalog | automações, versões, pacotes, manifestos, itens, campos, categorias, runtimes, integração GitHub | Automações, Categorias, Runtimes |
| Fleet | máquinas, Agents, instâncias diretas, capacidade, gateway do Agent | Máquinas, Agents |
| Orchestration | execuções, fila (pedido), agendamentos, fluxos, pendências | Execuções, Agendamentos, Fluxos, Pendências |
| Dispatch | escolha da máquina, ofertas, travas, parar e continuar | Fila |
| Telemetry | eventos, logs, imagens ao vivo, notificações, e-mail central | Histórico, Painel, E-mails, sino de avisos |
| Storage | arquivos e artefatos (local ou S3) | Armazenamento, arquivos da automação |
| Governance | auditoria, segredos, limites, limpeza do sistema, webhooks | Auditoria, Segredos, Limites, Retenção, Webhooks |

Tarefas periódicas (Celery beat) em `backend/workers/tasks/`: despacho da fila, agendamentos, fluxos (a cada 2 s),
pendências, notificações, correio e limpeza.

O código ainda usa os nomes `Worker` e `Job` em alguns pontos, como adaptadores. Na interface use "Máquina" e
"Agent"; "Worker" é só processo interno do Portal (Celery).

## Pastas do repositório

| Pasta | O que tem |
|---|---|
| `backend/` | API, módulos, migrations (`alembic/`), tarefas Celery (`workers/`), ferramentas (`tools/`) e testes |
| `frontend/` | telas (`src/app/(dashboard)/<rota>`), componentes (`src/components`), clientes da API (`src/lib`), testes de tela (`e2e/`) |
| `contracts/` | contratos versionados: protocolo Portal-Agent, mensagens, eventos da automação, manifestos, fluxos, erros |
| `sdk/python/` | SDK `portal_automacoes` para escrever automações (modo agente e modo direto) |
| `automation-agent/` | o Agent atual (.NET) e a ferramenta de certificação (documentação própria em `automation-agent/docs/`) |
| `scripts/` | `portal.ps1` (Windows) e `portal.sh` (Linux, systemd) para instalar, subir e parar; `certification.ps1` |
| `infra/monitoring/` | configuração do Prometheus |
| `docs/` | esta documentação |

## Como rodar

O Portal roda nativo, sem containers, no Windows (`scripts/portal.ps1`) ou no Linux com systemd
(`scripts/portal.sh`). Os dois scripts têm os mesmos comandos e sobem as mesmas peças:

| Componente | Porta | Windows | Linux (serviço systemd) |
|---|---|---|---|
| Frontend (Next.js standalone) | 3000 | `portal.ps1` | `portal-automacoes-frontend` |
| API (uvicorn) | 8000 | `portal.ps1` | `portal-automacoes-api` |
| Migrations (`alembic upgrade head`) | – | a cada `start` | `portal-automacoes-migrate`, a cada `start` |
| Worker e beat (Celery, `--pool=threads`) | – | `portal.ps1` | `portal-automacoes-worker` e `-beat` |
| PostgreSQL dedicado | 5433, só loopback | `portal.ps1` | `portal-automacoes-postgres` |
| Redis | 6379, só loopback | serviço do Windows | serviço da distribuição (`redis-server`) |

### Windows

```powershell
.\scripts\portal.ps1 setup           # virtualenv, backend\.env, banco e build do frontend
.\scripts\portal.ps1 start           # banco, migrations, API, worker, beat e frontend
.\scripts\portal.ps1 status          # 0 quando tudo está no ar
.\scripts\portal.ps1 restart         # aplica migrations novas e o build novo
.\scripts\portal.ps1 stop
.\scripts\portal.ps1 open-firewall   # exige administrador; libera 3000 e 8000 na rede local
```

- Requisitos: Python 3.12, Node.js 20+, PostgreSQL 16+ (binários `initdb`/`pg_ctl`) e Redis como serviço do
  Windows com `bind 127.0.0.1`.
- Dados (banco, pacotes, logs, PIDs) ficam em `%LOCALAPPDATA%\PortalAutomacoes` (ou `PORTAL_DATA_DIR`). Inclua essa
  pasta nos backups.
- Use `127.0.0.1` (não `localhost`) em `POSTGRES_SERVER` e `REDIS_URL`: no Windows `localhost` tenta IPv6 antes.

### Linux (systemd)

```bash
sudo apt install python3.12 python3.12-venv postgresql redis-server curl   # Ubuntu 24.04+; Node.js 20+ à parte
sudo ./scripts/portal.sh setup            # virtualenv, backend/.env, banco, build e serviços do systemd
sudo ./scripts/portal.sh start            # sobe portal-automacoes.target (banco, migrations, API, worker, beat, frontend)
./scripts/portal.sh status                # 0 quando tudo está no ar
./scripts/portal.sh logs [api|worker|beat|frontend|postgres|migrate]   # journalctl -f
sudo ./scripts/portal.sh restart          # aplica migrations novas e o build novo
sudo ./scripts/portal.sh stop
sudo ./scripts/portal.sh open-firewall    # ufw ou firewalld; libera 3000 e 8000 só para a subrede local
sudo ./scripts/portal.sh remove-services  # tira os serviços do systemd; dados, banco e .env ficam
sudo ./scripts/portal.sh nginx <nome>     # publica em http://<nome> pelo nginx (veja "Endereço na intranet")
```

- Requisitos: systemd, Python 3.12, Node.js 20+ (o do Ubuntu é o 18: use o repositório NodeSource), PostgreSQL 16+
  e Redis. No RHEL/Fedora: `dnf install python3.12 postgresql-server redis curl`.
- Os serviços rodam com o usuário dono da pasta do repositório (ou `PORTAL_USER`), nunca como root. Para um
  servidor, crie um usuário próprio: `sudo useradd --system --create-home portal` e `sudo chown -R portal: <pasta>`.
- Dados (banco e pacotes) ficam em `/var/lib/portal-automacoes` (ou `PORTAL_DATA_DIR` no `setup`). Inclua essa
  pasta nos backups. Os logs vão para o journal: `journalctl -u 'portal-automacoes-*'`.
- O `portal-automacoes.target` fica habilitado: o Portal volta sozinho quando o servidor reinicia. Cada serviço se
  reinicia sozinho se cair; se a migration falhar, API, worker e beat não sobem.
- O cluster dedicado convive com o PostgreSQL da distribuição (porta 5432). Se ele não for usado, desligue com
  `sudo systemctl disable --now postgresql`. Com `PORTAL_MANAGED_POSTGRES=false` no `backend/.env`, o Portal usa o
  banco indicado em `POSTGRES_*` e o serviço dedicado não é criado.
- Atualizar: `git pull`, `sudo ./scripts/portal.sh setup` e `sudo ./scripts/portal.sh restart`. Mudou o usuário, a
  pasta ou o banco dedicado? Rode o `setup` de novo, que regrava os serviços.

### Endereço na intranet (nginx)

Para abrir o Portal por um nome, como `http://portaldeautomacoes.intranet.biason.net`, sem porta, um nginx fica na
frente: `/api/` vai para a API (8000) e o resto para as telas (3000). O modelo está em
`infra/nginx/portal-automacoes.conf` e já trata WebSocket, telas ao vivo (SSE), uploads de pacotes e o IP real de quem
acessa. Aberto sem porta, o frontend chama a API no mesmo endereço; aberto por `:3000`, continua chamando `:8000`.

- **nginx na mesma máquina do Portal (Linux)**: `sudo apt install nginx` e
  `sudo ./scripts/portal.sh nginx portaldeautomacoes.intranet.biason.net`. O comando grava o site, testa
  (`nginx -t`), recarrega o nginx e põe `FRONTEND_URL=http://<nome>` no `backend/.env` (links dos e-mails); depois,
  `sudo ./scripts/portal.sh restart`.
- **nginx em outra máquina** (por exemplo, o servidor que já publica outros sites da intranet): copie o modelo para
  o nginx de lá, troque o nome e `127.0.0.1` pelo IP da máquina do Portal, e no `backend/.env` do Portal ponha
  `PORTAL_PROXY_IPS=<IP do nginx>` e `FRONTEND_URL=http://<nome>`; depois, `restart`. As portas 3000 e 8000 da máquina
  do Portal precisam estar abertas para o nginx (`open-firewall`).
- **DNS**: o TI cria um registro do nome apontando para a máquina do nginx, como os outros sites da intranet.
- A API só aceita o IP real (`X-Forwarded-For`) vindo de `127.0.0.1` ou de `PORTAL_PROXY_IPS`; de qualquer outro
  endereço, vale o IP da conexão. Assim ninguém forja o IP na auditoria, no login ou nos webhooks.
- Agents e o SDK continuam usando `BACKEND_PUBLIC_URL`. O nome pelo nginx é para quem usa as telas; o modo direto
  do SDK exige HTTPS, que segue na porta 8000 (`PORTAL_TLS_CERT`).

### Nos dois sistemas

- `BACKEND_PUBLIC_URL` precisa ser acessível pelas máquinas dos Agents (compõe as URLs de download de pacotes).
- `STORAGE_BACKEND=local` guarda pacotes em disco; `s3` usa um bucket compatível (variáveis `S3_*`).
- **HTTPS da API**: o modo direto do SDK recusa `http://` e o Agent deve usar `wss://`. Com `PORTAL_TLS_CERT` e
  `PORTAL_TLS_KEY` (PEM da CA da empresa, fora do repositório) e `BACKEND_PUBLIC_URL=https://<nome do
  certificado>:8000`, a API sobe só com TLS 1.2/1.3 e cifras AEAD.
- O primeiro acesso usa o administrador criado no início da API (veja `backend/README.md`); troque a senha.
- Para desenvolver só a API: pare a API gerenciada e rode `.venv\Scripts\python -m uvicorn main:app --reload` em
  `backend/` (no Linux: `sudo systemctl stop portal-automacoes-api` e `.venv/bin/python -m uvicorn ...`).

## Testes

- **Backend**: `backend\.venv\Scripts\python -m pytest -q` em `backend/`. Os testes de banco criam um PostgreSQL
  descartável (`portal_testes_automaticos`), aplicam todas as migrations e apagam no fim; nunca usam o banco do
  Portal nem a pasta real de arquivos.
- **Motor dos fluxos**: `pytest modules/orchestration/fluxos/tests`.
- **SDK**: `pytest` em `sdk/python/`.
- **Telas**: `npx playwright test` em `frontend/`. A API é simulada dentro de cada teste; o servidor de teste usa a
  pasta `.next-e2e` e nunca o `.next` do Portal em produção. As capturas ficam em `frontend/test-results/`.
- **Tipos**: `npx tsc --noEmit -p .` em `frontend/`.
- Antes de criar uma migration, confira `alembic heads` (uma única cabeça).

## Contratos e SDK

- `contracts/` é a fonte única: protocolo (`protocol/v1`, envelope com `protocol_version`, `message_id`,
  `message_type`, `sent_at`, `agent_id`, `agent_instance_id`, `payload`), mensagens Portal⇄Agent, estados de
  execução, eventos da automação (`automation-events/v1`: etapa, item, progresso, log, passo, atenção, espera,
  pausa), manifesto da automação (`manifests/`) e fluxos (`flows/v1`).
- O SDK Python (`sdk/python/`, pacote `portal_automacoes`) implementa esses eventos nos dois modos, segredos,
  arquivos, itens e partes do trabalho (`job.parte`). Documentação de uso: `sdk/python/README.md`.
