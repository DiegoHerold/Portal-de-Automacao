# Painel

Mostra o que está rodando agora, o que espera para começar e as últimas automações. É a primeira
tela do grupo Monitorar (título "Agora").

## O que aparece

- **Indicador ao vivo** no topo: "Ao vivo" (verde) quando a conexão em tempo real está de pé;
  "Reconectando" (amarelo) quando caiu. Sem conexão, a tela relê a cada 30 s.
- **Abas de máquina**: "Todas" e uma aba por máquina, com a situação dela (livre, rodando,
  sessão bloqueada, job perdido, sem sinal). A aba escolhida filtra tudo abaixo e fica lembrada
  no navegador. Ao lado, o link "Linha do tempo das máquinas" leva a Máquinas.
- **Rodando agora**: um cartão (monitor) por execução rodando normal, com:
  - a tela atual e "N s nesta tela" (só com "Ver telas e logs" na automação);
  - automação, máquina e itens; contador de atenções (itens que precisam de uma pessoa);
  - etapa e item atuais, barra de progresso (atual/total);
  - **Falta**, **Termina** (horário previsto) e **Rodando há**. Sem base de histórico, "Falta"
    mostra "Sem previsão" e o motivo;
  - as 3 últimas linhas do log (só com "Ver telas e logs").
- **Pausadas ou esperando**: os mesmos cartões, para execuções paradas em algo. Uma linha
  colorida diz o quê: cancelamento sem resposta, comunicação não ativa (modo direto, com o
  horário em que será cancelada), cancelando, parada pedida, pausa declarada, espera declarada
  ou sem sinal da automação há mais de 10 min.
- **Esperando para começar**: jobs na fila (com "Começa às HH:MM em MÁQUINA" ou o motivo da
  espera) e jobs perdidos aguardando decisão (com link "Decidir", que leva à Fila). Link "Abrir a
  Fila".
- **Nada rodando agora**: aparece quando não há nada, com o horário do próximo job previsto.
- **Últimas automações**: até 3 cartões, um por automação, com a situação da última execução,
  quando, em qual máquina e quais itens. Relê a cada 60 s. Link para o Histórico.
- **Central de telas** (só para quem gerencia o Painel): botão "Monitores / Central de telas" e
  escolha de 1, 2, 4, 6 ou 9 telas por vez. Cada quadro é uma máquina: a tela ao vivo, o log, a
  situação, o progresso e os tempos (de 6 telas em diante, sem log nem tempos). Máquina sem
  execução mostra "Livre" (ou a situação) e o próximo job previsto. O modo e a grade ficam
  lembrados no navegador.

Os relógios andam a cada segundo entre uma atualização e outra. A tela relê quando chega um aviso
de mudança (execução ou fila), com 0,8 s de espera para juntar avisos seguidos.

## O que dá para fazer

- **Executar automação** (botão no topo ou tecla **E**): abre a busca das automações que a pessoa
  pode executar (setas para escolher, Enter para abrir). Escolhida, abre a janela **Executar**:
  escolher os itens (se a automação tiver), preencher os campos do pedido e pôr na fila. Pedido
  igual já na fila não é repetido.
- **Executar / Repetir** nos cartões de Últimas automações: "Repetir" abre a janela com os
  mesmos itens já marcados. Sem permissão de executar, o cartão diz "Você só acompanha esta
  automação".
- **Abrir uma execução**: clicar no cartão leva a Acompanhar (`/execucoes/{id}`).
- **Parar** (no cartão, com a permissão "controlar"): pede confirmação e oferece:
  - "Parar depois do item atual": termina o item em andamento e não começa outro (só no modo
    direto);
  - "Cancelar agora": interrompe o quanto antes; o item em andamento fica interrompido. No modo
    agente esta é a única opção (o Agent encerra o processo).
  Job que ainda está na fila é cancelado na hora.
- **Encerrar no Portal**: só aparece quando o cancelamento ficou 2 min sem resposta. A execução
  fica "cancelada com erro", a máquina é liberada e a automação perde o acesso ao Portal. O
  programa pode ter ficado aberto na máquina: confira antes de rodar de novo.
- **Continuar** (Últimas automações, execução cancelada e ainda não continuada): mostra a prévia
  dos itens que rodam de novo e dos que serão pulados e cria uma execução nova só com o que
  faltou. Depois disso, o cartão mostra "Ver a continuação".

Parar, encerrar e continuar ficam registrados na auditoria.

## Quem pode

- `painel.ver`: abre a tela. Só aparecem execuções, jobs e cartões das automações em que a pessoa
  tem "ver execuções" (por time ou pela aba Acessos da automação). Tela e log pedem "ver telas e
  logs"; Executar pede "executar"; Parar, Encerrar e Continuar pedem "controlar".
- `painel.gerenciar`: libera a **Central de telas** (permissão `central_de_telas`): vê todas as
  execuções e telas, de qualquer automação. Os botões de ação continuam sendo conferidos pela API
  com as permissões da automação.
- Admin vê e faz tudo.

## Por dentro

- Tela: `frontend/src/app/(dashboard)/dashboard/page.tsx`,
  `frontend/src/components/painel/painel-ao-vivo.tsx`,
  `frontend/src/components/painel/disparo-rapido.tsx`,
  `frontend/src/components/painel/controle-da-execucao.tsx`,
  `frontend/src/components/automacao/executar-automacao.tsx`
- API:
  - `GET /painel` — execuções rodando, máquinas, fila e perdidos (relida a cada 30 s).
  - `GET /painel/avisos` — SSE que avisa "mudou" quando qualquer execução ou a fila muda.
  - `GET /painel/recentes?limite=3&maquina=` — últimas automações.
  - `GET /painel/executaveis` — automações que a pessoa pode executar.
  - `GET /automations/{id}/formulario`, `GET /automations/{id}/itens`,
    `POST /automations/{id}/itens/pedir-execucao` — janela Executar.
  - `GET /execucoes/{id}/imagens/{imagem_id}?tamanho=` — imagem da tela (auditada).
  - `POST /fila/execucoes/{id}/parar`, `POST /fila/execucoes/{id}/encerrar`,
    `GET|POST /fila/execucoes/{id}/continuar`.
- Regras no backend: `backend/modules/telemetry/api/painel.py`,
  `backend/modules/telemetry/domain/acompanhamento.py` (situação de cada execução),
  `backend/modules/telemetry/domain/estimativas.py` (previsões),
  `backend/modules/dispatch/api/fila.py`, `backend/modules/dispatch/domain/comunicacao.py`
  (prazos de 30 s, 2 min),
  `backend/modules/orchestration/application/use_cases/queue.py` (`PararExecucao`,
  `ContinuarExecucao`).
