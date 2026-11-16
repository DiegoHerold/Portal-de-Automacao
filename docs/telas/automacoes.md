# Automações

O Catálogo das automações: o que dá para rodar, de que categoria é, se está rodando ou na fila e como foi a última execução. Cada automação tem a sua página, com o que roda agora, os itens, as entradas, os arquivos entregues, o histórico e a parte técnica (versões, disparos, segredos e acessos).

## Lista de automações (`/automations`)

### O que aparece

- **Busca** por nome ou slug, filtro **Todas as categorias** e o botão **Arquivadas (N)**, que troca a lista para as arquivadas ("Voltar ao Catálogo" desfaz).
- Botão **Nova automação** (só para quem gerencia automações).
- Um cartão por automação, com:
  - categoria e nome (clicar no cartão abre a página da automação);
  - marcas: **Arquivada**, **Inativa**, **Rodando (N)** (pisca enquanto há execução) e **N na fila**;
  - descrição (ou "Sem descrição.");
  - a última execução ("Última há 2 h · Concluída") ou "Ainda não rodou";
  - botões **Executar** ou **Restaurar** (nas arquivadas), e os ícones **Editar** e **Arquivar** para quem gerencia.
- A lista mostra só as automações das categorias que a pessoa pode ver (admin vê todas). Rodando, fila e última execução se atualizam sozinhos (a cada 30 s ou 60 s, e ao vivo quando há aviso do Painel).

### O que dá para fazer

- **Executar**: abre a janela de execução (a mesma da página da automação; ver abaixo). O botão só aparece se a automação está ativa, não arquivada, e a pessoa pode executá-la.
- **Editar** (lápis): formulário com nome, slug, descrição, categoria, executor, prioridade padrão (`critical`, `high`, `normal`, `low`), tempo limite (s), tentativas, Ativa, **Gatilho** e **Workers por prioridade**.
  - Gatilho **Agendamento**: cria ou muda o agendamento da automação (Todo dia, Dias da semana, Mensal ou Data específica, horário e fuso).
  - Gatilho **Manual** ou **Webhook** com um agendamento já existente: o agendamento é **arquivado** ao salvar.
  - Gatilho **Webhook** não cria webhook: só aponta para a tela Webhooks.
  - Workers por prioridade: é gravado, mas o despacho pela Fila não usa essa preferência.
- **Arquivar** (caixa): pede confirmação. A automação sai do Catálogo e não pode mais ser executada; histórico, itens, campos e auditoria ficam guardados.
- **Restaurar**: volta a automação ao Catálogo (ativa).
- **Nova automação**: ver "Como uma automação entra no Portal".

## Página da automação (`/automations/{id}`)

### Cabeçalho

Nome, link para o Catálogo, "Rodando agora (N)" ou "Parada", quantos estão na fila, a descrição e o botão **Executar** (desabilitado se arquivada). Automação arquivada mostra um aviso com o botão **Restaurar**.

As abas ficam no endereço (`#geral`, `#itens`, `#campos`, `#arquivos`, `#historico`, `#tecnico`), então dá para mandar o link de uma aba.

### Janela Executar

- Se a automação tem itens: lista dos itens **ativos** com busca, **Marcar todos / os achados**, **Limpar** e **Incluir as filiais de cada matriz escolhida** (marcado por padrão; a filial aparece como "vai com a matriz"). O botão mostra quantos vão: "Executar 12 empresa(s)".
- **Informações do pedido**: os campos de entrada da automação (aba Entradas), já com os valores padrão. Campo com erro fica marcado com o motivo.
- O Portal confere tudo antes de pôr na fila: automação arquivada ou inativa é recusada; precisa haver versão publicada; de 1 a 2000 itens (automação sem itens roda sem escolher nada); parâmetros até 64 KB.
- Ao pedir, a execução vai para a Fila com a última versão publicada. Pedido igual que já estava na fila não é repetido (o aviso diz quantos).

### Aba Visão geral

- **Agora**: o monitor de cada execução desta automação rodando, ao vivo (ou relendo a cada 30 s).
- **Para executar**: o que a automação pede (o tipo de item e os campos; `*` = obrigatório), com o link "Ver as entradas".
- **Na fila**: posição, itens, início previsto e duração estimada de cada pedido, com o link para a Fila.
- **Últimas execuções**: as 5 mais recentes, com o link "Ver o histórico".

### Aba Itens (também em `/automations/{id}/itens`)

O cadastro do que a automação processa (empresas, clientes...). O nome da aba vem do manifesto ("Empresas").

- Contagem "N ativos de M", busca por código ou nome e **Filtros** (Ativos, Inativos, Todos; padrão: Ativos).
- Cada item mostra código, nome, "filial de X" (quando é filial) e as colunas que mudam o tempo do trabalho marcadas como sim.
- Marcar itens abre uma barra no rodapé com **Executar** (abre a janela Executar com esses itens).
- Para quem edita itens:
  - **Novo** e **Editar** (lápis): código (não muda depois), grupo/matriz (se a automação tem grupo), nome, as colunas do item e **Ativo** (inativo não aparece para executar). Atributos guardados sem coluna aparecem como "Também guardado".
  - **Importar**: lê o `empresas.db` da Integração Contábil (`.db` ou `.sqlite`, até 20 MB), mostra Novos, Alterados (com o que mudou), Iguais e erros, e só grava ao clicar **Gravar N**. Com erro, não grava. Até 5000 itens por vez.
  - **Cadastro mandado pela automação**: quando a automação manda a tabela de itens dela ao conectar, aparece um aviso ("A automação mandou o cadastro de empresas dela...") com **Ver e aprovar** e **Descartar**. Nada entra sem aprovação; dá para escolher linha a linha. Linhas com erro não entram.
- Toda mudança em item vai para a auditoria.

### Aba Entradas

Os campos da automação, em duas listas:

- **Informações do pedido**: pedidas a cada execução (ex.: competência).
- **Colunas de cada item** (só se a automação tem itens): guardadas no cadastro de cada item (ex.: pasta de destino).

Cada campo tem nome (a chave é gerada do nome na criação e não muda depois), tipo (Texto, Texto longo, Número, Número inteiro, Sim ou não, Data, Mês/ano, Lista de opções, E-mail, Pasta, Dados avançados JSON), Obrigatório, valor padrão, ajuda e, nas colunas, **Muda o tempo** (entra na estimativa). Lista de opções pede as opções, uma por linha. Dá para subir, descer, remover e criar (**Novo campo**). **Salvar campos** só habilita quando algo mudou.

Regras:
- A automação manda os campos dela ao conectar: o Portal só acrescenta, o que foi editado aqui continua valendo, e o que ela deixou de mandar fica marcado **fora de uso** (não é pedido ao executar). Campos que vieram dela têm a marca "da automação".
- Enquanto ninguém salvou, valem os campos sugeridos pelo manifesto; ao salvar, passam a valer os desta tela.
- Campo novo chega à automação no pedido, mas só tem efeito se o código dela usar esse campo.
- Apagar uma coluna não apaga o que já está guardado nos itens.
- Se outra pessoa salvou antes, a gravação é recusada ("Recarregue e refaça").
- Os mesmos campos conferem o pedido do botão Executar e dos webhooks.

### Aba Arquivos

O que a automação entregou (planilhas, TXT, o resultado de cada lote), do mais novo ao mais antigo, 50 por vez, com busca por parte do nome ou pelo código exato do item e **Carregar mais**. Só entram arquivos na situação "disponível". Cada arquivo mostra o item (ou "do lote"), quando e o tamanho, e o botão **Baixar**. As imagens dos passos não entram aqui. Cada download vai para a auditoria.

### Aba Histórico

Todas as execuções desta automação, 30 por vez, com **Carregar mais**. Cada linha leva à execução.

### Aba Técnico

- **Versões e publicação**: a origem do pacote (GitHub `dono/repositório @ branch`, upload de um ZIP ou "cadastrada à mão") e a lista de versões, com situação e runtime.
  - **Verificar atualização** (só com origem GitHub): compara o último commit da pasta da automação com o importado e avisa se há versão nova. Não importa nada sozinho.
  - **Nova versão**: manifesto YAML (precisa ter `schema_version`, `runtime` e `entrypoint`; o `automation.id` deve ser a chave da automação), notas da versão e origem (repositório, branch, tag, commit, build).
  - Por versão: **Pacote** (envia o ZIP; limite de tamanho em Governança > Limites), **Validar** (manifesto com erro deixa a versão bloqueada), **Publicar** (exige pacote válido e a versão de runtime publicada, salvo automação externa; a versão publicada anterior passa a depreciada), **Depreciar** e **Bloquear** (motivo opcional). Todas pedem confirmação.
  - Clicar numa versão abre o detalhe: Resumo, Pacote, Validação (erros com campo, valor recebido e esperado), Origem e Técnico (JSON).
- **Como roda**: tipo (executor), prioridade padrão, tempo limite e tentativas extras; e **Onde roda**: as máquinas inscritas para esta automação no modo direto, com versão, último sinal e situação (Aprovada, Esperando aprovação, Em quarentena, Revogada). Só quem gerencia máquinas vê essa lista. Link "Gerenciar em Máquinas".
- **Disparos automáticos**: os agendamentos da automação (regra e Ligado/Desligado) e os webhooks dela (último uso e situação), com links para a Agenda e para Webhooks. Sem nenhum: "Roda só quando alguém pede."
- **Segredos que usa** (só para quem vê Segredos): os segredos ligados, que a automação lê com `a.segredo("chave")`, com campos, último uso e situação. Quem gerencia Segredos pode **Ligar** um segredo e desligar (X).
- **Acessos**: explica que o acesso normal vem dos times (pela categoria) e leva às **Exceções de acesso**.
- **Para quem desenvolve** (recolhido): ID, chave, slug e o JSON da automação.

## Acesso da automação (`/automations/{id}/acessos`)

"Quem pode o quê nesta automação": as exceções, por pessoa ou por time.

- **Dar acesso**: escolher uma pessoa ou um time que ainda não está na tabela; entra com "Ver execuções".
- Tabela com uma linha por pessoa ou time e as caixas: **Ver execuções**, **Ver telas e logs** (imagens de cada passo e o log ao vivo, com dados de clientes), **Editar itens**, **Executar** e **Controlar** (parar e retomar). Cada caixa grava na hora; tirar todas retira o acesso.
- Uma ação puxa outras: Ver telas e logs, Executar e Editar itens dão Ver execuções; Controlar dá Executar e Ver execuções.
- Sem exceções, valem só as permissões da categoria (pelos times), que dão "Ver execuções" e "Executar", nunca telas e logs.
- Toda mudança vai para a auditoria.

## Como uma automação entra no Portal

Toda automação nasce de um manifesto (`automation.yaml`; schema em `contracts/manifests/automation-manifest.schema.json`). O `automation.id` do manifesto é a chave da automação no Portal: importar de novo um manifesto com a mesma chave acrescenta uma versão à automação que já existe.

1. **Enviar pacote ZIP** (Nova automação > Enviar pacote ZIP): o ZIP deve ter o `automation.yaml` na raiz ou dentro de uma única pasta. O Portal valida o manifesto e empacota; mostra nome, chave, versão, runtime, tamanho, SHA-256, erros e se a versão já foi importada. Se válido, preenche-se o mesmo formulário do Editar e clica-se **Criar automação**. **Cancelar** descarta o envio. A prévia expira em 30 minutos.
2. **Importar do GitHub** (Nova automação > Importar do GitHub): conectar a conta (GitHub App), escolher o repositório, o branch e **Carregar projetos**. O Portal lê o `automation-workspace.yaml` da raiz e lista os `automation.yaml` encontrados, marcando inválidos, já importados e chaves repetidas. Escolhe-se um, **Configurar automação** e **Criar automação**. Depois, pushes no repositório marcam "há versão nova" na origem (webhook do GitHub), e **Verificar atualização** confere na hora.
3. **Nova versão na aba Técnico**: manifesto colado e pacote enviado à parte, depois Validar e Publicar.
4. **Automação externa (modo direto)**: manifesto com `entrypoint.type: "externa"`. Publica sem pacote nem runtime do Portal; a automação já está instalada na máquina e fala com o Portal pelo SDK Python (`sdk/python/`, pacote `portal_automacoes`). A máquina se inscreve com um código de uso único gerado em Máquinas e precisa ser aprovada lá. Ao conectar, ela manda os campos e a tabela de itens, que aparecem nas abas Entradas e Itens.

Na criação pelo ZIP ou GitHub, a categoria é obrigatória. A primeira versão já entra publicada se a versão de runtime pedida estiver publicada; senão (e nas versões seguintes), fica para publicar na aba Técnico.

## Quem pode

- **Ver** (`automacoes.ver`, que dá `automation.read`): abre a lista e as páginas. A lista e a página mostram só automações das categorias em que a pessoa pode ver (pelos times dela ou permissões próprias).
- **Gerenciar** (`automacoes.gerenciar`, que dá `automation.create`, `automation.update`, `automation.publish` e `automation.block`): mostra Nova automação, Editar, Arquivar e Restaurar na lista; libera importar (ZIP e GitHub) e as Exceções de acesso.
- Conferências do backend por automação:
  - editar, arquivar e restaurar: "editar" na categoria (`automation.update`);
  - executar (botão Executar e itens): ação **Executar** na automação; o botão do cartão depende também do Painel (`painel.ver`);
  - ver itens e entradas: **Executar** ou **Editar itens**; os atributos dos itens, editar, importar e aprovar o cadastro da automação: **Editar itens**;
  - Arquivos: **Ver telas e logs**;
  - Acesso da automação: `automacoes.gerenciar`;
  - "Onde roda": `maquinas.gerenciar`; Segredos que usa: `segredos.ver` / `segredos.gerenciar`.
- Na aba Técnico, as ações de versão (Nova versão, Pacote, Validar, Publicar, Depreciar, Bloquear) aparecem para quem abre a aba e, no backend, só exigem login.
- O botão Restaurar da página e o Executar do cabeçalho aparecem para todos; o backend confere ao clicar.
- Admin vê e faz tudo.

## Por dentro

- Tela:
  - Lista: `frontend/src/app/(dashboard)/automations/page.tsx`, `frontend/src/components/automations/automations-manager.tsx`, `automation-card.tsx`, `automation-form.tsx`, `new-automation-dialog.tsx`, `zip-import-flow.tsx`, `github-import-flow.tsx`, `frontend/src/lib/automation-config.ts`
  - Página: `frontend/src/app/(dashboard)/automations/[id]/page.tsx`, `frontend/src/components/automacao/automacao-view.tsx`, `executar-automacao.tsx`, `arquivos-da-automacao.tsx`, `tecnico-da-automacao.tsx`, `frontend/src/components/automations/automation-versions-panel.tsx`
  - Itens: `frontend/src/app/(dashboard)/automations/[id]/itens/page.tsx`, `frontend/src/components/itens/itens-da-automacao.tsx`, `proposta-da-automacao.tsx`
  - Entradas: `frontend/src/components/campos/editor-de-campos.tsx`, `campo-de-entrada.tsx`, `frontend/src/lib/campos.ts`
  - Acesso: `frontend/src/app/(dashboard)/automations/[id]/acessos/page.tsx`, `frontend/src/components/acessos/acessos-da-automacao.tsx`
- API (principais):
  - `GET /automations`, `GET /automations/{id}` — lista e uma automação.
  - `PUT /automations/{id}` — editar; `DELETE /automations/{id}` — arquivar; `POST /automations/{id}/restaurar`.
  - `PUT /automations/{id}/worker-preferences`; `POST /schedules`, `PUT /schedules/{id}`, `DELETE /schedules/{id}` — o gatilho do Editar.
  - `GET /painel`, `GET /painel/recentes`, `GET /painel/executaveis`, `GET /fila`, `GET /historico?automacao=` — rodando, fila, última execução, quem executa e histórico.
  - `POST /automations/import/upload`, `POST /automations/import/{staging_id}/confirm`, `DELETE /automations/import/{staging_id}` — importação por ZIP (e confirmação da do GitHub).
  - `GET /integrations/github`, `POST /integrations/github/connect`, `GET /integrations/github/{id}/repositories`, `.../branches`, `POST .../discover`, `POST /integrations/github/{id}/import` — importação do GitHub.
  - `GET /automations/{id}/formulario`, `PUT /automations/{id}/formulario` — entradas.
  - `GET|POST /automations/{id}/itens`, `PUT /automations/{id}/itens/{chave}`, `POST .../itens/importar/previa`, `POST .../itens/importar`, `GET|DELETE .../itens/proposta`, `POST .../itens/proposta/aprovar`, `POST .../itens/pedir-execucao` — itens e Executar.
  - `GET /automations/{id}/arquivos`, `GET /automations/{id}/arquivos/{arquivo}/baixar` — arquivos.
  - `GET /automations/{id}/sources`, `POST /automations/{id}:sync`, `GET|POST /automations/{id}/versions`, `POST /automation-versions/{id}/validate|publish|deprecate|block`, `POST /automation-versions/{id}/package-uploads`, `PUT /package-uploads/{id}/bytes`, `POST /package-uploads/{id}/complete|abort` — versões e pacote.
  - `GET /webhooks?automacao=`, `GET /schedules`, `GET /instancias-diretas`, `GET /segredos/da-automacao/{id}`, `POST|DELETE /segredos/da-automacao/{id}/{segredo}` — blocos do Técnico.
  - `GET|PUT /automations/{id}/acessos` — exceções de acesso.
- Regras no backend:
  - `backend/modules/catalog/api/routes.py`, `backend/modules/catalog/application/use_cases/automations.py`, `versions.py`, `packages.py` (catálogo, versões, publicação)
  - `backend/modules/catalog/api/imports.py`, `api/github_integrations.py`, `application/use_cases/imports.py`, `infrastructure/import_packaging.py` (importação)
  - `backend/modules/catalog/domain/manifest.py` (manifesto)
  - `backend/modules/catalog/api/itens.py`, `domain/itens.py` (itens e o pedido de execução)
  - `backend/modules/catalog/api/formulario.py`, `domain/formulario.py` (entradas)
  - `backend/modules/storage/api/arquivos_da_automacao.py` (arquivos)
  - `backend/modules/access/api/concessoes.py`, `application/concessoes.py`, `domain/concessao.py` (acesso por automação)
  - `backend/modules/fleet/api/instancias_diretas.py` (máquinas do modo direto)
  - `backend/modules/orchestration/triggers/api/webhooks.py` (`/webhooks/github`, aviso de versão nova)
