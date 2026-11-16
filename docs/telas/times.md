# Times

Grupos de pessoas que recebem acesso às automações juntas. É no time que se diz **em quais automações** a pessoa trabalha: por categoria (todas as automações dela) ou por automação. As telas que a pessoa usa vêm do papel, não do time.

## O que aparece

- Filtros escondidos (abrir para usar): **Organização**, **Pesquisar** (nome ou chave) e **Status** (Ativo, Desabilitado, Arquivado). A organização escolhida fica no endereço (`?organization_id=`).
- Botão **Novo time** (só para quem gerencia).
- Uma tabela com: **Time** (nome e chave), **Organização**, **Status**, **Criado** e os botões **Membros e permissões**, **Editar** e **Excluir** (os dois últimos só para quem gerencia).
- Sem times: "Nenhum time encontrado", com o botão Criar time para quem gerencia.

### Membros e permissões

Abre um painel lateral com o nome do time. Time que não está ativo mostra o aviso "Time desabilitado: os membros não ganham nada dele enquanto estiver assim". O painel tem três seções:

- **Membros**: lista (nome, e-mail, "inativo" para pessoa inativa), a caixa **Escolha uma pessoa…** com o botão **Adicionar**, e o botão de tirar cada membro.
- **Por categoria**: todas as categorias, cada uma com as marcas **Ver**, **Executar**, **Editar** e **Publicar**, e o botão **Salvar**.
- **Por automação**: as automações com acesso pelo time, cada uma com as ações possíveis, a caixa **Escolha uma automação…** com o botão **Dar acesso**, e o botão de tirar o acesso.

## O que dá para fazer

- **Novo time**: organização, nome, chave e status inicial (Ativo, Desabilitado ou Arquivado). Organização, chave e nome são obrigatórios. Depois de criar, abra Membros e permissões.
- **Editar**: muda organização, nome, chave e status.
- **Excluir**: pede confirmação em janela ("Esta ação é permanente"). Os membros perdem as permissões que vinham do time.
- **Adicionar membro**: escolhe uma pessoa que ainda não está no time. Vale na hora.
- **Tirar membro**: botão ao lado da pessoa. Vale na hora, sem confirmação.
- **Por categoria**: marque e clique **Salvar** (o botão só habilita quando algo mudou). A lista enviada substitui a do time. Regras:
  - **Ver**: ver as automações da categoria e as execuções.
  - **Executar**: pedir execução.
  - **Editar**: criar, editar e apagar o cadastro das automações (as três juntas).
  - **Publicar**: publicar versões.
  - Marcar Executar, Editar ou Publicar marca Ver junto. Desmarcar Ver desmarca tudo da categoria.
  - Categoria sem nenhuma marca sai do time.
- **Por automação**: **Dar acesso** começa com "Ver execuções". Cada marca grava na hora. Ações possíveis:
  - **Ver execuções**;
  - **Ver telas e logs** (inclui ver execuções);
  - **Executar** (inclui ver execuções);
  - **Controlar**: parar e retomar (inclui executar e ver execuções);
  - **Editar itens** (inclui ver execuções).
  - O botão da lixeira retira todas as ações do time naquela automação.
  - É a mesma configuração da aba Acessos da automação.

Regras gerais:

- Quem é membro de um time **ativo** ganha o que o time dá, somado ao que já tinha. Sai do time, perde.
- Time **desabilitado** ou **arquivado** não dá nada aos membros.
- "Ver telas e logs", "Editar itens" e "Controlar" só existem por concessão explícita (ou para admin): telas e logs mostram dados de clientes.
- Cadastro, membros, categorias e concessões vão para a auditoria (`team_created`, `team_updated`, `team_deleted`, `time.membros.adicionados`, `time.membro.removido`, `time.categorias.definidas`, `automacao.concessao.definida`, `automacao.concessao.retirada`).

## Quem pode

- **Ver** (`times.ver`): o item no menu, a lista e o painel Membros e permissões.
- **Gerenciar** (`times.gerenciar`): criar, editar e excluir times, adicionar e tirar membros, salvar as permissões por categoria.
- A seção **Por automação** grava pelas concessões da automação e exige `automacoes.gerenciar`.
- Os botões de membros e permissões aparecem para quem abre o painel; sem a permissão, o backend recusa (403) e a tela mostra "Não foi possível".
- Admin vê e gerencia tudo.

## Por dentro

- Tela: `frontend/src/app/(dashboard)/teams/page.tsx`, `frontend/src/components/teams/teams-manager.tsx`, `frontend/src/components/teams/time-detalhes.tsx`
- API:
  - `GET /teams` (`?organization_id=`) — lista.
  - `POST /teams`, `PUT /teams/{id}`, `DELETE /teams/{id}` — cria, edita, exclui.
  - `GET /organizations` — organizações para filtro e formulário.
  - `GET /teams/{id}/detalhes` — membros, categorias, automações e ações possíveis.
  - `POST /teams/{id}/membros` (`{"usuarios": [3, 7]}`) e `DELETE /teams/{id}/membros/{user_id}`.
  - `PUT /teams/{id}/categorias` — substitui as permissões por categoria.
  - `PUT /automations/{id}/acessos` (`{"team_id": 2, "acoes": [...]}`; lista vazia retira).
  - `GET /users`, `GET /categories`, `GET /automations` — listas para escolher.
- Regras no backend:
  - `backend/modules/access/api/routes.py` e `backend/modules/access/application/use_cases.py` (cadastro do time)
  - `backend/modules/access/api/times.py`, `backend/modules/access/application/times.py`, `backend/modules/access/domain/times.py` (membros e categorias)
  - `backend/modules/access/api/concessoes.py`, `backend/modules/access/application/concessoes.py`, `backend/modules/access/domain/concessao.py` (acesso por automação)
  - `backend/modules/access/infrastructure/repositories/sqlalchemy_times.py` e `sqlalchemy_grants.py` (só time ativo vale)
