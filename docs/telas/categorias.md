# Categorias

Categorias organizam as automações por área (Fiscal, Contábil, RH...). Toda automação pertence a uma categoria, e o acesso dos times às automações é dado por categoria.

## O que aparece

- Botão **Nova categoria** no topo.
- Um cartão por categoria, em ordem alfabética, com:
  - nome;
  - slug (identificador curto, em minúsculas);
  - situação: **Ativa** ou **Inativa**;
  - descrição (ou "Sem descrição.");
  - botões **Editar** (lápis) e **Apagar** (lixeira).
- Sem nenhuma categoria visível: "Sem categorias — Crie a primeira categoria."
- A lista mostra só as categorias em que a pessoa pode ver automações (pelas permissões por categoria dela e dos times dela). Admin vê todas, inclusive as inativas.

## O que dá para fazer

- **Nova categoria**: nome, slug, descrição (opcional) e Ativa. O botão Criar só habilita com nome e slug preenchidos. O slug é gravado sem espaços nas pontas e em minúsculas. Slug repetido é recusado ("Category slug already exists").
- **Editar**: muda nome, slug, descrição e Ativa. Slug repetido também é recusado.
- **Apagar**: pede confirmação do navegador ("Apagar a categoria ...?"). Apesar do nome, a categoria **não é removida**: ela fica **Inativa**. As automações dela continuam lá. Para reativar, edite e marque Ativa.

Criar, editar e apagar vão para a auditoria (`category.created`, `category.updated`, `category.archived`).

## Para que a categoria é usada

- **Automações**: cada automação tem uma categoria (escolhida ao cadastrar ou importar). A lista de Automações agrupa por ela.
- **Times**: em Times, cada time recebe ações por categoria (ver, executar etc.). Quem está no time ganha essas ações em todas as automações da categoria.
- **Permissões da automação**: várias conferências do backend ("ver", "executar", "editar" da categoria) usam a categoria da automação. Exceções por automação ficam na aba **Acesso** da automação.

## Quem pode

- **Ver** (`categorias.ver`): mostra o item no menu e abre a tela (sem a funcionalidade no papel, a tela mostra "Sem acesso a Categorias"). Nos papéis antigos, ainda sem a tabela de funcionalidades salva, todos têm "ver". A lista em si respeita as permissões por categoria descritas acima.
- **Gerenciar** (`categorias.gerenciar`): criar, editar e apagar. O backend recusa com 403 quem não tem.
- A tela mostra Nova categoria, Editar e Apagar para todos; quem não pode gerenciar recebe o erro ao salvar.
- Admin vê e gerencia tudo.

## Por dentro

- Tela: `frontend/src/app/(dashboard)/categories/page.tsx`, `frontend/src/components/categories/categories-manager.tsx`
- API:
  - `GET /categories` — lista (filtrada pelas permissões por categoria, exceto para admin).
  - `POST /categories` — cria.
  - `PUT /categories/{id}` — edita.
  - `DELETE /categories/{id}` — marca como inativa.
- Regras no backend:
  - `backend/modules/catalog/api/routes.py` (rotas, `categorias.gerenciar`, filtro por categoria)
  - `backend/modules/catalog/application/use_cases/categories.py` (slug único, auditoria)
  - `backend/modules/catalog/infrastructure/repositories/sqlalchemy_catalog.py` (gravação; apagar = inativar)
  - `backend/modules/access/domain/times.py` (permissões por categoria da pessoa e dos times)
