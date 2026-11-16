# Fluxos

Um fluxo é um programa em passos que usa automações no meio: roda automações em sequência ou divididas entre
máquinas, repete, decide por condições, pergunta a uma pessoa e chama outros fluxos. Monta-se em cartões, no
estilo do Power Automate, sem escrever código.

## O que aparece

**Lista (`/flows`)**: um cartão por fluxo, com a versão publicada, se o rascunho mudou depois dela e quando foi
editado. Busca por nome e a opção "Mostrar arquivados". Em cada fluxo: Execuções, Executar (se publicado) e
Arquivar/Reativar.

**Editor (`/flows/{id}`)**, que ocupa toda a área do Portal:
- **Topo numa linha**: ← para a lista, nome (clique para renomear), versão publicada, "Pronto para publicar" ou
  "N pendências", "Salvo há…", desfazer/refazer, Funções, Execuções, Executar, tela cheia e **Publicar versão**.
- **Quadro** com os cartões ligados por uma linha. O primeiro é "Quando o fluxo começar" (entradas e variáveis).
  Entre dois passos há um **+**. Condição, Perguntar e Tentar abrem **ramos lado a lado**; repetições mostram os
  passos de dentro numa caixa "Faça". Cada cartão tem ícone, nome e um resumo em frase, com **fichas** para os
  valores (nunca código).
- **Painel à direita** ao clicar num cartão: o formulário daquele passo e, embaixo, os **valores dinâmicos**.
- **Barra do quadro** (canto inferior esquerdo): Seleção, Mão, zoom, 100% e Ajustar à tela.

**Execução ao vivo (`/flows/execucoes/{id}`)**: os cartões da versão que está rodando, com o passo atual
destacado ("Agora" ou "Esperando") e um sinal em cada passo por onde já passou (ou onde falhou). Ao lado: resultado
ou motivo da falha, o que a execução espera agora, variáveis, entradas, fluxos chamados e a linha do tempo.
Atualiza a cada 2 segundos até terminar.

**Histórico (`/flows/{id}/execucoes`)**: situação, quando começou, duração, versão, quem executou (à mão ou
chamado por outro fluxo) e o motivo da falha. Atualiza a cada 5 segundos.

## Os passos

| Grupo | Passo | O que faz |
|---|---|---|
| Automações | Executar automação | Põe a automação na fila e espera terminar. Itens e parâmetros opcionais. "Se falhar": tentar de novo N vezes, esperando X minutos, só com o que falhou. |
| Automações | Dividir automação entre máquinas | Reparte o trabalho em partes que rodam ao mesmo tempo. **Por itens**: cada parte recebe um pedaço da lista de itens. **Por partes do trabalho**: um único item com muito trabalho (ex.: 50 TXT da Planet em 5 máquinas); a automação precisa declarar `aceita_partes` no manifesto e lê a sua parte com `job.parte` no SDK. Número de partes ou itens por parte. |
| Decidir | Condição | Sim e Não (e "senão se" com mais caminhos). A condição se monta em linhas "valor · operador · valor", com E/OU. |
| Repetir | Para cada item | Faz os passos de dentro para cada item de uma lista; o item tem um nome dentro da repetição. |
| Repetir | Repetir um número de vezes · Repetir enquanto / até | Laços com limite de voltas. |
| Repetir | Parar a repetição · Pular para o próximo | Só dentro de uma repetição. |
| Pessoas | Perguntar a uma pessoa | Para o fluxo e pergunta (sino e e-mail com um botão por resposta). Cada resposta é um caminho. Vale a primeira resposta. Responde-se em Pendências ou pelo botão do e-mail. |
| Pessoas | Avisar | Aviso no sino e por e-mail para quem executou ou para um time. |
| Dados | Guardar um valor · Somar à variável · Adicionar à lista | Variáveis do fluxo. |
| Dados | Esperar | Por um tempo ou até uma data, sem ocupar máquina. |
| Dados | Anotar no histórico | Uma linha na linha do tempo (informação, atenção ou erro). |
| Dados | Chamar outro fluxo | Roda a última versão publicada de outro fluxo como passo e espera. Recebe as entradas dele; o valor do "Concluir" dele vai para uma variável. |
| Fim | Tentar e tratar erro | Se algo dentro falhar, segue por "Se falhar" (o motivo pode ir para uma variável). |
| Fim | Concluir · Falhar | Termina com um resultado, ou como falha com o motivo. |

**Resultado de uma automação** (guardado numa variável do tipo resultado): situação (`ok`, `parcial`, `falhou`,
`cancelada`), total ok, total com erro, itens ok, itens com erro, itens em atenção, partes do trabalho com erro,
arquivos entregues e motivo. Guardando o resultado, o fluxo segue mesmo com erro e decide no passo seguinte; sem
guardar, um erro para o fluxo (um "Tentar" pode tratar).

## O que dá para fazer

- **Montar**: "+" abre "Adicionar um passo" (busca e abas por grupo). Clicar num cartão abre o painel.
- **Valores**: cada campo aceita valor digitado ou uma **ficha** (entradas, variáveis, item da repetição, campos
  de um resultado): clique no campo e depois na ficha. O botão **Calcular** do campo monta contas (+ − × ÷ resto),
  item da lista por posição, funções prontas (texto, números, listas, datas) e as funções do fluxo; cada valor
  de dentro aceita ficha ou outra conta.
- **Funções do fluxo** (botão Funções): nome, valores recebidos com tipo, o que devolve e o cálculo (sim/não vira
  uma condição em linhas). Valem dentro do próprio fluxo; para reaproveitar entre fluxos, use "Chamar outro fluxo".
- **Organizar**: arrastar um cartão pela alça e soltar num "+" (inclusive dentro de ramos); "⋯" tem duplicar,
  subir, descer e apagar; Delete apaga o selecionado; Ctrl+Z / Ctrl+Y desfazem e refazem.
- **Quadro**: Ctrl + rolar dá zoom no ponto do mouse; rolar anda (Shift: para os lados); **Seleção (V)** e
  **Mão (H)**; Espaço segurado ou o botão do meio viram a mão; arrastar o fundo também move; Ctrl 0 volta a 100%;
  Shift 1 ajusta à tela. **Tela cheia** esconde o menu e o topo do Portal (Esc sai; no editor, o primeiro Esc fecha
  o painel).
- **Salvar**: o rascunho grava sozinho a cada mudança. O Portal devolve as **pendências** de cada passo, que
  aparecem no cartão e no painel; "N pendências" leva à primeira.
- **Publicar versão**: só com zero pendências; pede notas opcionais. A versão publicada é a que roda; o rascunho
  continua aberto.
- **Executar**: o formulário sai das entradas da versão publicada (listas: um valor por linha) e abre a tela ao
  vivo. Execução roda com as permissões de **quem executou** (precisa poder executar cada automação usada).
- **Na execução**: Pausar, Continuar e Cancelar. Cancelar para também as automações que o fluxo pôs na fila, a
  pergunta em aberto e os fluxos que ele chamou. O que já terminou continua valendo.
- **Arquivar/Reativar** na lista. Fluxo arquivado não executa nem publica.

## Regras importantes

- Uma execução roda a versão publicada no momento em que começou, mesmo que outra seja publicada depois.
- Toda automação passa pela fila normal; fluxos diferentes rodam juntos e disputam as máquinas como qualquer
  execução. Não existe paralelismo genérico: a única divisão é "Dividir automação entre máquinas".
- Limites (Governança > Limites): blocos por fluxo, passos por execução, voltas por laço, duração máxima e partes
  por divisão. Estourar um limite falha a execução com o motivo (não é tratável por "Tentar").
- Chamar outro fluxo: no máximo 10 níveis; chamada circular é recusada ao publicar; a filha usa as mesmas
  permissões da execução que chamou.
- Perguntar: só quem foi perguntado (ou um administrador) responde; quem chegar depois vê quem respondeu.
- A linha do tempo das execuções é apagada pela regra de limpeza "fluxos.passos" (Governança > Retenção).
- Ainda não há agendamento de fluxo (o alvo "fluxo" da Agenda está desligado).

## Quem pode

- `fluxos.ver`: ver a lista, abrir o editor só para leitura (sem "+", sem arrastar, campos travados), ver
  execuções e o histórico.
- `fluxos.gerenciar`: criar, editar, publicar, arquivar, executar, pausar, continuar e cancelar.
- Responder uma pergunta depende de ter sido perguntado (não da funcionalidade).

## Por dentro

- Telas: `frontend/src/components/fluxos/` (`lista-de-fluxos.tsx`, `editor/` com `editor-de-fluxo.tsx`,
  `cartoes.tsx`, `painel.tsx`, `campos.tsx`, `quadro.tsx`, `adicionar-passo.tsx`; `execucao-ao-vivo.tsx`,
  `execucoes-do-fluxo.tsx`, `executar-fluxo.tsx`, `area-de-fluxo.tsx`); árvore e catálogo em
  `frontend/src/lib/fluxos/`; decisões em Pendências: `frontend/src/components/pendencias/decisoes-de-fluxo.tsx`.
- Contrato do fluxo (a árvore salva em JSON): `contracts/flows/v1/` (schema, README e exemplos).
- API (`/api/v1/fluxos`):
  - `GET /fluxos`, `POST /fluxos`, `GET|PUT /fluxos/{id}` (nome, descrição, situação)
  - `PUT /fluxos/{id}/rascunho` (a árvore inteira; devolve `{erros}`), `POST /fluxos/{id}/validar`
  - `POST /fluxos/{id}/publicar` (`{notas}`; recusa 422 `FLUXO_INVALIDO` com `error.details.erros`),
    `GET /fluxos/{id}/versoes/{n}`
  - `POST /fluxos/{id}/executar` (`{entradas}`), `GET /fluxos/{id}/execucoes`
  - `GET /fluxos/execucoes/{id}` (situação, variáveis, passos, `agora`, mãe e filhas),
    `POST /fluxos/execucoes/{id}/pausar|continuar|cancelar`
  - `GET /fluxos/decisoes`, `GET /fluxos/decisoes/{id}`, `POST /fluxos/decisoes/{id}/responder` (`{opcao, via}`;
    409 `JA_RESPONDIDA`)
  - `GET /fluxos/contrato` (o schema)
- Regras no backend: `backend/modules/orchestration/fluxos/`
  - `domain/validador.py` (pendências), `domain/motor.py` (interpretador), `domain/funcoes.py` (funções prontas)
  - `aplicacao.py` (cadastro e publicação), `execucoes.py` (iniciar, fatias, pausar, cancelar, subfluxos, tela ao
    vivo), `efeitos.py` (fila, resultado dos jobs, avisos, perguntas, subfluxo), `decisoes.py`, `limpeza.py`
  - Tarefa que avança as execuções a cada 2 s: `backend/workers/tasks/fluxos_tasks.py`.
- Como o motor roda: o estado inteiro (variáveis e uma pilha de posições na árvore) fica no banco a cada fatia de
  até 200 passos. Qualquer worker retoma de onde parou (`FOR UPDATE SKIP LOCKED`, uma fatia por execução de cada
  vez). Esperas (tempo, automação, pergunta, outro fluxo) gravam `acordar_em` e soltam o worker; responder uma
  pergunta ou o fim de um fluxo chamado acordam a execução na hora. Não há `eval`: a árvore é interpretada.
