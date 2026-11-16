# Configurações

As preferências de cada pessoa: o menu, os avisos que recebe, a senha e os navegadores confiáveis, a aparência. Também leva à integração com o GitHub, usada para importar automações.

Fica sempre no rodapé do menu, fora das categorias.

## O que aparece

Quatro abas à esquerda. A aba aberta fica no endereço (`/settings#menu`, `#notificacoes`, `#conta`, `#sistema`), então links e o sino levam direto a ela.

### Menu e atalhos

- Todas as telas que o papel da pessoa abre, agrupadas como no menu, com uma frase do que cada uma faz e o link para abrir.
- Em cada tela, a chave **No menu / Fora do menu**.
- A contagem "N de M no menu" e o botão **Restaurar padrão**.
- A dica de que a ordem se muda arrastando no próprio menu (ou Alt+seta no item).

### Notificações

- O estado do envio por e-mail: desligado ou incompleto (os avisos aparecem só no sino) ou ligado (também chegam por e-mail, um por evento no máximo), e o e-mail da pessoa.
- Os tipos de aviso, cada um com uma caixa de marcar:
  - **Erro numa execução**: uma execução que a pessoa pode ver terminou com erro.
  - **Item aguardando uma pessoa**: um item parou e precisa de alguém.
  - **Término de execução**: uma execução que a pessoa pode ver terminou (com ou sem erro).
  - **Máquina offline** (só gestores): uma máquina parou de dar sinal.
  - **Fila parada** (só gestores): há jobs esperando e nenhum começa há mais que o tempo escolhido (5 a 1440 minutos; padrão 30).
- Botão **Salvar notificações**.

### Conta e aparência

- **Sua conta**: nome, e-mail e papel (só leitura; quem muda é quem gerencia Usuários).
- **Senha e acesso**:
  - **Trocar a senha**: senha atual, senha nova e repetir, com as regras mostradas enquanto se digita.
  - **Navegadores confiáveis**: onde a pessoa marcou "Confiar neste navegador", com desde quando e até quando vale, e o botão **Esquecer todos**.
- **Aparência**: Claro ou Escuro.

### Sistema

- Endereço da API, o modo de autenticação (token JWT no cabeçalho) e o link **Gerenciar integração** do GitHub App (abre `/settings/integrations`).

## O que dá para fazer

- **Ligar ou desligar uma tela no menu**: vale na hora. A escolha (e a ordem) fica **neste navegador**. **Restaurar padrão** volta itens e ordem ao padrão. Uma tela fora do menu continua acessível por aqui.
- **Salvar notificações**: grava os tipos marcados e o tempo da fila parada. Nada vem ligado: cada pessoa escolhe. Erro, atenção e término chegam só das automações que a pessoa pode ver.
- **Trocar a senha**: pede a senha atual. Regras da senha nova: 8 a 128 caracteres, não ser um caractere repetido, não conter o nome do e-mail, e ser diferente da atual. Ao trocar, os navegadores confiáveis e os links de senha pendentes deixam de valer, e chega um e-mail avisando da troca.
- **Esquecer todos** os navegadores: no próximo login, todos pedem o código por e-mail.
- **Aparência**: guarda o tema neste navegador.

## Integrações (GitHub)

Em `/settings/integrations`, o cartão **Integração GitHub** lista as contas ou organizações conectadas pelo GitHub App, usadas para importar automações (Automações > Importar do GitHub).

- Sem conta: "Nenhuma conta conectada" e o botão **Conectar GitHub**.
- Com contas: login da conta, tipo (usuário ou organização), situação **Ativa** ou **Suspensa**, o botão de desconectar e **Conectar outra conta**.
- **Conectar GitHub**: leva à página de instalação do App no GitHub. Ao terminar, o GitHub volta para o Portal e a conta aparece. Se a instalação precisar de aprovação do dono da conta, a tela avisa "Solicitação enviada".
- **Desconectar**: pede confirmação. Só remove o registro no Portal; para tirar o acesso do App aos repositórios, desinstale também no GitHub.
- O GitHub avisa o Portal (webhook) quando o App é desinstalado (a conta sai da lista), suspenso ou reativado, e quando há `push` num repositório: as automações importadas daquela pasta e branch ficam marcadas com atualização disponível.

### Como criar e configurar o GitHub App

Feito uma vez, por quem administra o GitHub da empresa e o servidor do Portal:

1. **Criar o App** no GitHub (Settings > Developer settings > GitHub Apps > New, na conta ou na organização que tem o repositório das automações):
   - **Homepage URL**: endereço do Portal.
   - **Setup URL**: `https://<backend>/api/v1/integrations/github/callback`, com "Redirect on update" marcado.
   - **Webhook**: ativo, apontando para `https://<backend>/api/v1/webhooks/github`, com um segredo forte.
   - **Permissões de repositório**: Contents e Metadata, só leitura.
   - **Eventos**: `push` e `installation`.
   - Instalação: só nesta conta, a não ser que outras contas também importem automações.
2. **Gerar a chave privada** (Private keys > Generate) e guardar o arquivo `.pem` com cuidado.
3. **Preencher o `.env` do backend**: `GITHUB_APP_ID` (App ID), `GITHUB_APP_SLUG` (final do endereço do App), `GITHUB_APP_PRIVATE_KEY` (conteúdo do `.pem` em uma linha, com `\n` no lugar das quebras) e `GITHUB_APP_WEBHOOK_SECRET` (o segredo do webhook). `GITHUB_APP_CLIENT_ID` e `GITHUB_APP_CLIENT_SECRET` não são usados. Reiniciar o backend.
4. **Conferir**: em `/settings/integrations`, a lista abre sem erro; **Conectar GitHub** abre a instalação real; depois de instalar, a conta aparece como Ativa.

Detalhes que o código confirma:

- O Portal não guarda token de pessoa: guarda só o número da instalação e pede ao GitHub tokens de curta duração a cada uso.
- Sem `GITHUB_APP_ID` e `GITHUB_APP_PRIVATE_KEY`, as rotas da integração respondem 400 ("não configurado"); sem `GITHUB_APP_SLUG`, não dá para montar o link de instalação.
- Com `GITHUB_APP_WEBHOOK_SECRET` preenchido, o webhook confere a assinatura de cada chamada e recusa a inválida (401). Sem ele, a assinatura não é conferida.
- Para trocar a chave privada: gere outra no GitHub, troque `GITHUB_APP_PRIVATE_KEY`, reinicie e revogue a antiga.

## Quem pode

- **Configurações** não tem funcionalidade: qualquer pessoa logada abre e muda as próprias preferências, a senha e os navegadores.
- **Menu e atalhos** mostra só as telas que o papel da pessoa abre.
- Os avisos **Máquina offline** e **Fila parada** só aparecem para os papéis `admin` e `manager`.
- **Integrações**: a página abre para qualquer pessoa logada, mas listar, conectar e desconectar exigem `automacoes.gerenciar` (sem ela, a lista mostra o erro do backend).

## Por dentro

- Tela: `frontend/src/app/(dashboard)/settings/page.tsx`, `frontend/src/components/settings/settings-panel.tsx`, `frontend/src/components/settings/areas-do-portal.tsx`, `frontend/src/components/settings/notificacoes.tsx`, `frontend/src/components/settings/senha-e-acesso.tsx`; integrações em `frontend/src/app/(dashboard)/settings/integrations/page.tsx` e `frontend/src/components/settings/github-integrations-panel.tsx`
- Preferências locais: `frontend/src/lib/menu.ts` (itens e ordem do menu), `frontend/src/components/theme/theme-provider.tsx` (tema), `frontend/src/lib/auth.ts` (navegador confiável)
- API:
  - `GET /notificacoes/preferencias` e `PUT /notificacoes/preferencias` (`{"tipos": [...], "fila_minutos": 30}`).
  - `POST /auth/trocar-senha` (`{"atual", "nova"}`).
  - `GET /auth/navegadores` e `DELETE /auth/navegadores`.
  - `GET /integrations/github` — contas conectadas.
  - `POST /integrations/github/connect` — devolve o link de instalação.
  - `DELETE /integrations/github/{id}` — desconecta (só no Portal).
  - `GET /integrations/github/callback` — volta do GitHub depois de instalar (sem login; redireciona para `/settings/integrations`).
  - `POST /webhooks/github` — eventos do GitHub.
- Regras no backend:
  - `backend/modules/telemetry/api/notificacoes.py` e `backend/modules/telemetry/domain/notificacoes.py` (tipos, só gestores, faixa da fila parada)
  - `backend/modules/access/api/acesso.py` e `backend/modules/access/application/acesso.py` (trocar senha, navegadores confiáveis)
  - `backend/modules/catalog/api/github_integrations.py` (conectar, callback, desconectar, `automacoes.gerenciar`)
  - `backend/modules/orchestration/triggers/api/webhooks.py` (webhook do GitHub)
  - `backend/infrastructure/github/client.py` (cliente do GitHub App, assinatura do webhook)
  - `backend/infrastructure/config.py` (variáveis `GITHUB_APP_*`)
