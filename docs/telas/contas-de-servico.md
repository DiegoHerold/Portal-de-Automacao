# Contas de serviço

Credenciais para sistemas (ERP, Power BI, scripts) que chamam a API do Portal sem ser uma pessoa. O acesso funciona como o de uma pessoa: o **papel** diz quais áreas da API a conta usa e os **times** dizem em quais automações. Para só disparar uma automação de fora, um webhook já basta.

A aba fica fora do menu por padrão; quem tem acesso liga em Configurações.

## O que aparece

- Texto explicando para que serve a conta e, para quem gerencia, o botão **Nova conta**.
- **Tabela** com uma linha por conta:
  - **Conta**: nome e descrição;
  - **Papel**;
  - **Times** ("nenhum" se não houver);
  - **Credencial**: final da credencial em uso (`psa_…abcd`) e há quanto tempo foi gerada, ou "nenhuma";
  - **Último uso** ("nunca" se ainda não foi usada) e a data de vencimento, se houver;
  - **Situação**: **Ativa**, **Vencida**, **Desativada** ou **Sem credencial**;
  - para quem gerencia, os botões **Editar**, **Gerar nova credencial** e **Apagar**.

## O que dá para fazer

- **Nova conta**: nome (o sistema que vai usar), descrição opcional, papel, times e vencimento opcional.
  - Nome obrigatório, até 180 caracteres, sem repetir outra conta.
  - O papel **Administrador** não aparece e é recusado pelo backend. Se nenhum papel serve, crie em Papéis um só com o que o sistema precisa.
  - Os times só podem ser escolhidos por quem consegue listar Times; para os outros a tela avisa "Só quem vê Times escolhe os times da conta".
  - O vencimento precisa ser no futuro.
  - Ao criar, abre **Guarde a credencial agora**: a credencial (`psa_` + 43 caracteres) aparece uma única vez, com botão **Copiar** e um exemplo de teste com `curl`. A janela só fecha depois de marcar "Guardei a credencial num lugar seguro". O Portal guarda só o SHA-256 e os 4 últimos caracteres.
- **Editar**: muda nome, descrição, papel, times, vencimento e **Conta ativa** (desmarcar corta o acesso sem apagar). Editar não troca a credencial. Conta sem credencial só pode ser ativada depois de gerar uma.
- **Gerar nova credencial** (confirmação): a credencial atual para de funcionar na hora e a nova aparece uma única vez, na mesma janela de "guarde agora". Atualize o sistema logo em seguida.
- **Apagar** (confirmação): apaga a conta e o usuário técnico dela; a credencial para de funcionar e a conta sai dos times. O que ela fez continua na auditoria. Se a conta já tem registros ligados a ela (execuções pedidas, por exemplo), o backend recusa (409) e pede para desativar em vez de apagar.

Tudo vai para a auditoria: `conta_de_servico.criada`, `conta_de_servico.alterada`, `conta_de_servico.credencial_gerada`, `conta_de_servico.apagada`.

## Como o sistema usa a credencial

- Sempre no cabeçalho `Authorization: Bearer psa_...`, nunca na URL.
- Cada conta tem um usuário técnico com o papel e os times escolhidos. Ele não entra pela tela de login e não aparece em Usuários. A conta também pode receber exceções na aba Acessos da automação.
- O Portal recusa a credencial quando ela é desconhecida (ou foi trocada), a conta está desativada ou vencida, ou o usuário técnico está inativo. Cada recusa vai para a auditoria (`conta_de_servico.recusada`, com o motivo, sem a credencial).
- O "último uso" é marcado no máximo uma vez por minuto.
- As alterações feitas pela conta aparecem na Auditoria em nome do usuário técnico, com a conta nos detalhes.

## Quem pode

- **Ver** (`contas_de_servico.ver`): abre a tela e a lista.
- **Gerenciar** (`contas_de_servico.gerenciar`): mostra Nova conta e os botões de cada linha; criar, editar, gerar credencial e apagar exigem esta chave no backend.
- Admin vê e gerencia tudo.

## Por dentro

- Tela: `frontend/src/app/(dashboard)/service-accounts/page.tsx`, `frontend/src/components/service-accounts/service-accounts-manager.tsx`
- API:
  - `GET /contas-de-servico` — lista.
  - `POST /contas-de-servico` — cria e devolve a credencial uma única vez (sem cache).
  - `PUT /contas-de-servico/{id}` — nome, descrição, papel, times, vencimento e situação.
  - `POST /contas-de-servico/{id}/credencial` — gera nova credencial (a anterior para na hora; sem cache).
  - `DELETE /contas-de-servico/{id}` — apaga a conta e o usuário técnico.
  - `GET /roles` e `GET /teams` — papéis e times para o formulário (só para quem gerencia).
- Regras no backend:
  - `backend/modules/access/api/contas_de_servico.py` (rotas)
  - `backend/modules/access/application/contas_de_servico.py` (validação, credencial, autenticação, auditoria)
  - `backend/modules/access/api/dependencies.py` (aceita `Bearer psa_...` no login da API)
  - `backend/modules/governance/api/registro_de_requisicoes.py` (alterações da conta na auditoria)
  - As rotas antigas `/service-accounts` respondem 410 (`backend/modules/access/api/routes.py`).
