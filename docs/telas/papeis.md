# Papéis

Tabela que diz o que cada papel pode usar no Portal: uma linha por funcionalidade (cada item do menu), uma coluna por papel. Só administradores mudam.

## Como funciona o acesso no Portal

O acesso tem três camadas:

1. **Papel** (esta tela): **quais telas** a pessoa usa. Cada pessoa tem um papel só.
2. **Times** (tela Times): **em quais automações** a pessoa trabalha, por categoria (ver, executar, editar, publicar) ou por automação (ver execuções, ver telas e logs, executar, controlar, editar itens).
3. **Exceções** (aba Acessos de cada automação): ações dadas direto a uma pessoa naquela automação.

Regras:

- Cada funcionalidade fica em **—** (não entra), **Ver** (abre a tela) ou **Gerenciar** (vê e altera: criar, editar, apagar). Gerenciar inclui Ver.
- Cada nível dá a chave própria (`historico.ver`, `usuarios.gerenciar`...), que é o que as telas e a API conferem, e as permissões técnicas que aquela área usa (`automation.read`, `execution.cancel`...).
- O menu mostra só as funcionalidades do papel. Abrir uma tela fora do papel pelo endereço mostra "Sem acesso a ..." ("O seu papel não inclui esta aba"). Quem não tem o Painel é levado para a primeira tela que o papel dá.
- O esconder/mostrar da tela é só conforto: o backend confere de novo em cada pedido.
- **Admin** passa em tudo, sempre. A coluna dele mostra "Tudo" e não muda.
- O papel abre a tela; o que aparece dentro dela ainda depende dos times. Ex.: com Histórico em Ver, a pessoa só vê as execuções das automações que os times (ou as exceções) dão a ela.
- **Configurações** não tem funcionalidade: qualquer pessoa logada abre.
- **Papéis de antes** (sem a tabela salva): o nível de cada funcionalidade é deduzido das permissões gravadas e do nome do papel. Na primeira vez que um administrador muda a tabela de um papel, ela passa a mandar.

## Funcionalidades

| Grupo | Funcionalidade | Chave | Níveis | O que "Gerenciar" libera |
|---|---|---|---|---|
| Monitorar | Painel | `painel` | Ver, Gerenciar | Central de telas: vê as telas de todas as máquinas |
| Monitorar | Fila | `fila` | Ver, Gerenciar | Reordenar, cancelar na fila e decidir jobs perdidos |
| Monitorar | Máquinas | `maquinas` | Ver, Gerenciar | Cadastrar e apagar máquinas, aprovar automações diretas |
| Monitorar | Histórico | `historico` | Ver | — |
| Operação | Execuções | `execucoes` | Ver, Gerenciar | Criar, cancelar e repetir execuções |
| Operação | Fluxos | `fluxos` | Ver, Gerenciar | Criar, editar, publicar e executar fluxos |
| Operação | Webhooks | `webhooks` | Ver, Gerenciar | Criar e editar webhooks |
| Operação | Agendamentos | `agendamentos` | Ver, Gerenciar | Criar, mudar e disparar agendamentos |
| Catálogo | Automações | `automacoes` | Ver, Gerenciar | Cadastrar, importar, publicar e dar acessos às automações |
| Catálogo | Categorias | `categorias` | Ver, Gerenciar | Criar, editar e apagar categorias |
| Catálogo | Runtimes | `runtimes` | Ver, Gerenciar | Cadastrar runtimes |
| Infraestrutura | Agents | `agents` | Ver, Gerenciar | Ligar, desligar, atualizar e diagnosticar Agents |
| Infraestrutura | Armazenamento | `armazenamento` | Ver | — |
| Segurança | Auditoria | `auditoria` | Ver | — |
| Segurança | Segredos | `segredos` | Ver, Gerenciar | Criar e trocar segredos |
| Segurança | Contas de serviço | `contas_de_servico` | Ver, Gerenciar | Criar, revogar e apagar contas de serviço |
| Pessoas e acesso | Usuários | `usuarios` | Ver, Gerenciar | Criar, editar e desativar pessoas; escolher papel e times |
| Pessoas e acesso | Times | `times` | Ver, Gerenciar | Criar times, pôr pessoas e dar acesso às automações |
| Pessoas e acesso | Papéis | `papeis` | Ver | — (mudar papéis é só do Admin) |
| Pessoas e acesso | Organizações | `organizacoes` | Ver, Gerenciar | Criar e editar organizações |
| Governança | Limites | `limites` | Ver, Gerenciar | Mudar os limites do sistema |
| Governança | Retenção | `retencao` | Ver, Gerenciar | Mudar por quanto tempo telas, logs e arquivos ficam guardados |
| Governança | E-mails | `emails` | Ver, Gerenciar | Domínios permitidos, reenviar e mandar e-mail de teste |

A página Pendências usa a funcionalidade do Painel.

## O que aparece

- Um texto curto explicando Ver e Gerenciar (e, para quem não é admin, "Só administradores mudam os papéis").
- Botão **Novo papel** (só admin).
- A tabela: linhas agrupadas como no menu, com o nome da funcionalidade e, quando existe, o que "Gerenciar" libera. No topo de cada coluna: nome do papel, quantas pessoas têm o papel e "sistema" para os papéis do sistema. Para admin, os botões Editar (lápis) e Apagar (lixeira) do papel.
- Cada célula: para admin, uma caixa de escolha (—, Ver, Gerenciar); para os outros, só o nível escrito.

## O que dá para fazer

Só administradores (papel `admin`):

- **Mudar uma célula**: grava na hora, sem botão de salvar. Aparece um aviso "Papel: Funcionalidade em ...". Vale para todas as pessoas do papel no próximo pedido delas.
- **Novo papel**: nome (2 a 100 caracteres, sem repetir), descrição (opcional, até 500) e **Baseado em**: copia a coluna de outro papel (o Admin não aparece na lista). Sem base, o papel novo começa só com o Painel em Ver.
- **Editar** (lápis): muda nome e descrição.
- **Apagar** (lixeira): só para papéis criados por vocês. Os papéis do sistema (`admin`, `manager`, `operator`, `viewer`) não são apagados. Se houver pessoas no papel, é preciso escolher para qual papel elas vão; sem pessoas, a janela avisa que o papel não pode ser recuperado.
- O papel Admin não muda de tabela: tem todas as funcionalidades.

Toda mudança vai para a auditoria (`papel.criado`, `papel.alterado`, `papel.apagado`), com o antes e o depois.

## Quem pode

- **Ver** (`papeis.ver`): abre a tela e vê a tabela. Papéis não tem Gerenciar.
- **Mudar** (criar, editar a tabela, renomear, apagar): só o papel **Admin**. Os outros recebem 403 ("Só administradores mudam os papéis").

## Por dentro

- Tela: `frontend/src/app/(dashboard)/roles/page.tsx`, `frontend/src/components/roles/roles-manager.tsx`
- Menu e guarda das telas: `frontend/src/lib/navigation.ts`, `frontend/src/lib/permissions.ts` (`podeVer`, `podeGerenciar`), `frontend/src/components/layout/app-shell.tsx`
- API:
  - `GET /papeis` — papéis com a tabela de cada um e `pode_editar`.
  - `GET /papeis/funcionalidades` — o catálogo de funcionalidades.
  - `POST /papeis` — cria (`nome`, `descricao`, `baseado_em`).
  - `PUT /papeis/{id}` — muda nome, descrição ou a tabela (`funcionalidades`).
  - `DELETE /papeis/{id}?substituto=` — apaga e move as pessoas.
- Regras no backend:
  - `backend/modules/access/domain/funcionalidades.py` (catálogo, níveis, o que cada nível dá, dedução dos papéis de antes)
  - `backend/modules/access/application/papeis.py` (criar, alterar, apagar, papéis do sistema)
  - `backend/modules/access/api/papeis.py` (só admin muda)
  - `backend/modules/access/application/use_cases.py` (`PermissionChecker`: admin passa sempre)
  - `backend/modules/access/api/authorization.py` (`precisa`, usado nas rotas)

## Funcionalidade nova

1. Acrescente uma `Funcionalidade` em `FUNCIONALIDADES` (`backend/modules/access/domain/funcionalidades.py`), com o que Ver e Gerenciar dão.
2. Proteja as rotas com `<chave>.ver` / `<chave>.gerenciar`.
3. Ponha `funcionalidade` no item do menu (`frontend/src/lib/navigation.ts`).

Ela aparece na tabela com "—" em todos os papéis, menos o Admin, até um administrador liberar.
