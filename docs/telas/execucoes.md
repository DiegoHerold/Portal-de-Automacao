# Execuções

Visão técnica das execuções: as que estão em andamento, as prontas para despacho e o histórico,
com filtros e o detalhe completo de cada uma (eventos, logs, métricas, tentativas, artefatos e
diagnóstico do despacho). Para acompanhar uma execução no dia a dia, prefira Acompanhar
(`/execucoes/{id}`, ver Histórico).

## O que aparece

### Lista (`/executions`)

- **Topo**: selo do tempo real ("Tempo real ativo", "Atualizando por polling", "Conectando",
  "Tempo real offline") e há quanto tempo atualizou. Botões **Atualizar** e **Disparar job**.
- **Contadores** (clicáveis, viram o filtro): Em execução, Aguardando, Com atenção, Concluídas
  hoje, Falharam hoje, Canceladas. Contam só a página carregada.
- **Abas de visão**: Agora (padrão), Aguardando, Rodando, Atenção, Concluídas, Falhas, Canceladas,
  Todas. "Atenção" junta falhas e execuções ativas sem eventos há mais de 8 min.
- **Filtros**: busca livre (número, situação, origem, automação, Agent, falha), origem (Manual,
  API, Trigger, Webhook, Agenda, Fluxo, Retry, Reprocesso, Sistema), ordenação (Prioridade
  operacional, Mais recentes, Mais antigas, Maior duração, Prioridade, Status), automação ou
  fluxo, Agent e período (de/até). Cada filtro ativo vira uma etiqueta removível; "Limpar
  filtros" tira todos. Os filtros ficam na URL.
- **Agora**: até 12 cartões de execuções ativas, com automação ou fluxo, número, situação,
  prioridade, progresso, origem, Agent, início, duração, quantidade de logs e o aviso "não recebe
  eventos há ..." quando passa de 8 min sem eventos.
- **Prontas para despacho**: até 8 tarefas que o agendador vê como candidatas agora (id, situação,
  prioridade, tentativas, próxima tentativa) e o link "Diagnóstico".
- **Histórico**: tabela com número, automação ou fluxo, situação, origem, Agent, duração, início e
  resultado ou falha.
- **Paginação**: 50 por página, com Anterior e Próxima.

Filtros e ordenação são aplicados no navegador sobre a página carregada (só a origem e o trigger
vão para a API). A lista relê a cada 5 s enquanto houver execução ativa ou tarefa pronta, e também
quando chega aviso pelo WebSocket.

### Detalhe (`/executions/{id}`)

- Caminho "Execuções > #id", título e o botão **Acompanhar ao vivo** (leva a `/execucoes/{id}`).
- Barra com situação, tipo, origem, "ao vivo" ou "encerrada", **Atualizar** e **Cancelar** (só
  enquanto ativa).
- Números: Progresso, Eventos (e logs), Artefatos (e métricas), Duração.
- Abas (a escolhida fica na URL, `?tab=`):
  - **Resumo**: entrada (parâmetros), saída, falha, dados da execução e progresso;
  - **Timeline**: eventos em ordem, com filtro por tarefa;
  - **Eventos**: filtro por tipo e nível;
  - **Logs**: filtro por nível;
  - **Métricas**: filtro por nome;
  - **Processos**: nome, situação, PID, código de saída, início, fim e comando;
  - **Progresso**: último progresso recebido;
  - **Tasks**: cada tarefa com suas tentativas e o botão **Retry**;
  - **Artefatos**: arquivos gerados, com download quando disponíveis;
  - **Diagnóstico avançado** (só leitura): decisões do despacho e, por tentativa, lease, reservas
    e travas.
- Enquanto a execução está ativa, as abas relêem a cada 4 a 8 s e há conexão ao vivo. Encerrada,
  param de reler.

### Endereços antigos

- `/jobs` redireciona para `/executions` (com a visão Agora).
- `/jobs/{id}` redireciona para `/executions/{id}`.

## O que dá para fazer

- **Disparar job**: escolhe a automação, a prioridade (critical, high, normal, low) e um JSON de
  parâmetros. Para automações com "Folha" no nome ou "folha" na chave, pede a competência
  (MM/AAAA). Usa a última versão publicada, cria a execução com origem "manual" e já tenta
  escolher um Agent para ela. Sem versão publicada, recusa. Este caminho não passa pela janela Executar nem pelos
  itens da automação.
- **Cancelar** (cartão ou detalhe): pede confirmação do navegador. Execução que ainda não começou
  na máquina é cancelada na hora; rodando, o cancelamento é pedido ao Agent. Execução já terminada
  ou já com cancelamento pedido não muda.
- **Retry** (aba Tasks): reagenda a tarefa a partir da última tentativa, se a política de
  repetição da automação permitir.
- **Baixar artefato** (aba Artefatos).
- **Diagnóstico**: abre a aba de diagnóstico de uma tarefa pronta.

## Quem pode

- `execucoes.ver`: item no menu e acesso à tela.
- `execucoes.gerenciar`: dá as permissões técnicas de criar, cancelar e repetir execuções.
- Na API, o detalhe, as abas e os artefatos pedem "ver execuções" na automação; disparar e
  cancelar pedem "executar" na automação. Os botões aparecem para todos.

## Por dentro

- Tela: `frontend/src/app/(dashboard)/executions/page.tsx`,
  `frontend/src/app/(dashboard)/executions/[id]/page.tsx`,
  `frontend/src/app/(dashboard)/jobs/page.tsx`, `frontend/src/app/(dashboard)/jobs/[id]/page.tsx`,
  `frontend/src/components/executions/executions-manager.tsx`,
  `frontend/src/components/executions/execution-detail.tsx`,
  `frontend/src/components/executions/trigger-job-dialog.tsx`,
  `frontend/src/components/executions/dispatch-diagnostics-tab.tsx`,
  `frontend/src/components/executions/tabs/`, `frontend/src/lib/status.ts`
- API:
  - `GET /executions?limit=50&offset=&origin=&trigger_id=` — lista.
  - `POST /executions` — disparar job; `GET /automations/{id}/versions` — versão publicada.
  - `GET /dispatch/queue?limit=50` — prontas para despacho.
  - `WS /ws/executions` — avisos em tempo real (token na primeira mensagem).
  - `GET /executions/{id}`, `/tasks`, `/attempts`, `/timeline`, `/events`, `/logs`, `/metrics`,
    `/progress`, `/processes`, `/artifacts` — detalhe e abas.
  - `GET /executions/{id}/stream` — SSE ao vivo do detalhe.
  - `POST /executions/{id}/cancel` — cancelar.
  - `POST /task-executions/{id}/retry` — Retry.
  - `GET /artifacts/{id}/download` — baixar artefato.
  - `GET /executions/{id}/dispatch`, `GET /execution-attempts/{id}/lease|reservations|locks` —
    diagnóstico.
  - `GET /automations`, `GET /workers` — nomes de automações e Agents.
- Regras no backend: `backend/modules/orchestration/api/routes.py`,
  `backend/modules/orchestration/application/use_cases/resilience.py` (cancelamento e retry),
  `backend/modules/telemetry/api/routes.py`, `backend/modules/telemetry/api/realtime.py`,
  `backend/modules/dispatch/api/routes.py`, `backend/modules/storage/api/routes.py`.
