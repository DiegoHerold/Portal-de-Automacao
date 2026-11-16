# Usuários

Cadastro das pessoas que entram no Portal. Cada pessoa tem **um papel** (quais telas usa) e **times** (em quais automações trabalha). A senha é criada pela própria pessoa, pelo convite que chega por e-mail.

## O que aparece

- Botão **Novo usuário** no topo.
- Uma tabela, em ordem de nome, com:
  - **Nome** e **E-mail**;
  - **Papel** (etiqueta com o nome do papel);
  - **Times** da pessoa (etiquetas; time desligado aparece apagado). Sem time: "nenhum";
  - **Status**: **Ativo**, **Inativo** ou **Aguardando criar senha** (ativo, mas ainda não criou a senha pelo convite);
  - **Ações**: O que acessa (escudo), Mandar link de senha (chave), Editar (lápis) e Apagar (lixeira).
- Sem nenhum usuário: "Sem usuários — Crie o primeiro usuário."
- Os usuários técnicos das contas de serviço não aparecem aqui; ficam em Contas de serviço.

### O que a pessoa acessa

O botão do escudo abre, abaixo da linha, um resumo só de leitura em três blocos:

- **Telas**: pelo papel. Lista o que a pessoa "vê e altera" (gerenciar) e o que "só vê". Link **Mudar em Papéis**.
- **Automações (pelos times)**: cada time da pessoa, com as categorias (ver, executar, editar, publicar) e as automações com acesso direto pelo time (ver execuções, ver telas e logs, executar, parar e retomar, editar itens). Time desligado aparece com "(time desligado: não vale)". Link **Mudar em Times**.
- **Exceções**: acessos dados direto à pessoa na aba Acessos de uma automação, com link para a automação. Se ainda houver permissões por categoria antigas gravadas direto na pessoa, aparece um aviso: elas continuam valendo até serem retiradas.

## O que dá para fazer

- **Novo usuário**: nome, e-mail, papel e, se houver times cadastrados, os times da pessoa (caixas de marcar; time inativo aparece marcado como "inativo"). Marca **Usuário ativo** (vem marcada). Não há campo de senha.
  - O botão **Criar** só habilita com nome, e-mail e papel.
  - E-mail repetido é recusado. O e-mail é gravado normalizado (minúsculas).
  - Ao criar, o Portal manda o **convite** por e-mail: um link para a pessoa criar a própria senha, que **vale 48 horas** e só pode ser usado uma vez. O aviso na tela diz se o convite saiu.
  - Se o envio de e-mail estiver desligado ou o e-mail não receber mensagens (domínios `.local`, `.invalid`, `.test`, `.example`, `.localhost`), o convite não sai; use **Mandar link de senha** depois.
  - Até criar a senha, a pessoa não consegue entrar (o status fica "Aguardando criar senha").
- **Editar**: muda nome, e-mail, papel, times e Ativo. Os times marcados passam a ser exatamente os times da pessoa (entra nos novos, sai dos desmarcados). Desmarcar **Usuário ativo** impede a pessoa de entrar. Usuário de conta de serviço não é editado aqui.
- **Mandar link de senha** (só para usuário ativo): manda de novo o link de criar a senha (48 h). Serve para quem não recebeu o convite ou perdeu a senha. Só o link mais novo vale; os anteriores deixam de valer. Se o envio de e-mail estiver desligado, a tela mostra o erro.
- **Apagar**: pede confirmação do navegador ("Apagar o usuário ...?").
  - Ninguém apaga o próprio usuário.
  - Se a pessoa já pediu execuções, ela **não é removida**: fica inativa (para manter o histórico).
  - Usuário de conta de serviço é apagado em Contas de serviço.
- **O que acessa**: abre o resumo descrito acima.

Criar, editar, apagar, mudar times e mandar link vão para a auditoria (`user_created`, `user_updated`, `user_deleted`, `usuario.times.definidos`, `senha.link_enviado`).

Permissão por categoria não fica mais na pessoa: fica no time. A rota antiga `PUT /users/{id}/permissions` responde 410.

## Quem pode

- **Ver** (`usuarios.ver`): o item no menu, a lista e o resumo "O que acessa".
- **Gerenciar** (`usuarios.gerenciar`): criar, editar, apagar e mandar link de senha.
- Os times do formulário dependem de **Times**: listar exige `times.ver`; gravar os times da pessoa exige `times.gerenciar`. Quem vê os times mas não os gerencia consegue salvar a pessoa, mas a gravação dos times falha em seguida (a tela mostra "Falha ao salvar").
- A tela mostra os botões para todos que a abrem; quem não pode gerenciar recebe o erro do backend (403) ao salvar.
- Admin vê e gerencia tudo.

## Por dentro

- Tela: `frontend/src/app/(dashboard)/users/page.tsx`, `frontend/src/components/users/users-manager.tsx`, `frontend/src/components/users/resumo-de-acesso.tsx`
- API:
  - `GET /users` — lista (sem os usuários técnicos), com `aguardando_senha`.
  - `POST /users` — cria e manda o convite; a resposta traz `convite_enviado`.
  - `PUT /users/{id}` — edita.
  - `DELETE /users/{id}` — apaga (ou inativa, se a pessoa já pediu execuções).
  - `POST /users/{id}/convite` — manda o link de criar a senha de novo.
  - `GET /users/{id}/times` e `PUT /users/{id}/times` — times da pessoa (`{"times": [1, 4]}`).
  - `GET /roles` — papéis para o formulário.
  - `GET /teams` — times para o formulário.
  - `GET /acesso/pessoas` — os times de cada pessoa (coluna Times).
  - `GET /acesso/pessoas/{id}` — o resumo "O que acessa".
- Regras no backend:
  - `backend/modules/access/api/routes.py` (rotas de usuários)
  - `backend/modules/access/application/use_cases.py` (`CreateUser`, `UpdateUser`, `DeleteUser`)
  - `backend/modules/access/api/acesso.py` e `backend/modules/access/application/acesso.py` (convite e link de senha)
  - `backend/modules/access/api/times.py` e `backend/modules/access/application/times.py` (times da pessoa)
  - `backend/modules/access/api/acesso_da_pessoa.py` (resumo de acesso)
