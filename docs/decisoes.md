# Decisões de arquitetura

As decisões que moldam o Portal, numeradas (ADR = registro de decisão de arquitetura). Os números continuam valendo
quando o código ou o `AGENTS.md` citam "ADR-0xx". Decisão nova entra no fim desta lista, com número novo, data,
o que foi decidido, a alternativa recusada e o que muda.

| ADR | Decisão | Situação |
|---|---|---|
| 001 | **Portal é o control plane**: decide o que executar, escolhe Agents candidatos, guarda o estado oficial e recebe eventos e arquivos. | vale |
| 002 | **Agent é o execution plane**: observa a máquina, valida ofertas, prepara pacotes e runtimes, executa, monitora, envia eventos e arquivos. Pode recusar uma oferta. | vale |
| 003 | **Monólito modular** com os contextos Access, Catalog, Fleet, Orchestration, Dispatch, Telemetry, Storage e Governance. Sem microsserviços prematuros. | vale |
| 004 | **PostgreSQL é a fonte de verdade** (catálogo, máquinas, execuções, tentativas, ofertas, comandos, eventos, outbox e inbox). WebSocket, Redis e Celery são só transporte ou execução interna. | vale |
| 005 | **Uma única conexão WebSocket por Agent**, sempre de saída (nenhuma máquina abre porta de entrada). | vale |
| 006 | **Arquivos grandes por HTTPS/S3**, nunca pelo WebSocket. | vale |
| 007 | **Execução separada em `Execution`, `TaskExecution`, `ExecutionAttempt` e `ExecutionOffer`**. `TaskExecution` não recebe estados de oferta; oferta recusada não é falha da automação; o Agent não começa antes do `execution.commit`. | vale |
| 008 | **Outbox, inbox e command log** persistidos para comandos enviados, mensagens recebidas e eventos de saída. | vale |
| 009 | **Capabilities tipadas** (`key`, `status`, `version`, `attributes`, `observed_at`). | vale |
| 010 | **Capacidade em camadas**: perfil da máquina, recomendação do Agent, política do administrador, capacidade atual e histórico. | vale |
| 011 | Fluxos como grafo (DAG). | substituída pela 021 |
| 012 | **Pacotes e runtimes imutáveis**, com hash; o Agent baixa, confere, guarda em cache e só executa depois do commit. | vale |
| 013 | **Contratos versionados em `contracts/`** (JSON Schema e exemplos) como fonte única para Portal, Agent e SDK. Não duplicar schemas à mão. | vale |
| 014 | **Cada entidade tem um contexto dono**; só ele altera a entidade, os outros usam casos de uso ou contratos. | vale |
| 015 | **Estados do Agent em dimensões separadas**: conexão, administrativo, saúde e ocupação calculada. | vale |
| 016 | **Reestruturação incremental do backend** para `backend/modules/<contexto>/` com camadas `domain`, `application`, `infrastructure`, `api` e `tests`. O antigo `backend/app` já saiu; nomes legados (`Worker`, `Job`) só como adaptadores. | concluída |
| 017 | Preservar o frontend antigo sem redesenho. | substituída pela 020 |
| 018 | **Dois modos de conexão**: modo agente (a automação fala só com o Agent local) e modo direto (automação + máquina falam direto com o Portal, por HTTPS de saída, com identidade própria). Mesmo contrato de eventos e mesmo SDK nos dois; trocar de modo é configuração. | vale |
| 019 | **Máquina é entidade própria** (Fleet), cadastrada pelo administrador; Agent e instâncias diretas apontam para ela. Automação de **tela** ocupa a máquina sozinha, somando os dois modos (trava `machine:{id}:screen`); navegador e segundo plano seguem a capacidade da máquina. | vale |
| 020 | **Frontend com a identidade Biason** em todas as telas, tema claro e escuro por tokens, imagens ao vivo, logs e estimativas nas listas de execução. Sem mock: sem dado, estado vazio real. Regras em [design-system.md](design-system.md). | vale |
| 021 | **Fluxos como programas em passos**: árvore JSON própria (`contracts/flows/v1`) interpretada por um motor durável no Portal (sem `eval`); editor em cartões no padrão do Power Automate (Blockly recusado); paralelismo só pelo passo "Dividir automação entre máquinas"; perguntar a uma pessoa reaproveita Pendências; sem webhook disparando fluxo; agendamento roda com as permissões de quem agendou. Detalhes em [telas/fluxos.md](telas/fluxos.md). | vale |
| 022 | **O Portal roda nativo no Windows e no Linux**, sem containers: `scripts/portal.ps1` (processos do Windows) e `scripts/portal.sh` (serviços do systemd agrupados em `portal-automacoes.target`, com o usuário dono do repositório, nunca root). Mesmos comandos, portas, PostgreSQL dedicado e migrations a cada start nos dois. | vale |
