# Armazenamento

Lista os artefatos (arquivos de resultado) que as execuções enviaram ao Portal, para localizar, conferir e baixar. A tela só consulta: não envia, não apaga e não move arquivos.

A aba fica fora do menu por padrão; quem tem acesso liga em Configurações.

## O que aparece

- **Resumo no topo**, calculado só sobre a página carregada: artefatos nesta página, prontos para baixar (Disponível), falhas de envio e volume somado.
- **Filtros**: nome do artefato (busca por parte do nome, sem diferenciar maiúsculas), ID da execução e status (`created`, `uploading`, `available`, `failed`). Vale ao clicar **Localizar** ou apertar Enter.
- **Tabela**, do mais novo para o mais antigo: nome e tipo do arquivo, ID da execução, tamanho, status (**Disponível**, **Enviando**, **Falhou** ou o valor bruto, como `created`) e data de criação. Em cada linha, **Detalhes** e o botão de baixar.
- **Paginação** de 50 em 50 (**Anterior** / **Próxima**). A API não informa o total.
- **Detalhes** (painel lateral), em três abas:
  - **Resumo**: status, botão **Baixar**, motivo da falha (se falhou), execução, tentativa, tarefa, tipo, tamanho, criado e enviado em.
  - **Metadados**: o JSON de metadados do artefato. Chaves com nomes sensíveis (`value`, `secret`, `password`, `token`, `authorization`, `api_key`, `private_key`, `credential`, `cookie`) aparecem como `[REDACTED]`.
  - **Técnico**: ID, SHA-256, objeto armazenado, sessão de upload e data da falha.

## O que dá para fazer

- **Localizar** artefatos pelos filtros.
- **Ver detalhes** de um artefato.
- **Baixar**: só para artefato **Disponível**. Com armazenamento local, o Portal devolve o arquivo; com S3, redireciona para um link temporário de download. Artefato que não está disponível responde 409; arquivo sumido do armazenamento responde 404 e a tela avisa "Não foi possível baixar o artefato".

Regras de visibilidade:

- A lista mostra só artefatos de execuções cujas automações a pessoa pode ver (`can_view` na automação). Os outros são retirados da página sem aviso.
- Por isso uma página pode vir com menos de 50 itens mesmo havendo mais artefatos; nesse caso **Próxima** fica desabilitada. Use os filtros para chegar ao que procura.
- Abrir o detalhe ou baixar também confere se a pessoa vê a execução de origem.

## Quem pode

- A funcionalidade **armazenamento** só tem o nível **ver**. Ela dá `armazenamento.ver`, `artifact.read` e `artifact.download`.
- Sem `artifact.read`, a tela mostra "Você não tem permissão para consultar artefatos armazenados" e o backend recusa a lista.
- O botão de baixar só aparece com `artifact.download`. No backend, o download confere apenas se a pessoa vê a execução.
- Admin vê tudo.

## Por dentro

- Tela: `frontend/src/app/(dashboard)/storage/page.tsx`, `frontend/src/components/storage/storage-manager.tsx`; `frontend/src/lib/api.ts` (`apiDownload`), `frontend/src/lib/governance-utils.ts` (`redactSensitiveData`)
- API:
  - `GET /artifacts?limit=50&offset=&search=&execution_id=&status=` — lista filtrada (exige `artifact.read`).
  - `GET /artifacts/{id}/download` — baixa o arquivo (só `available`).
- Regras no backend:
  - `backend/modules/storage/api/routes.py` (rotas, filtro por execução visível, download local ou S3)
  - `backend/modules/storage/application/use_cases/artifacts.py` (casos de uso)
  - `backend/modules/storage/infrastructure/repositories/sqlalchemy_storage.py` (consulta e ordenação)
  - `backend/modules/storage/domain/` (artefato, objeto armazenado, sessão de upload, estados)
