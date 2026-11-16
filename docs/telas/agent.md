# Agents

O Agent é o programa que roda em cada máquina executora e recebe trabalho do Portal. Esta tela lista os Agents registrados, mostra o estado e a capacidade de cada um e permite pausar, desligar, diagnosticar, configurar e trocar a credencial deles.

## O que aparece

Lista (`/workers`), atualizada a cada 5 s:

- **Configuração do instalador**: `central_api_url` e `central_websocket_url` do Portal, com o botão **Copiar JSON** (modelo de configuração do instalador do Agent) e o botão **Tokens de registro**.
- **Filtros**: busca por nome, hostname ou id; conectividade (`online`, `connecting`, `stale`, `disconnected`, `offline`); status administrativo (`enabled`, `draining`, `maintenance`, `updating`, `disabled`, `pending_registration`). Os filtros ficam no endereço da página.
- **Um cartão por Agent**: nome, hostname e id (clicar abre o detalhe); selos de conectividade e status administrativo; saúde (só quando não está **Saudável**) e ocupação (só quando não está **Ocioso**); barra de uso por pool (**Interativo**, **Segundo plano**, **Navegador**: em uso + reservado / total efetivo, vermelha quando cheia); "Visto há ..."; versão do Agent e, se diferente, a versão desejada (`1.2.0 → 1.3.0`).
- Sem nenhum Agent: aviso com o botão **Gerar token de registro**.

Detalhe (`/workers/[id]`), atualizado a cada 5 s:

- **Barra de estado e ações** no topo (selos e botões, ver abaixo).
- **Visão geral**: hostname, Agent ID, identidade local, fingerprint da máquina, versão atual e desejada, protocolo, último heartbeat, criado e atualizado em; sessão interativa (estado, disponível, bloqueada, usuário), quando o Agent informa; recursos (CPU, memória, disco livre); dados brutos em JSON.
- **Capacidade**: por pool, uso, livres, total recomendado pelo Agent, teto do administrador e quando foi observado; último retrato de recursos (CPU, memória disponível, disco livre, processos).
- **Capacidades**: o que o Agent informou que tem (ex.: `browser.chrome`), com status (`available`, `degraded`, `unavailable`) e versão.
- **Histórico**: instâncias do processo do Agent (ativa ou encerrada, versão, início, motivo do encerramento) e diagnósticos pedidos (status, resumo, erro).
- **Configuração** e **Credenciais** (ver abaixo).
- **Solicitar atualização de versão**: versão atual e desejada, com campo para a nova versão.

Estados que aparecem nos selos:

| Dimensão | Valores |
|---|---|
| Conectividade | online, connecting, stale (instável), disconnected, offline |
| Administrativo | Habilitado, Drenando, Manutenção, Atualizando, Desabilitado, Aguardando registro |
| Saúde | Saudável, Degradado, Erro |
| Ocupação | Ocioso, Ocupado, Saturado |

## O que dá para fazer

Na lista:

- **Copiar JSON**: copia o modelo de configuração do instalador com os endereços deste Portal (nome do Agent em branco, heartbeat 30 s, 1 vaga interativa, 2 em segundo plano, canal `stable`).
- **Tokens de registro** (painel lateral): gerar um token com validade de 1 hora, 1 dia, 7 dias ou 30 dias e uma nota opcional. O token aparece uma única vez, com botão de copiar. A lista do painel mostra só os tokens criados nesta sessão do navegador; não há consulta dos tokens antigos. **Revogar** um token ativo da lista ou, para outro, colar o id (`art_...`) em "Revogar por ID". Token já usado não pode ser revogado.

No detalhe (cada ação pede confirmação quando indicado e gera um evento na auditoria):

- **Desabilitar** (confirmação e motivo opcional): o Agent para de receber trabalho, fica `offline` e o Portal passa a recusar a credencial dele. Para voltar, **Habilitar**.
- **Drenar** (só quando Habilitado; confirmação): para de receber trabalho novo, mas termina o que está em andamento.
- **Manutenção** / **Sair da manutenção** (confirmação): para de receber trabalho até sair. Não vale para Agent desabilitado.
- **Retomar** (quando Drenando ou em Manutenção): volta a Habilitado.
- **Diagnóstico**: manda o comando de diagnóstico ao Agent (expira em 1 h). O resultado aparece na aba Histórico.
- **Recarregar capacidades**: pede ao Agent que informe de novo as capacidades (expira em 1 h).
- **Solicitar atualização** (confirmação): grava a versão desejada, põe o Agent em **Atualizando** e manda o comando (expira em 6 h). O Agent aplica quando processar; ao concluir, volta a Habilitado.
- **Configuração** > **Salvar configuração**: só as seções marcadas como "Será alterado" são enviadas; o Agent recebe a nova configuração por comando.
  - Timers de presença: heartbeat (mínimo 5 s), "instável após" e "offline após". Cada um tem de ser maior que o anterior.
  - Pools habilitados e teto do administrador por pool (em branco = sem teto).
  - Restrições: capacidades permitidas (allowlist, separadas por vírgula) e restrições adicionais em JSON.
  - A tela não lê a configuração atual (não há rota de leitura): os campos começam com os valores padrão (30/90/180 s, todos os pools). Campo enviado vazio mantém o valor já salvo, então não dá para limpar uma allowlist pela tela.
- **Credenciais**:
  - **Rotacionar credencial** (confirmação): invalida todas as credenciais ativas do Agent e emite uma nova, mostrada uma única vez (`acp_...:segredo`). O Agent precisa ser configurado com ela para reconectar.
  - **Revogar credencial por ID** (`acr_...`, confirmação). Não há lista das credenciais existentes.

O Portal só oferece execuções a Agents **Habilitados**; Drenando, Manutenção, Atualizando e Desabilitado ficam de fora da seleção.

## Como um Agent se liga ao Portal

1. **Token de registro**: alguém gera o token nesta tela e coloca na configuração do instalador.
2. **Registro**: o Agent chama `POST /api/v1/agents/register` com o token, a identidade local e o hostname (e, se tiver, fingerprint, versão, sistema e capacidades). O Portal confere se o token está ativo e no prazo, cria o Agent (ou reaproveita o que já tem a mesma identidade local), marca o token como usado e devolve a credencial (`acp_...:segredo`) e os timers. Fingerprint já usado por outro Agent é recusado. Agent novo respeita o limite "Agents cadastrados" de Governança > Limites.
3. **Conexão**: o Agent abre um WebSocket de saída para `central_websocket_url` (`/api/v1/agent-gateway/connect`) com `Authorization: Bearer <credencial>` e manda o handshake com `agent_id`, `agent_instance_id` e as versões de protocolo que entende. O Portal confere a credencial, negocia o protocolo, registra a instância e responde `agent.connected`. Toda mensagem tem o envelope com `protocol_version`, `message_id`, `message_type`, `sent_at`, `agent_id`, `agent_instance_id` e `payload`. Os comandos pendentes (configuração, diagnóstico, atualização, ofertas de execução) descem pelo mesmo canal.
4. **Heartbeat**: o Agent manda `agent.heartbeat` no intervalo configurado, com recursos e capacidade. Cada heartbeat deixa o Agent `online` e atualiza saúde, ocupação e pools. Uma tarefa interna do Portal roda a cada 60 s e marca `stale` ou `offline` quem passou dos timers sem heartbeat.

Também existem rotas HTTP de compatibilidade para Agents antigos (`POST /api/v1/agents:register`, `/agents/{id}/heartbeat`, `/agents/{id}/events:batch` e o WebSocket `/agents/ws`).

**Modo agente x modo direto**: no modo agente, a automação fala só com o Agent local (por um named pipe aberto pelo Agent para aquela tentativa) e o Agent leva tudo ao Portal. No modo direto, não há Agent: a própria automação se inscreve no Portal com um código de uso único, fica pendente até alguém aprovar e escolher a máquina (na tela Máquinas) e busca seus jobs em `/api/v1/direto/...`. Nos dois modos só a máquina abre conexão, nunca recebe; e os eventos da automação seguem o mesmo contrato. Automações diretas não aparecem nesta tela.

## Quem pode

- A tela abre para quem tem a funcionalidade **agents** em ver ou gerenciar (admin sempre).
- **Ver** (`agents.ver`) também dá `agent.read`; **gerenciar** (`agents.gerenciar`) dá `agent.manage`, `agent.update`, `agent.disable` e `agent.diagnose`.
- Hoje a tela não diferencia ver de gerenciar: todos os botões aparecem para quem abre a tela, e as rotas `/agents/...` usadas por ela exigem só login. Quem abre a tela consegue executar as ações.

## Por dentro

- Tela: `frontend/src/app/(dashboard)/workers/page.tsx`, `frontend/src/app/(dashboard)/workers/[id]/page.tsx`, `frontend/src/components/agents/agents-manager.tsx`, `agent-detail.tsx`, `registration-tokens-sheet.tsx`, `agent-configuration-panel.tsx`, `agent-credentials-panel.tsx`, `agent-status-badges.tsx`; `frontend/src/lib/agent-api.ts`, `frontend/src/lib/agent-policies.ts`
- API:
  - `GET /workers/installer-config` — endereços para o instalador.
  - `GET /agents` — lista. `GET /agents/{id}` — um Agent.
  - `GET /agents/{id}/capacity`, `GET /agents/{id}/capabilities`, `GET /agents/{id}/history` — abas do detalhe.
  - `POST /agents/{id}/enable`, `/disable`, `/drain`, `/resume`, `/maintenance` — estado administrativo.
  - `POST /agents/{id}/diagnostics`, `/capabilities/refresh`, `/update` — comandos ao Agent.
  - `PATCH /agents/{id}` — configuração (`configuration`).
  - `POST /agents/registration-tokens`, `POST /agents/registration-tokens/{id}/revoke` — tokens de registro.
  - `POST /agents/{id}/credentials/rotate`, `POST /agents/{id}/credentials/revoke` — credenciais.
- Regras no backend:
  - `backend/modules/fleet/api/routes.py` (rotas)
  - `backend/modules/fleet/application/use_cases/administration.py` (habilitar, drenar, manutenção, configuração)
  - `backend/modules/fleet/application/use_cases/registration.py` (tokens, registro, credenciais)
  - `backend/modules/fleet/application/use_cases/commands.py` (diagnóstico, capacidades, atualização)
  - `backend/modules/fleet/application/use_cases/presence.py` (heartbeat e detecção de `stale`/`offline`)
  - `backend/modules/fleet/domain/configuration.py`, `backend/modules/fleet/domain/states.py`
  - `backend/gateway/agent_gateway/` (WebSocket, autenticação, envelope, entrega de comandos)
  - `backend/workers/tasks/housekeeping_tasks.py` e `backend/workers/celery_app.py` (tarefa de presença a cada 60 s)
  - `backend/modules/dispatch/application/use_cases/scheduler.py` (só Agent Habilitado recebe oferta)
