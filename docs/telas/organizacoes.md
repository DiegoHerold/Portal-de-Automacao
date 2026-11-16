# Organizações

Cadastro das organizações: contextos administrativos aos quais times, segredos e configurações podem pertencer. Todo time pertence a uma organização.

## O que aparece

- Filtros escondidos (abrir para usar): **Pesquisar** (nome ou chave) e **Status** (Ativa, Desabilitada, Arquivada).
- Botão **Nova organização** (só para quem gerencia).
- Uma tabela com: **Organização** (nome e chave), **Status**, **Criada**, **Atualizada** e os botões **Contexto**, **Editar** e **Excluir** (os dois últimos só para quem gerencia).
- Sem organizações: "Nenhuma organização encontrada", com o botão Criar organização para quem gerencia.

### Contexto

Abre um painel lateral com abas:

- **Visão geral**: ID, status, criada e atualizada. Explica que usuários e contas de serviço não entram aqui (as rotas deles não filtram por organização).
- **Times** (para quem vê Times): até 5 times da organização e o link **Abrir tela**.
- **Secrets** (para quem tem `secret.read_metadata`): até 5 segredos da organização.
- **Governança** (para quem vê Limites e Retenção): limites e políticas de retenção gravados com esta organização.

## O que dá para fazer

- **Nova organização**: nome, chave e status inicial (Ativa, Desabilitada ou Arquivada). Nome e chave são obrigatórios. A chave é gravada sem espaços nas pontas e em minúsculas; chave repetida é recusada.
- **Editar**: muda nome, chave e status. Chave repetida também é recusada.
- **Excluir**: pede confirmação em janela ("Esta ação é permanente"). Só é permitido quando a organização não tem usuários, times, contas de serviço, segredos, limites nem políticas de retenção ligados a ela. Senão, o backend recusa (409).
- **Contexto**: abre o painel descrito acima.

Criar, editar e excluir vão para a auditoria (`organization_created`, `organization_updated`, `organization_deleted`).

Hoje o status da organização é só informativo: nenhuma regra do Portal muda por ele.

## Quem pode

- **Ver** (`organizacoes.ver`): o item no menu, a lista e o Contexto.
- **Gerenciar** (`organizacoes.gerenciar`): criar, editar e excluir.
- As abas do Contexto dependem de outras funcionalidades: Times (`times.ver`), Secrets (`secret.read_metadata`) e Governança (`limites.ver` e `retencao.ver`).
- Sem Ver, a tela mostra "Esta área exige privilégios administrativos."
- Admin vê e gerencia tudo.

## Por dentro

- Tela: `frontend/src/app/(dashboard)/organizations/page.tsx`, `frontend/src/components/organizations/organizations-manager.tsx`
- API:
  - `GET /organizations` — lista.
  - `POST /organizations`, `PUT /organizations/{id}`, `DELETE /organizations/{id}` — cria, edita, exclui.
  - `GET /teams?organization_id=` — aba Times.
  - `GET /secrets?organization_id=` — aba Secrets.
  - `GET /governance/system-limits?organization_id=` e `GET /governance/retention-policies?organization_id=` — aba Governança.
- Regras no backend:
  - `backend/modules/access/api/routes.py` (rotas)
  - `backend/modules/access/application/use_cases.py` (`CreateOrganization`, `UpdateOrganization`, `DeleteOrganization`)
  - `backend/modules/access/infrastructure/repositories/sqlalchemy_access.py` (chave em minúsculas, chave única, bloqueio da exclusão)
