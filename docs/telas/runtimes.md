# Runtimes

Um runtime é o ambiente em que o Agent roda o pacote de uma automação (por exemplo, `python-desktop`). Nesta tela se cadastram os runtimes e suas versões, e se decide quais versões estão publicadas e podem ser usadas.

## O que aparece

- **Busca** por nome ou chave e o botão **Novo runtime**.
- Um cartão por runtime com nome, chave, situação (`active` em verde; outros valores em cinza), descrição, quantidade de versões e a versão publicada ("Publicada: 1.0.0" ou "Sem versão publicada").
- **Detalhe do runtime** (painel lateral ao clicar no cartão), com o botão **Nova versão** no rodapé e três abas:
  - **Resumo**: chave, ID, situação, criado em, atualizado em, quantidade de versões e descrição.
  - **Versões**: cada versão com número, situação (rascunho, publicada, depreciada, bloqueada), sistema, arquitetura, Agent mínimo, data de criação, entrypoints, modos de execução e os metadados (quando houver), mais os botões de ação.
  - **Agents**: para cada versão que exige um Agent mínimo, quantos Agents cadastrados estão abaixo dessa versão. É só um aviso: quem decide se a execução é aceita é o Portal e o Agent, não esta aba.

## O que dá para fazer

- **Novo runtime**: chave, nome e descrição. A chave é ajustada enquanto se digita (minúsculas, sem acentos, só letras, números, `_`, `.` e `-`). Chave repetida é recusada ("Runtime already exists"). O runtime nasce `active`.
- **Nova versão** (no detalhe):
  - versão (ex.: `1.0.0`), sistema (padrão `windows`), arquitetura (padrão `x64`) e Agent mínimo (opcional);
  - entrypoints (padrão `python-function`) e modos de execução (padrão `interactive` e `background`): adicione ou remova itens; precisa ter ao menos um de cada;
  - metadados: pares chave/valor, ou um objeto JSON marcando "Editar metadata como JSON".
  - A versão nasce como rascunho.
- **Publicar**: pede confirmação. Disponível para versões que não estão publicadas, depreciadas nem bloqueadas.
- **Depreciar**: pede confirmação. Só para versões publicadas. Novos usos devem preferir outra versão.
- **Bloquear**: pede confirmação e um motivo opcional. Disponível para qualquer versão não bloqueada.
- Versão depreciada ou bloqueada não volta a ser publicada.
- Não há como editar ou apagar um runtime ou uma versão por esta tela.
- Criar runtime e criar versão usam `Idempotency-Key`: clicar duas vezes não cria em dobro.

Criação, publicação, depreciação e bloqueio vão para a auditoria.

## Por que a versão publicada importa

- Uma versão de automação com pacote só pode ser publicada se o runtime que o manifesto pede (`runtime.id` e `runtime.version`) existir e estiver **publicado**. Sem versão de runtime publicada, a publicação da automação é recusada.
- Na hora de distribuir uma execução, o Portal só oferece a versão da automação se a versão de runtime dela continuar publicada. Depreciar ou bloquear o runtime tira essas automações da distribuição.
- Automações em modo direto (entrypoint `externa`, instaladas na própria máquina) não usam runtime do Portal.

## Quem pode

- **Ver** (`runtimes.ver`, que dá `runtime.read`): mostra o item no menu e abre a tela.
- **Gerenciar** (`runtimes.gerenciar`, que dá `runtime.manage`): é a funcionalidade prevista para cadastrar runtimes.
- Hoje a tela mostra Novo runtime, Nova versão, Publicar, Depreciar e Bloquear para quem abre a tela, e as rotas de runtime no backend só exigem login: não conferem `runtime.read` nem `runtime.manage`.
- Admin vê e gerencia tudo.

## Por dentro

- Tela: `frontend/src/app/(dashboard)/runtimes/page.tsx`, `frontend/src/components/runtimes/runtimes-manager.tsx`, `frontend/src/lib/catalog-api.ts`, `frontend/src/lib/catalog-utils.ts`
- API:
  - `GET /runtimes` — lista com as versões.
  - `POST /runtimes` — cria um runtime.
  - `POST /runtimes/{id}/versions` — cria uma versão.
  - `POST /runtime-versions/{id}/publish` — publica.
  - `POST /runtime-versions/{id}/deprecate` — deprecia.
  - `POST /runtime-versions/{id}/block` — bloqueia (com motivo opcional).
  - `GET /agents` — Agents cadastrados, para a aba Agents.
- Regras no backend:
  - `backend/modules/catalog/api/routes.py` (rotas)
  - `backend/modules/catalog/application/use_cases/runtimes.py` (chave única, situações, auditoria)
  - `backend/modules/catalog/application/use_cases/versions.py` (publicar automação exige runtime publicado)
  - `backend/modules/catalog/domain/runtime.py`, `backend/modules/catalog/domain/states.py`
  - `backend/modules/dispatch/infrastructure/repositories/sqlalchemy_dispatch.py` (só distribui com runtime publicado)
