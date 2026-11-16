# Histórico

Mostra o que já rodou: quando, quanto tempo levou comparado ao previsto e como terminou. Também
mostra quanto cada etapa costuma levar, que é a base das previsões da Fila e do Painel. Daqui se
abre a tela **Acompanhar** de qualquer execução.

## O que aparece

Duas abas no topo (a escolhida fica na URL, `?aba=tempos`):

### Execuções

- **Resumo do período**: Execuções, Concluídas (inclui "concluída com atenção"), Com falha (falhou,
  tempo esgotado ou perdida) e Tempo médio (só das concluídas).
- **Período**: Hoje, 7 dias (padrão), 30 dias ou Tudo. Os dias contam no fuso de São Paulo.
- **Filtros** (escondidos atrás do botão "Filtros", com o número de filtros ativos):
  - situação: Todas, Concluídas, Com falha, Canceladas;
  - automação;
  - busca por nome da automação ou item (ex.: 5081).
  - "Limpar filtros" desfaz os três.
  - O filtro de situação é exato: "Concluídas" não inclui "concluída com atenção" e "Com falha"
    não inclui tempo esgotado nem perdida (o resumo do topo inclui).
- **Lista agrupada por dia** ("Hoje", "Ontem", depois o dia da semana e a data), com a quantidade
  do dia. Cada linha mostra:
  - automação, itens (e "e mais N"), máquinas e a mensagem de falha, quando houver;
  - horário de início → fim;
  - duração e a comparação com o previsto no início: "N acima do previsto" (amarelo) ou "N abaixo
    do previsto" (verde) quando a diferença passa de 1 min e de 10%; senão "dentro do previsto";
    "sem previsão no início" quando não havia estimativa;
  - selo da situação.
- **Carregar mais** no fim da lista (40 por vez).
- Só aparecem execuções terminadas. A lista e o resumo relêem a cada 60 s.

### Quanto tempo leva

- Escolha a automação e um item (lista com filtro por código ou nome; se a lista de itens não
  carregar, um campo para digitar o código).
- Para o item: o total que costuma levar somando as etapas e, por etapa:
  - nome; "para este item" ou "uma vez por execução"; quantas vezes rodou e quantas com falha;
  - **tempo típico** (barra grossa): mediana das 5 últimas execuções concluídas da etapa naquele
    item; "sem histórico" quando não há base;
  - **última vez** (barra fina, amarela quando passou mais de 10% do típico) e quando foi;
  - tempo por tarefa, quando a etapa é medida por tarefa.

## O que dá para fazer

- Filtrar e buscar, como acima.
- Clicar numa execução para abrir **Acompanhar** (`/execucoes/{id}`).

## Acompanhar uma execução

Tela de uma execução, ao vivo enquanto roda. Abre a partir do Histórico, do Painel, da Fila, da
linha do tempo de Máquinas e das Pendências.

**O que aparece**

- Título com a automação, o número da execução, a versão e quando foi pedida. Indicador "Ao vivo" /
  "Reconectando" (sem conexão, relê a cada 30 s).
- **Faixa de números**: Situação (com etapa e item atuais), Decorrido, Falta (ou "Sem previsão" e
  o motivo), Término previsto (ou o horário em que terminou) e Progresso (atual/total).
- Itens aguardando uma pessoa (quando a execução já terminou), com o botão "Continuar processo"
  (ver Pendências).
- Linha da situação quando algo segura a execução (cancelando, parada pedida, sem comunicação,
  sem sinal...). Pausa aparece em faixa própria e não conta na estimativa.
- Ligação com a execução de origem ou com a continuação, quando houver.
- **Precisa de uma pessoa**: atenções levantadas pela automação, com item e motivo.
- **Tela agora / Última tela**: a imagem atual com "N s nesta tela", a trilha de passos com
  imagem, setas para voltar a passos anteriores, "Voltar ao vivo" e ampliar a imagem.
- **Log ao vivo**: até as últimas 1000 linhas, com hora, item e cor por nível; acompanha o fim do
  log enquanto a pessoa não rolar para cima. Botão "Mostrar esperas / Ocultar esperas".
- **Etapas: estimativa e tempo real**: por etapa e item, a situação (A fazer, Fazendo, Feita,
  Erro, Interrompida), a estimativa, o tempo real e de onde veio a estimativa.
- **Onde roda**: um cartão por job com máquina, modo (direto ou Agent), tentativa, situação,
  itens, quanto falta e a falha.
- Sem "ver telas e logs", tela, passos e log são trocados por um aviso de conteúdo restrito.

**O que dá para fazer**

- **Parar**, **Encerrar no Portal** e **Continuar** (com "controlar"), iguais aos do Painel.
- **Detalhes técnicos**: abre `/executions/{id}` (ver Execuções).
- Ampliar uma imagem fica registrado na auditoria; ver telas e miniaturas também, uma vez a cada
  10 min por pessoa e execução. Imagem apagada pela retenção não abre.

## Quem pode

- Histórico: `historico.ver` (ou `automacoes.ver`). Só aparecem execuções das automações em que a
  pessoa pode ver execuções; o resumo conta só essas. A aba "Quanto tempo leva" pede ver execuções
  na automação escolhida.
- Acompanhar: não depende de funcionalidade do menu, só da automação: "ver execuções" para abrir,
  "ver telas e logs" para tela, passos e log, "controlar" para Parar, Encerrar e Continuar.
- Esta funcionalidade só tem o nível "ver".

## Por dentro

- Tela: `frontend/src/app/(dashboard)/historico/page.tsx`,
  `frontend/src/components/historico/historico-view.tsx`,
  `frontend/src/app/(dashboard)/execucoes/[id]/page.tsx`,
  `frontend/src/components/acompanhar/acompanhar-execucao.tsx`,
  `frontend/src/components/acompanhar/imagem-do-passo.tsx`, `frontend/src/lib/acompanhar.ts`
- API:
  - `GET /historico?dias=&situacao=&automacao=&busca=&limite=40&antes=` — execuções terminadas,
    com cursor.
  - `GET /historico/resumo?dias=&automacao=` — os números do topo.
  - `GET /automations` — lista para os filtros.
  - `GET /automations/{id}/itens?limite=500`, `GET /automations/{id}/tempos?item=` — aba
    "Quanto tempo leva".
  - `GET /execucoes/{id}/acompanhar` — tudo da tela Acompanhar.
  - `GET /execucoes/{id}/logs?depois=&limite=300&esconder_espera=` — log ao vivo.
  - `GET /execucoes/{id}/imagens/{imagem_id}?tamanho=miniatura|media|cheia` — imagens.
  - `GET /execucoes/{id}/avisos` — SSE de mudança.
  - `GET /pendencias/execucoes/{id}` — itens aguardando uma pessoa.
- Regras no backend: `backend/modules/telemetry/api/painel.py` (Histórico e resumo),
  `backend/modules/telemetry/infrastructure/repositories/sqlalchemy_painel.py`,
  `backend/modules/telemetry/api/acompanhar.py`, `backend/modules/telemetry/api/routes.py`
  (tempos), `backend/modules/telemetry/domain/estimativas.py`,
  `backend/modules/telemetry/application/use_cases/estimates.py`,
  `backend/modules/telemetry/domain/acompanhamento.py`.
