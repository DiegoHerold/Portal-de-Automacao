# Agendamentos

Agenda das automações que rodam sozinhas em dia e hora marcados. A tela é um calendário: mostra o que vai rodar, o que já rodou e como terminou, e deixa criar e mudar agendamentos direto na grade.

## O que aparece

- **Cabeçalho**: o período visto (dia, semana ou mês), os botões **Hoje**, **Anterior** e **Próximo**, a escolha da visão **Dia / Semana / Mês** e o botão **Criar** (para quem pode criar).
- A visão e a data ficam no endereço (`?visao=semana&data=2026-11-16`); a visão padrão é **Semana**.
- **Dia e Semana**: grade de horas, como uma agenda.
  - Abre mostrando das 8 h às 18 h; no dia de hoje, começa 1 h 30 antes da hora atual.
  - Uma linha vermelha marca a hora atual.
  - Ocorrências que se sobrepõem ficam lado a lado.
  - O tamanho do bloco é a duração real (se já rodou) ou a estimada pelo histórico (mínimo de 30 min na tela).
  - Botões **+** e **−** no rodapé (ou Ctrl + roda do mouse) esticam ou encolhem as horas.
  - Clicar no dia do cabeçalho abre a visão Dia; na visão Dia há setas para o dia anterior e o seguinte.
- **Mês**: um quadro por dia com as 3 primeiras ocorrências (hora e nome) e "+ N mais", que abre o dia.
- **Cor de cada ocorrência**:
  - azul: programada para o futuro, em preparação ou em andamento;
  - cinza: futura com o agendamento pausado ou desabilitado; pulada; cancelada; resultado desconhecido;
  - verde: concluída;
  - vermelho: falhou, falha ao disparar ou expirou;
  - amarelo: atrasada, aguardando disparo, cancelando ou parcialmente concluída.
- Agendamentos arquivados não aparecem.
- O calendário se atualiza sozinho a cada minuto.
- Entram no calendário as ocorrências calculadas pela regra de cada agendamento, inclusive as de intervalo, e também os disparos reais que não batem com a regra (por exemplo, um "Executar agora").

### Cartão da ocorrência

Ao clicar numa ocorrência abre um cartão com: nome do agendamento (e da automação, se forem diferentes), dia e hora, a regra em texto ("De segunda a sexta às 08:00", "Dia 10 de cada mês às 09:30", "A cada 5 min"), se está pausado e a situação da ocorrência (Programado, Atrasado, Em andamento, Concluído, Falhou, Misfire ignorado, Ignorada por overlap etc.). Botões: **Editar**, **Executar agora** e **Acompanhar** (quando a ocorrência já gerou execução) ou **Detalhes**. Fecha com Esc ou clicando fora.

### Detalhes do agendamento

Painel lateral com a situação da ocorrência, a situação do agendamento e abas:

- **Resumo**: horário, duração (real ou estimada, com o grau de confiança da estimativa), fuso, responsável, automação, versão, Agent e próxima execução.
- **Agendamento**: a regra, a expressão cron gerada, próxima e última execução, política de atraso, tolerância, política de sobreposição e os parâmetros (se houver).
- **Execução** (só quando a ocorrência gerou execução): situação, início e fim reais, duração, Agent e o botão **Abrir execução**.
- **Timeline**: planejada, disparada, iniciada e concluída/falhou/cancelada, com o motivo quando houver.
- **Histórico**: todos os disparos do agendamento, do mais novo ao mais antigo, com a situação, se foi agendado ou manual, início, fim e o resumo da falha.

## O que dá para fazer

- **Criar**: pelo botão Criar, clicando num horário vazio (Dia/Semana; o horário clicado já vem preenchido), clicando e arrastando para escolher o horário, ou clicando num dia vazio no Mês (vem às 08:00; dois cliques abrem o dia). Criar a partir de um dia já marca o tipo "Data específica".
- **Formulário** (Novo agendamento / Editar agendamento):
  - **O que agendar**: só **Automação** (escolha na lista).
  - **Quando**:
    - **Recorrência (horário fixo)**: Todo dia, Dias da semana (Seg a Dom), Mensal (dia do mês; 0 = último dia, tratado como dia 28) ou Data específica, mais o horário.
    - **Intervalo (a cada N segundos)**: mínimo de 60 s, e não menos que o limite "intervalo mínimo entre repetições" definido em Governança > Limites.
  - **Próximas execuções**: prévia das 5 próximas datas, calculada pelo Portal enquanto se preenche.
  - **Geral**: nome (opcional), fuso horário (padrão `America/Sao_Paulo`) e Ativo.
  - **Política de atraso** e **Política de sobreposição** (ver abaixo).
- **Arrastar uma ocorrência** para outro dia ou hora muda o agendamento inteiro (não existe exceção por ocorrência):
  - data específica: muda a data e a hora;
  - todo dia: muda só a hora;
  - dias da semana: troca o dia de origem pelo de destino e muda a hora;
  - mensal: muda o dia do mês e a hora;
  - intervalo: não dá para arrastar (edite o intervalo).
  - Só ocorrências futuras, que ainda não dispararam, podem ser arrastadas.
  - Se o agendamento se repete, aparece a confirmação "Mudar o agendamento?" com **Antes** e **Depois**; o botão é **Mudar todas**.
- **Executar agora**: dispara na hora, fora da regra. Fica registrado como disparo manual no Histórico.
- **Habilitar**, **Pausar**, **Desabilitar** e **Arquivar** (no painel de detalhes, conforme a situação atual). Pausado e desabilitado param de disparar e aparecem em cinza; arquivado sai do calendário. Não há botão de apagar.

Toda criação, alteração, mudança de situação e disparo manual vai para a auditoria.

## Regras do disparo

- Um processo interno do Portal confere a cada minuto os agendamentos vencidos e cria a execução da **última versão publicada** da automação, com origem `schedule`. Sem versão publicada, o disparo é registrado como "Falha ao disparar".
- A mesma ocorrência não gera duas execuções (chave de idempotência por agendamento e horário).
- **Política de atraso (misfire)**: vale quando o disparo acontece depois do horário mais a **tolerância** (padrão 3600 s).
  - **Executar uma vez ao voltar** (padrão): dispara assim que possível.
  - **Pular execuções perdidas**: registra a ocorrência como pulada ("Misfire ignorado") e espera a próxima.
- **Política de sobreposição**:
  - **Proibir sobreposição** (padrão): se o disparo anterior do mesmo agendamento ainda está ativo, a nova ocorrência é pulada ("Ignorada por overlap"). No calendário, a ocorrência futura nessa situação aparece como "Aguardando liberação".
  - **Permitir sobreposição**: dispara mesmo assim.
- **Máx. execuções de recuperação** é gravado com o agendamento, mas hoje não muda o disparo.
- Agendamento de **data específica** passa para concluído depois de disparar.
- **Fluxo como alvo está desligado**: o formulário só oferece Automação e a API recusa `target_type: "flow"` com 422 ("Fluxos estão sendo refeitos..."). O disparo de um agendamento antigo de fluxo também falha com essa mesma mensagem.

## Quem pode

- **Ver** (`agendamentos.ver`, que dá `schedule.read`): abre o calendário, o cartão, os detalhes, o histórico e a prévia. Mostra todos os agendamentos não arquivados.
- **Gerenciar** (`agendamentos.gerenciar`, que dá `schedule.create`, `schedule.update` e `schedule.trigger`): mostra Criar, Editar, arrastar, Executar agora, Habilitar, Pausar, Desabilitar e Arquivar.
- O backend confere também a automação:
  - criar, mudar, pausar, desabilitar ou arquivar exige `automation.update` (de `automacoes.gerenciar`) ou a permissão "editar" da categoria da automação;
  - **Executar agora** exige `execution.create` (de `execucoes.gerenciar`) ou a permissão "executar" da categoria.
  - Por isso, quem tem só `agendamentos.gerenciar` vê os botões, mas pode receber 403 numa automação em que não tem essas permissões.
- Admin vê e gerencia tudo.

## Por dentro

- Tela:
  - `frontend/src/app/(dashboard)/schedules/page.tsx`
  - `frontend/src/components/schedules/agenda/agenda-calendario.tsx` (cabeçalho, mês, cartão, arrastar)
  - `frontend/src/components/schedules/agenda/grade-de-horas.tsx` (dia e semana)
  - `frontend/src/components/schedules/agenda/agenda-comum.ts` (cores, quem pode ser arrastado)
  - `frontend/src/components/schedules/schedule-form-sheet.tsx`, `schedule-detail-sheet.tsx`, `schedule-occurrences-preview.tsx`
  - `frontend/src/lib/agenda.ts` (texto da regra e o que muda ao arrastar), `frontend/src/lib/schedule-api.ts`, `frontend/src/lib/schedule-policies.ts`
- API:
  - `GET /schedules/calendar?from=&to=&timezone=&view=&target_type=all` — ocorrências da janela (até 93 dias), com situação, duração e estimativa.
  - `GET /schedules/{id}` — um agendamento.
  - `POST /schedules` — cria.
  - `PUT /schedules/{id}` — muda (formulário e arrastar).
  - `POST /schedules/{id}/enable` | `/pause` | `/disable` | `/archive` — muda a situação.
  - `POST /schedules/{id}/trigger` — Executar agora.
  - `GET /schedules/{id}/history` — disparos do agendamento.
  - `POST /schedules/preview` — próximas datas, sem gravar.
  - `GET /automations` — automações para escolher.
- Regras no backend:
  - `backend/modules/orchestration/scheduling/api/routes.py` (rotas e permissões) e `api/schemas.py` (validação, recusa do alvo fluxo)
  - `backend/modules/orchestration/scheduling/application/use_cases.py` (criar, mudar, situações, disparo, atraso e sobreposição)
  - `backend/modules/orchestration/scheduling/application/calendar.py` (montagem do calendário e situação de cada ocorrência)
  - `backend/modules/orchestration/scheduling/domain/recurrence.py` (regra para cron e próxima data)
  - `backend/modules/orchestration/scheduling/infrastructure/adapters/execution_creator.py` (cria a execução)
  - `backend/workers/tasks/schedule_tasks.py` (tarefa que roda a cada minuto)
