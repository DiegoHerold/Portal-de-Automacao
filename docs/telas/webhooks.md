# Webhooks

Um webhook é uma URL que um sistema de fora (ERP, Power Automate, um script) chama para acionar uma automação. Ele só aciona: não lê nada do Portal. Para ler dados do Portal, use uma conta de serviço.

## O que aparece

- **Resumo no topo** (só quando existe algum webhook): quantos estão ligados (de quantos, com aviso de quantos estão sem token), chamadas aceitas nas últimas 24 h e chamadas recusadas nas últimas 24 h.
- **Busca** por nome do webhook ou nome da automação.
- **Um cartão por webhook**, com:
  - nome e a automação que ele aciona;
  - situação: **Ligado**, **Desligado** ou **Sem token** (cartão com borda de aviso);
  - aceitas e recusadas nas últimas 24 h e o último uso ("nunca" se ainda não foi chamado);
  - quantos IPs/redes são permitidos (ou "qualquer IP"), o limite por minuto e o final do token (`…abcd`).
  - Webhook sem token mostra "Gere um token para ligar". Se veio do cadastro antigo de gatilhos, mostra "Veio do webhook antigo: gere um token e ligue".
- **Detalhe do webhook** (painel lateral ao clicar no cartão), com link para a automação e três abas:
  - **Chamadas**: as últimas 50 chamadas recebidas. Cada uma mostra se foi **Aceita**, **Repetida (nada novo)** ou **Recusada** (com o motivo), há quanto tempo, o IP de origem e o código HTTP. Chamadas aceitas têm o link "ver execução" (com a quantidade de itens). Se houver recusadas, aparece o filtro "Todas / Só recusadas".
  - **Como chamar**: endereço (`POST`, com botão Copiar), cabeçalhos, os campos que a automação aceita (lidos do formulário dela, com a marca "obrigatório"), um exemplo em `curl` pronto para copiar e a tabela de respostas.
  - **Proteção**: token (final e quando foi gerado), IPs permitidos, limite por minuto e a área para apagar.
- A aba que abre primeiro é **Chamadas** quando o webhook já foi usado; senão, **Como chamar**.

## O que dá para fazer

- **Novo webhook**: escolher a automação (só as ativas e não arquivadas), dar um nome (quem vai chamar), uma descrição opcional, IPs permitidos opcionais (separados por vírgula; IP ou rede, ex.: `10.0.9.0/24`) e o limite por minuto (padrão 30, de 1 a 600). Ao criar, o webhook já nasce **ligado** e o token aparece na hora.
- **Guardar o token**: a janela "Guarde o token agora" mostra o token e a URL, com botões de copiar. Ela só fecha depois de marcar "Guardei o token num lugar seguro". O token não aparece de novo: o Portal guarda só uma impressão (SHA-256) dele.
- **Ligar / Desligar**: botão no detalhe, só para webhook com token. Desligado, o webhook recusa as chamadas com 403. Não dá para ligar um webhook sem token.
- **Gerar token / Novo token**: pede confirmação. O token atual para de funcionar na hora; atualize o sistema que chama logo em seguida.
- **Salvar proteção**: muda os IPs permitidos (um por linha) e o limite por minuto. O botão só habilita quando algo mudou.
- **Apagar**: pede confirmação. A URL para de responder e o histórico de chamadas sai junto. As execuções que o webhook pediu continuam no Histórico. Para só pausar, use Desligar.

Toda criação, alteração, troca de token e exclusão vai para a auditoria (`webhook.criado`, `webhook.alterado`, `webhook.token_gerado`, `webhook.apagado`).

## Como o sistema de fora chama

- `POST /api/v1/webhooks/{id}` com os cabeçalhos:
  - `Authorization: Bearer wht_...` (obrigatório; nunca na URL nem no corpo);
  - `Content-Type: application/json`;
  - `Idempotency-Key` (opcional): a mesma chave em 24 h não cria outra execução.
- Corpo (tudo opcional conforme a automação): `{"parametros": {...}, "itens": ["101", "102"], "com_filiais": true}`. Qualquer outra chave é recusada.
- Os campos e itens são conferidos pelo formulário da automação, do mesmo jeito que o botão Executar.

Respostas (a conferência segue esta ordem: token, ligado, IP, limite, idempotência, corpo, campos):

| Código | Quando |
|---|---|
| 400 | Token na URL ou no corpo; JSON inválido. |
| 401 | Sem token, token errado ou webhook inexistente (mesma resposta, para não revelar quais existem). |
| 403 | Webhook desligado, ou IP fora da lista (vale o IP da conexão; `X-Forwarded-For` é ignorado). |
| 429 | Mais chamadas no último minuto do que o limite do webhook. |
| 413 / 415 | Corpo acima de 64 KB; corpo que não é JSON. |
| 422 | Chaves desconhecidas no corpo, ou campos e itens inválidos para a automação (o motivo vem em `detalhe`). |
| 200 | `Idempotency-Key` já aceita nas últimas 24 h: devolve a mesma execução, nada novo é criado. |
| 202 | Aceita: entrou na fila. Resposta `{"execucao_id", "itens", "situacao": "na_fila"}`. |

Toda chamada a um webhook existente (aceita, repetida ou recusada) fica registrada nas Chamadas. A execução criada tem origem `webhook` e o solicitante `webhook:<id>`.

As rotas antigas (`/triggers/...` e `POST /webhooks/trigger/...`) respondem 410 com a orientação de usar esta tela. Os webhooks antigos foram trazidos para cá desligados e sem token.

## Quem pode

- **Ver** (`webhooks.ver`, ou `automacoes.ver`): abre a tela e o detalhe. A lista mostra só os webhooks de automações em que a pessoa pode ver execuções (`ver_execucoes`, por concessão na automação ou pela permissão da categoria).
- **Gerenciar** (`webhooks.gerenciar`): mostra Novo webhook, Ligar/Desligar, Gerar token, Salvar proteção e Apagar. Além disso, o backend exige que a pessoa possa **executar** aquela automação (`executar`); sem isso, recusa com "você precisa poder executar a automação".
- Admin vê e gerencia tudo.
- A chamada pública não usa login: só o token do webhook.

## Por dentro

- Tela: `frontend/src/app/(dashboard)/webhooks/page.tsx`, `frontend/src/components/webhooks/webhooks-page.tsx`
- API:
  - `GET /webhooks` — lista (com contagem das últimas 24 h e a URL pronta).
  - `POST /webhooks` — cria; devolve o webhook e o token uma única vez (sem cache).
  - `PUT /webhooks/{id}` — muda nome, descrição, IPs, limite e ligado/desligado.
  - `POST /webhooks/{id}/token` — gera um token novo (o anterior para na hora).
  - `DELETE /webhooks/{id}` — apaga o webhook e suas chamadas.
  - `GET /webhooks/{id}/chamadas?limite=50` — últimas chamadas recebidas.
  - `GET /automations/{id}/formulario` — campos e item da automação, para a aba Como chamar.
  - `GET /automations` — automações para escolher no Novo webhook.
  - `POST /webhooks/{id}` — a chamada pública (sem login).
- Regras no backend:
  - `backend/modules/orchestration/webhooks/aplicacao.py` (regras, segurança, token, idempotência)
  - `backend/modules/orchestration/webhooks/api.py` (rotas e permissões)
  - `backend/modules/orchestration/webhooks/repositorio.py` (gravação)
  - `backend/modules/orchestration/webhooks/antigos.py` (rotas antigas com 410)
  - `backend/modules/catalog/api/itens.py` (`pedir_execucao_da_automacao`, o mesmo pedido do Executar)
  - `backend/modules/access/domain/concessao.py` (ações por automação)
- O webhook do GitHub (`POST /webhooks/github`, em `backend/modules/orchestration/triggers/api/webhooks.py`) é outra coisa: avisa o Portal de push em repositórios importados e não aparece nesta tela.
