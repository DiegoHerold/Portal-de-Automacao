# Pendências

Reúne o que parou esperando uma pessoa: itens que terminaram em atenção (ex.: rubricas a
parametrizar) e perguntas de fluxos. Depois de resolver, a pessoa continua o processo daqui ou
pelo botão do e-mail.

O item fica fora do menu por padrão: liga-se nas Configurações. O botão do e-mail leva direto ao
aviso.

## O que aparece

### Página Pendências (`/pendencias`)

- **Decisões de fluxo** (só quando há alguma para a pessoa): cada pergunta com o nome do fluxo, há
  quanto tempo perguntou, o texto da pergunta e um botão por opção.
- **Itens aguardando**, agrupados por execução: nome da automação, quantos itens, desde quando,
  link "ver execução" e a lista de itens (código, nome, motivo e o selo "aguardando").
- "Nenhum item aguardando" quando não há nada.
- A página não se atualiza sozinha: recarregue para ver novidades.

### Aviso do e-mail (`/pendencias/{aviso}`)

- Título "{Automação} precisa de você" e quando o aviso foi enviado.
- Se ainda há itens aguardando: o convite para continuar e o botão **Continuar processo**.
- Se já foi resolvido: "Este processo já foi continuado há ... por ... pelo botão do e-mail / pelo
  Portal", com link para a execução nova; ou "O item rodou de novo em outra execução".
- A lista de itens do aviso (aguardando, continuado ou rodou de novo) e o link para a execução que
  parou.

### Decisão de fluxo (`/pendencias/decisoes/{id}`)

- O botão do e-mail leva aqui com `?opcao=N`: a opção escolhida no e-mail já vem destacada e a
  pessoa só confirma.
- Já respondida: mostra a resposta, quem respondeu, quando e por onde (e-mail ou Portal). Fluxo
  cancelado: "esta pergunta não vale mais".

## O que dá para fazer

- **Continuar processo** (por execução, no aviso ou na tela Acompanhar): sem confirmação, põe na
  Fila uma execução nova só com os itens que ainda aguardam, com os mesmos campos de entrada do
  pedido original. Cada item usa o cadastro atual do item (o que a pessoa acabou de ajustar),
  quando existe; senão, o retrato do pedido original. Usa a última versão publicada da
  automação. Ao terminar, mostra "N itens entraram na fila" e o botão **Acompanhar**.
- **Vale uma vez**: depois de continuado, nenhum outro caminho continua de novo. Quem clicar
  depois vê quando e quem continuou.
- Se o item rodar de novo por outro caminho (Executar, webhook), a pendência fica "rodou de
  novo" e sai da lista.
- **Responder uma decisão de fluxo**: clicar numa opção grava a resposta e o fluxo segue pelo
  caminho escolhido na hora. Vale a primeira resposta.

Continuar e responder ficam registrados na auditoria.

## Quem recebe o aviso por e-mail

- Quem a automação indicar no e-mail dela (com o botão "Continuar processo").
- Se a execução terminar com itens aguardando e a automação não mandar aviso em 60 s, o Portal
  manda um e-mail para quem pediu a execução. Sem e-mail válido, a pendência fica só nesta
  página.
- Decisões de fluxo vão para as pessoas que o bloco "Perguntar a uma pessoa" escolheu.

## Quem pode

- A tela usa a funcionalidade `painel` no menu (todo papel tem). A API não pede funcionalidade:
  confere a automação.
- Ver itens e avisos: "ver execuções" na automação. Cada pessoa vê só as pendências das
  automações que vê.
- Continuar processo: "executar" na automação. Sem ela, o aviso diz "peça a quem pode".
- Decisões de fluxo: só as pessoas perguntadas, ou um administrador, veem e respondem.

## Por dentro

- Tela: `frontend/src/app/(dashboard)/pendencias/page.tsx`,
  `frontend/src/app/(dashboard)/pendencias/[aviso]/page.tsx`,
  `frontend/src/app/(dashboard)/pendencias/decisoes/[id]/page.tsx`,
  `frontend/src/components/pendencias/pendencias.tsx`,
  `frontend/src/components/pendencias/decisoes-de-fluxo.tsx`
- API:
  - `GET /pendencias` — itens aguardando, por execução.
  - `GET /pendencias/avisos/{id}`, `POST /pendencias/avisos/{id}/continuar` — pelo aviso do
    e-mail.
  - `GET /pendencias/execucoes/{id}`, `POST /pendencias/execucoes/{id}/continuar` — pela execução
    (aceita `{"itens": [...]}`). Já continuado: 409 com quem, quando e por onde.
  - `GET /fluxos/decisoes`, `GET /fluxos/decisoes/{id}`,
    `POST /fluxos/decisoes/{id}/responder` (`{opcao, via}`). Já respondida: 409.
- Regras no backend: `backend/modules/orchestration/pendencias/aplicacao.py`,
  `backend/modules/orchestration/pendencias/api.py`,
  `backend/modules/orchestration/pendencias/repositorio.py`,
  `backend/modules/orchestration/fluxos/decisoes.py`, `backend/modules/orchestration/fluxos/api.py`.
