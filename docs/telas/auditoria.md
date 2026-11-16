# Auditoria

Linha do tempo de tudo o que acontece no Portal: o que cada pessoa alterou, entradas e saídas, execuções e o que as máquinas e o próprio Portal fizeram sozinhos. A tela só lê: nada é editado ou apagado por aqui.

A aba fica fora do menu por padrão; quem tem acesso liga em Configurações.

## O que aparece

- **Período**: Hoje, 7 dias (padrão), 30 dias ou Tudo. Os dias seguem o horário de São Paulo.
- **Tipo**: Tudo, Alterações, Acessos, Execuções ou Sistema.
  - Acessos: entrar, sair, tentar entrar, sessões e desafios das automações diretas.
  - Execuções: pedir, acompanhar, ver telas, parar execuções, fila, jobs, disparo de agendamento, arquivo baixado.
  - Sistema: o que foi feito por Agent, automação direta ou pelo próprio Portal.
  - Alterações: o resto do que uma pessoa fez (criar, editar, apagar...).
- **Pessoa**: lista de quem aparece na auditoria.
- **Busca** por ação, tipo de recurso, id do recurso ou id de quem fez.
- **Agrupar por**: Dia (padrão), Pessoa ou Ação. Cada grupo mostra o total de eventos.
- **A linha do tempo**: cada evento vira uma frase ("Ana Souza cadastrou a máquina ...", "Ana Souza alterou Agendamentos"); ação sem frase própria aparece com o nome técnico em palavras (ex.: "segredo criado"). Cada linha tem a hora, tipo e, para chamadas à API, o código da resposta. Bolinha vermelha marca resposta de erro (400 ou mais) e login que falhou.
- **Carregar mais**, de 80 em 80 eventos.
- **Detalhe do evento** (painel ao lado, ao clicar), com abas:
  - **O que foi**: quem (com e-mail), ação técnica, recurso, endereço e método (chamadas à API), resposta e tempo, IP de origem; e "O que mudou" (comparação antes/depois), "Criado com" ou "Como estava antes de apagar".
  - **Na mesma ação**: tudo o que o mesmo clique gravou, incluindo os registros técnicos.
  - **Da pessoa** (ou **Do autor**): o que o mesmo autor fez do dia anterior ao dia seguinte.
  - **Do item**: tudo o que já aconteceu com aquele recurso.

Chaves com nomes sensíveis (`value`, `secret`, `password`, `token`, `authorization`, `api_key`, `private_key`, `credential`, `cookie`) aparecem como `[REDACTED]` no detalhe.

## O que dá para fazer

- Filtrar por período, tipo, pessoa, ação e busca. Os filtros ficam no endereço da página (dá para mandar o link).
- Clicar no nome de alguém para ver só a linha do tempo dessa pessoa. Agrupado por Pessoa ou Ação, o título do grupo tem "ver só esta pessoa" / "ver só esta ação".
- Abrir um evento e navegar pelos relacionados (clicar num relacionado abre o detalhe dele).
- A lista se atualiza sozinha a cada 30 s.

## O que entra na auditoria

- Eventos de negócio gravados pelos próprios módulos (ex.: `secret`, `service_account`, `agent.*`, `direto.*`, login).
- **Toda alteração feita por uma pessoa** (POST, PUT, PATCH, DELETE com login de pessoa ou conta de serviço) gera um registro técnico `api.<método>` com rota, resposta e tempo. Ficam de fora: o login, o tráfego das máquinas (`/direto`, `/agents/`, gateway) e leituras (GET).
- Quando a mesma requisição já gravou um evento de negócio, o registro técnico some da linha do tempo normal e só aparece em "Na mesma ação" e "Do item".
- Registros antigos de "abriu a tela" não aparecem na linha do tempo normal (só em "Do item").
- O Portal não apaga a auditoria: a limpeza do sistema a mantém sempre.

## Quem pode

- A funcionalidade **auditoria** só tem o nível **ver**. Ela dá `auditoria.ver` e `audit.read`; as três rotas da tela exigem `audit.read`.
- Admin vê tudo.

## Por dentro

- Tela: `frontend/src/app/(dashboard)/audit/page.tsx`, `frontend/src/components/audit/auditoria-view.tsx`, `frontend/src/lib/auditoria.ts` (frases, tipos e nomes dos recursos), `frontend/src/components/shared/json-diff.tsx`
- API:
  - `GET /governance/auditoria/eventos` — linha do tempo, da mais nova; filtros `de`, `ate`, `usuario`, `tipo`, `acao`, `busca`, `recurso_tipo`, `recurso_id`, `correlacao`, `tecnicos`; `antes` e `limite` para paginar.
  - `GET /governance/auditoria/grupos?por=dia|usuario|acao` — total por grupo.
  - `GET /governance/auditoria/pessoas` — quem aparece, para o filtro de pessoa.
- Regras no backend:
  - `backend/modules/governance/api/auditoria.py` (rotas e permissão)
  - `backend/modules/governance/domain/auditoria.py` (tipos, agrupamentos, intervalo em horário de São Paulo)
  - `backend/modules/governance/infrastructure/repositories/sqlalchemy_auditoria.py` (filtros, esconder registros técnicos, nomes das pessoas)
  - `backend/modules/governance/api/registro_de_requisicoes.py` (registro automático de toda alteração)
  - `backend/modules/governance/domain/configuracoes.py` (auditoria "Guardado sempre" na limpeza)
