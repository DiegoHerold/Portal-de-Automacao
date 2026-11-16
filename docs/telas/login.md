# Login

A entrada do Portal: e-mail e senha e, depois, um código de 6 dígitos que chega por e-mail. Daqui também saem **Esqueci a senha** e a criação da senha pelo convite.

## O que aparece

As telas de acesso têm, à esquerda (em tela larga), a faixa azul com o logo da Biason e três destaques; à direita, o formulário.

### Passo 1: e-mail e senha (`/login`)

- Campos **E-mail** e **Senha** (com o olho para mostrar a senha).
- Link **Esqueci a senha** (leva o e-mail já digitado).
- Botão **Entrar no portal**.
- "Primeiro acesso? Use o link 'Crie sua senha' do e-mail de convite."
- Se a sessão venceu: "Sua sessão expirou. Entre de novo para continuar de onde parou."

### Passo 2: código

- "Mandamos um código de 6 dígitos para ..." (o e-mail aparece mascarado, ex.: `jo•••@empresa.com.br`). O código vale 10 minutos.
- Campo **Código** (só números, 6 dígitos).
- **Confiar neste navegador por 30 dias** ("Não marque em computador compartilhado").
- Botão **Entrar**, link **Voltar** e **Reenviar código** (libera depois de 30 segundos, com a contagem).

### Esqueci a senha (`/esqueci-senha`)

- Campo **E-mail da sua conta** e botão **Mandar o link**.
- Depois de pedir: "Se o e-mail tiver conta no Portal, mandamos um link para criar uma senha nova. Veja a caixa de entrada. O link vale 1 hora."

### Criar a senha (`/redefinir-senha`)

- Aberta pelo botão do e-mail. Título **Crie sua senha** (convite) ou **Senha nova** (esqueci a senha), com o e-mail da conta.
- Campos **Senha nova** e **Repita a senha**, com as regras marcadas enquanto se digita.
- Link vencido, usado ou incompleto: a mensagem e o botão **Pedir outro link**.

## O que dá para fazer

### Entrar

1. E-mail e senha certos:
   - se este navegador foi marcado como confiável para esta pessoa (há menos de 30 dias), entra direto;
   - senão, o Portal manda o código por e-mail e mostra o passo 2.
2. O código vale **10 minutos** e aceita **5 tentativas**. A tela diz quantas restam. Acabaram as tentativas ou o tempo do passo (15 minutos): volta ao passo 1.
3. **Reenviar código** manda um código novo (o anterior deixa de valer). No máximo 3 por minuto.
4. Marcando **Confiar neste navegador**, os próximos 30 dias pedem só a senha neste navegador, para este e-mail.

Outras regras:

- **10 senhas erradas seguidas** travam a conta por **15 minutos** ("Conta travada por excesso de tentativas...").
- A mensagem de erro é sempre "E-mail ou senha não conferem": não revela se a conta existe.
- Pessoa inativa, ou que ainda não criou a senha pelo convite, não entra. Usuários de contas de serviço não entram pela tela.
- Sem envio de e-mail ligado no Portal, ou com e-mail que não recebe mensagens (`.local`, `.invalid`, `.test`, `.example`, `.localhost`), não há como mandar o código: a pessoa entra só com a senha, e a auditoria registra o motivo.
- Se o envio do código falhar, a tela pede para tentar de novo em instantes.
- Toda entrada e toda falha vão para a auditoria (`login_succeeded`, `login_failed`, `conta_travada`).

### Sessão

- A sessão dura **60 minutos** a partir do login (`ACCESS_TOKEN_EXPIRE_MINUTES` no `.env` do backend). Não se renova com o uso.
- Quando vence, o próximo pedido ao Portal leva a pessoa ao login com o aviso de sessão expirada. Depois de entrar, ela **volta para a tela onde estava** (com os filtros do endereço).
- Abrir um link do Portal sem estar logado (ex.: o botão **Continuar processo** de um e-mail) também leva ao login e, depois, de volta ao link.
- Sem lugar para voltar, entra no Painel. Quem não tem o Painel no papel vai para a primeira tela que o papel dá.
- **Sair** (no menu da pessoa, no topo) apaga a sessão deste navegador e volta ao login.

### Esqueci a senha

- Responde sempre igual, exista ou não a conta.
- O link só sai para conta ativa, que não seja de conta de serviço e com e-mail que recebe. No máximo 3 links a cada 15 minutos.
- Quem já tem senha recebe **Redefinir sua senha** (link de 1 hora). Quem ainda não criou a senha recebe o **convite** de novo (48 horas).
- Só o link mais novo vale.

### Convite e criar a senha

- Ao criar uma pessoa em Usuários, o Portal manda **Crie sua senha** com um link que vale **48 horas** e só pode ser usado uma vez. Em Usuários, **Mandar link de senha** manda outro.
- O link leva o código no fim do endereço (`#t=...`), parte que o navegador não manda ao servidor nem a registros; depois de salvar, ele sai da barra de endereço.
- Regras da senha: 8 a 128 caracteres, não ser um caractere repetido, não conter o nome do e-mail.
- Ao salvar: o link é usado, e os outros links, códigos e navegadores confiáveis da pessoa deixam de valer. No primeiro login depois disso, o Portal pede o código. Quem redefiniu recebe um e-mail avisando que a senha foi alterada.
- Vai para a auditoria (`senha.criada`, `senha.redefinida`, `senha.link_enviado`).

## Quem pode

- Login, Esqueci a senha e Criar a senha não pedem login.
- Mandar o convite de novo é de quem tem `usuarios.gerenciar` (tela Usuários).
- Trocar a senha logado e esquecer navegadores ficam em Configurações > Conta e aparência.

## Por dentro

- Tela: `frontend/src/app/login/page.tsx`, `frontend/src/app/esqueci-senha/page.tsx`, `frontend/src/app/redefinir-senha/page.tsx`, `frontend/src/components/auth/login-form.tsx`, `frontend/src/components/auth/senha.tsx`, `frontend/src/components/auth/tela-de-acesso.tsx`
- Sessão no navegador: `frontend/src/lib/auth.ts` (token e navegador confiável no armazenamento local), `frontend/src/components/auth/auth-provider.tsx` (sessão vencida e para onde voltar), `frontend/src/components/auth/protected-route.tsx` (sem login, guarda o endereço e vai ao login), `frontend/src/lib/api.ts` (resposta 401 = sessão vencida)
- API:
  - `POST /auth/login` (`{email, password, dispositivo?}`) — devolve a sessão ou pede o código.
  - `POST /auth/codigo` (`{desafio, codigo, confiar}`) — confere o código.
  - `POST /auth/codigo/reenviar` (`{desafio}`).
  - `POST /auth/esqueci` (`{email}`).
  - `POST /auth/senha/ver` (`{token}`) — confere o link e mostra para quem é.
  - `POST /auth/senha` (`{token, senha}`) — grava a senha.
  - `GET /auth/me` — a pessoa logada (papel e permissões).
- Regras no backend:
  - `backend/modules/access/application/acesso.py` (prazos, tentativas, trava, código, navegador confiável, links, regras da senha)
  - `backend/modules/access/api/acesso.py` (rotas)
  - `backend/modules/access/infrastructure/authentication/tokens.py` e `backend/infrastructure/config.py` (duração da sessão)
