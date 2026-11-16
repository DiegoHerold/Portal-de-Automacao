# E-mails

Tudo o que o Portal enviou por e-mail, das automações e dele mesmo, e para onde as automações podem mandar. Todo e-mail sai pelo Portal, pelo Microsoft Graph, com o remetente configurado no backend.

## O que aparece

- **Estado do envio**:
  - "Envio ligado (Microsoft Graph)", com o remetente; ou
  - "Envio desligado" / "Envio incompleto": os e-mails ficam na fila até o Graph estar configurado no `.env` do backend (`ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `GRAPH_REMETENTE`; também aceita os nomes `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`). "Incompleto" quer dizer que `NOTIFICACOES_EMAIL_LIGADO` está ligado, mas falta algum dos quatro dados. Sem essa variável, o envio liga sozinho quando os quatro estão preenchidos.
  - Botão **Mandar um teste para mim** (para quem gerencia, com o envio ligado).
- Quatro números das últimas 24 horas: **Enviados** (inclui os enviados pela máquina), **Na fila**, **Falharam** e **Recusados**.
- Duas abas: **E-mails** e **Destinos permitidos** (com a contagem).

### Aba E-mails

- Busca por assunto ou destinatário e os filtros **Todos**, **Falharam**, **Na fila**, **Recusados** e **Pela máquina**.
- Os 100 mais recentes. Cada linha: assunto (com clipe se tiver anexo), destinatários (os dois primeiros e "+N"), a origem, há quanto tempo e a situação. Falha ou recusa mostra o motivo em vermelho.
- Origem: o nome da automação; "nome · pela máquina (outlook/smtp/outro)"; ou "Portal", "Portal · notificação", "Portal · teste".
- Situações: **Enviado**, **Na fila**, **Falhou**, **Recusado**, **Pela máquina**.
- Clicar abre o detalhe: situação, data, motivo e tentativas (e a próxima tentativa, se na fila), Para, Cópia, Cópia oculta, de onde veio (com link **ver execução**), quando foi enviado, nomes dos anexos e a mensagem (o HTML é mostrado sem scripts nem formulários).

### Aba Destinos permitidos

- O domínio do remetente, sempre permitido.
- Os domínios e e-mails liberados, com o botão de tirar (para quem gerencia).
- Campo para incluir um domínio (`cliente.com.br`) ou um e-mail (`pessoa@cliente.com.br`) e o botão **Permitir** (para quem gerencia).

## O que dá para fazer

- **Mandar um teste para mim**: manda um e-mail de teste para o e-mail de quem clicou e mostra se foi enviado.
- **Reenviar** (no detalhe de um e-mail que falhou): põe de novo na fila e tenta na hora. Só vale para e-mail **Falhou** e cujo conteúdo ainda está guardado; se os anexos já não estão guardados, a automação precisa pedir de novo.
- **Permitir** um domínio ou e-mail: um domínio libera o domínio inteiro e os subdomínios; um e-mail libera só aquele endereço.
- **Tirar** um destino: vale na hora, sem confirmação.

## Regras do envio

- **De onde vêm os e-mails**:
  - da automação, pelo SDK (`a.email()`), com o token do job;
  - da automação que mandou pela própria máquina (Outlook, SMTP) e só avisa o Portal: fica como **Pela máquina**, o Portal não envia nada;
  - do próprio Portal: notificações, pendências, decisões de fluxo, código de login, convite e links de senha, e o teste.
- **Destinos permitidos** valem só para e-mails de automação. Fora da lista, o pedido fica **Recusado**, com o motivo. Os e-mails do próprio Portal não passam pela lista.
- **Tamanhos**: até 100 destinatários, assunto até 255 caracteres, corpo até 512 KB, até 10 anexos e 2,5 MB no total. Anexos executáveis (`.exe`, `.bat`, `.ps1`, `.js`, `.msi` etc.) são recusados.
- **Tentativas**: envia na hora. Falha temporária (rede, limite do Graph, erro do servidor) fica **Na fila** e é tentada de novo depois de 1, 5, 15, 30 e 60 minutos. Depois de 6 tentativas, ou com erro definitivo, fica **Falhou**. O Portal confere a fila a cada 15 segundos.
- Depois de enviado, o conteúdo dos anexos é apagado; ficam nome e tamanho.
- O mesmo pedido repetido na mesma execução (mesma chave de idempotência) não manda outro e-mail.
- **E-mails de acesso** (código de login, convite, links de senha): o corpo não fica guardado (o detalhe mostra "mensagem de acesso: o conteúdo não fica guardado") e não há nova tentativa.

## Botões nos e-mails

Os e-mails do Portal levam botões que abrem o Portal. Todos pedem login; depois do login, a pessoa volta para o endereço do botão.

- **Continuar processo** (pendências): quando um item termina em atenção e espera uma pessoa. O botão abre o aviso em `/pendencias/{aviso}`. Continuar põe na Fila uma execução nova só com os itens que aguardam, com os mesmos campos do pedido original. Vale uma vez e só enquanto o processo estiver aguardando; clicado de novo, diz quando e quem já continuou. Exige poder **executar** a automação. Quem recebe: quem a automação disser (`a.email(..., continuar=[itens])`); se a execução terminar com pendências sem nenhum aviso, o Portal manda para quem pediu a execução.
- **Decisão de fluxo** ("Perguntar a uma pessoa"): um botão por opção, que abre `/pendencias/decisoes/{decisão}?opcao=N` com a opção marcada para confirmar. Vale a primeira resposta.
- **Criar minha senha** (convite, 48 h) e **Criar nova senha** (esqueci a senha, 1 h): abrem `/redefinir-senha`. Ver [Login](login.md).

## Quem pode

- **Ver** (`emails.ver`): o item no menu, a lista, o detalhe e os destinos permitidos.
- **Gerenciar** (`emails.gerenciar`): incluir e tirar destinos, reenviar e mandar o e-mail de teste.
- Admin vê e gerencia tudo.

## Por dentro

- Tela: `frontend/src/app/(dashboard)/emails/page.tsx`, `frontend/src/components/emails/emails-page.tsx`
- API:
  - `GET /emails?limite=100&situacao=&busca=` — lista e resumo das 24 h.
  - `GET /emails/configuracao` — situação do envio, remetente e destinos.
  - `GET /emails/{id}` — detalhe com o corpo.
  - `POST /emails/{id}/reenviar` — reenvia um e-mail que falhou.
  - `POST /emails/dominios` (`{"dominio": "..."}`) e `DELETE /emails/dominios/{dominio}`.
  - `POST /emails/teste` — e-mail de teste para quem pediu.
- Regras no backend:
  - `backend/modules/telemetry/correio/correio.py` (regras, limites, tentativas, destinos permitidos, mensagens de acesso)
  - `backend/modules/telemetry/correio/api.py` (rotas)
  - `backend/modules/telemetry/correio/repositorio.py` (gravação)
  - `backend/modules/telemetry/infrastructure/email_graph.py` (Microsoft Graph; ligado, desligado ou incompleto)
  - `backend/modules/orchestration/pendencias/aplicacao.py` (botão Continuar processo)
  - `backend/modules/orchestration/fluxos/efeitos.py` (e-mail de decisão de fluxo)
  - `backend/workers/celery_app.py` e `backend/workers/tasks/correio_tasks.py` (reenvio da fila a cada 15 s)
