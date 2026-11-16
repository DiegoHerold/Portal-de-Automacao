# Fila

Mostra quem espera para rodar, em qual máquina deve rodar, quando começa, quando termina e por que
ainda não começou. Também é onde se decide o que fazer com jobs perdidos.

## O que aparece

- **Topo**: "Atualizada às HH:MM:SS", com bolinha verde quando a tela recebe avisos ao vivo e
  amarela quando não (aí relê a cada 30 s). Botão **Atualizar**.
- **Resumo** (faixa escura):
  - **Esperando**: jobs na fila;
  - **Telas livres**: máquinas online, sem sessão bloqueada, sem job perdido e com a tela
    livre, sobre o total;
  - **Fila termina**: horário previsto para o último job terminar, ou "Sem previsão" com quantos
    jobs não têm previsão;
  - **Perdidos**: jobs aguardando decisão (em destaque quando há algum).
- **Jobs perdidos** (só quando há): um cartão por job, com automação, máquina, horário em que se
  perdeu, itens e motivo.
- **Máquinas**: um cartão por máquina com a situação (Online, Sem sinal, Sessão bloqueada, Job
  perdido), "Tela livre" ou "Tela ocupada" e o que roda nela por tipo (Tela, Navegador, Segundo
  plano), com "termina em ~N min" ou o motivo de não haver previsão. Quem não é admin vê que a
  máquina está ocupada, mas não por qual job.
- **Esperando**: a lista de jobs, na ordem da fila, com:
  - posição; automação, tipo (Tela, Navegador, Segundo plano) e itens (até 4, depois "+N");
  - máquina prevista (selo "fixa" quando o job só pode rodar naquela máquina);
  - início → término previstos e "começa em ...";
  - estimativa (ou "pelo menos N" quando só parte das etapas tem histórico, ou "Sem previsão");
  - prioridade, com setas para subir e baixar;
  - os motivos da espera, em amarelo (por exemplo: rodando pela primeira vez, máquina sem sinal,
    sessão do Windows bloqueada, nenhuma máquina tem esta automação, job atual da máquina já
    passou da estimativa) e as etapas sem histórico.

Motivos que citam uma automação que a pessoa não vê aparecem sem o nome dela.

## Como a fila escolhe o próximo

- Ordem: prioridade maior primeiro; depois quem tem posição manual; depois a ordem de chegada do
  pedido; dentro do mesmo pedido, os jobs mais longos primeiro (sem estimativa vai por último).
- Cada job vai para a máquina compatível que fica livre antes. Compatível é a máquina com Agent
  habilitado ou com instância direta aprovada daquela automação.
- Automação de tela: no máximo um job por máquina, somando modo agente e modo direto.
- Job que retoma um job perdido (Continuar) só vai para a máquina onde parou, a não ser que a
  automação guarde o progresso fora da máquina.
- A previsão e o despacho usam as mesmas regras. O despacho roda a cada 5 s.
- O limite do sistema "execuções ao mesmo tempo" (tela Limites) segura os jobs na fila.
- Nenhum horário é inventado: sem histórico, a previsão fica vazia e o motivo aparece.

## O que dá para fazer

- **Por que espera** (ícone de interrogação): explica a posição (prioridade, posição manual,
  horário do pedido), a máquina escolhida e quando ela fica livre.
- **Subir / baixar prioridade**: muda a prioridade em 1 a cada clique. Só para job que ainda não
  começou.
- **Cancelar job**: pede confirmação. O job sai da fila e nada é desfeito em máquina nenhuma; para
  rodar depois, é preciso pedir de novo. Só para job que ainda não começou.
- **Job perdido — Continuar**: o job volta para a fila e retoma do último ponto registrado. Se o
  progresso ficou na máquina, só roda nela e espera ela voltar. A tela da máquina é liberada.
  Antes, confira na máquina se a automação não ficou parada no meio de uma tela.
- **Job perdido — Recomeçar do zero**: descarta o progresso e o job volta para a fila desde o
  início, para qualquer máquina compatível. Itens já feitos serão feitos de novo: confira se isso
  não duplica lançamentos.

Jobs perdidos nunca voltam para a fila sozinhos. Eles surgem quando a máquina com Agent para de
responder no meio do job. No modo direto não há job perdido: 2 min sem comunicação cancelam a
execução com erro e liberam a máquina.

## Quem pode

- `fila.ver` (ou `automacoes.ver`): abre a tela. Só aparecem jobs e perdidos das automações em que
  a pessoa pode ver execuções.
- `fila.gerenciar`: mudar prioridade, cancelar job e decidir jobs perdidos. Além disso, a pessoa
  precisa poder executar a automação daquele job.
- Os botões aparecem para todos; sem a permissão, a API recusa e a tela mostra o erro.
- Admin vê qual job ocupa cada máquina e pode tudo.

## Por dentro

- Tela: `frontend/src/app/(dashboard)/fila/page.tsx`,
  `frontend/src/components/fila/fila-manager.tsx`, `frontend/src/lib/fila.ts`
- API:
  - `GET /fila` — jobs, perdidos e máquinas com previsões e motivos (relida a cada 30 s).
  - `GET /fila/avisos` — SSE que avisa "mudou" quando a fila muda.
  - `PATCH /fila/jobs/{job_id}` — prioridade (e posição manual).
  - `POST /fila/jobs/{job_id}/cancelar` — cancela job que não começou.
  - `POST /fila/jobs/{job_id}/decisao` — `{"decisao": "continuar" | "recomecar"}` para job perdido.
- Regras no backend: `backend/modules/dispatch/api/fila.py`,
  `backend/modules/dispatch/domain/fila.py` (ordem, previsão, escolha de máquina),
  `backend/modules/dispatch/application/use_cases/queue.py` (`VerFila`, `DespacharFila`, textos
  dos motivos), `backend/modules/orchestration/application/use_cases/queue.py`
  (`DecidirJobPerdido`), `backend/workers/tasks/dispatch_tasks.py` (despacho a cada 5 s).
