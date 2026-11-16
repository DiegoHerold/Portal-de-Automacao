# Máquinas

Linha do tempo de cada máquina: o que rodou, o que roda agora e o que a fila prevê. Para quem
gerencia, também é onde se cadastram e apagam máquinas e se aprovam as automações em modo direto.

## O que aparece

- **Janela da linha do tempo**: 3 h (2 h antes e 1 h depois de agora), 12 h (6 + 6, padrão) ou
  24 h (12 + 12).
- **Linha do tempo** (uma faixa por máquina):
  - blocos **Concluído** (azul), **Rodando** (verde) e **Previsto** (cinza-claro);
  - bloco com borda tracejada quando o fim não é conhecido. Rodando sem previsão vai até agora;
    previsto sem término vai até o fim da janela;
  - linha vermelha marcando **agora**; marcas de hora e o dia ("hoje", "amanhã", "ontem") quando
    vira o dia;
  - ao passar o mouse: automação, itens e horário de início → fim;
  - bloco de automação que a pessoa não vê aparece como "Ocupada", sem nome nem itens e sem link.
  - Janela longa rola na horizontal; ao abrir, o "agora" fica a um terço da área visível.
- Rodapé: "Atualiza sozinha" quando recebe avisos ao vivo; senão "Relendo a cada minuto".
- Para quem gerencia, abaixo:
  - painel **Gerenciar** (botão no topo): cadastrar máquina, gerar código de conexão e lista de
    máquinas cadastradas (com a situação quando não está "ativa");
  - **Automações diretas**: cada instância direta com automação, máquina (ou o nome informado),
    situação (Aguardando aprovação, Aprovada, Em quarentena, Revogada) e o último sinal. A seção
    some quando não há nenhuma.

A tela relê a cada 60 s e quando chega aviso de mudança (com 1,5 s de espera para juntar avisos).

## O que dá para fazer

- **Abrir uma execução**: clicar num bloco concluído ou rodando leva a Acompanhar.
- **Cadastrar máquina**: informa o nome (2 a 120 caracteres, sem repetir). Serve também para
  máquina sem Agent, onde depois se aprovam automações diretas.
- **Gerar código** para conectar uma automação direta: escolhe a automação e o Portal mostra um
  código de uso único, válido por 30 minutos. Ele aparece só uma vez (botão Copiar). É usado na
  máquina, no comando de inscrição do SDK.
- **Aprovar** uma instância pendente ou em quarentena: é preciso escolher em qual máquina ela roda.
- **Quarentena** (instância aprovada): deixa de receber jobs até ser aprovada de novo.
- **Revogar**: definitivo. Para voltar, a automação precisa se inscrever de novo.
- **Apagar máquina**: abre uma confirmação que mostra antes o que depende dela:
  - com execução rodando nela, não deixa apagar (espere terminar ou pare a execução);
  - com automações, Agents ou pedidos da fila ligados, pede "Apagar mesmo assim". As automações
    ficam sem máquina e voltam a esperar aprovação; o Agent fica sem máquina e não recebe trabalho
    até ser ligado a outra; os pedidos da fila presos a ela passam a poder rodar em qualquer
    máquina que sirva;
  - a máquina sai das telas e do despacho; o histórico das execuções continua com o nome dela.

Cadastrar, gerar código, decidir instâncias e apagar máquinas ficam registrados na auditoria.

## Quem pode

- `maquinas.ver` (ou `painel.ver`): vê a linha do tempo. Nome, itens e link de cada bloco só das
  automações em que a pessoa pode ver execuções.
- `maquinas.gerenciar`: botão Gerenciar (cadastrar e apagar máquinas, gerar código) e a seção
  Automações diretas (aprovar, quarentena, revogar).
- Admin pode tudo.

## Por dentro

- Tela: `frontend/src/app/(dashboard)/maquinas/page.tsx`,
  `frontend/src/components/maquinas/maquinas-view.tsx`
- API:
  - `GET /painel/linha-do-tempo?horas_antes=&horas_depois=` — blocos por máquina (1 a 48 h).
  - `GET /painel/avisos` — SSE de mudança.
  - `GET /maquinas`, `POST /maquinas` — listar e cadastrar.
  - `GET /maquinas/{id}/vinculos` — o que depende da máquina.
  - `DELETE /maquinas/{id}?confirmar=true` — apagar (409 com a lista sem `confirmar`; 409 com
    execução rodando).
  - `GET /automations` — automações para o código de conexão.
  - `POST /automations/{id}/instancias-diretas/codigos` — gera o código.
  - `GET /instancias-diretas`, `POST /instancias-diretas/{id}/{aprovar|quarentena|revogar}`.
- Regras no backend: `backend/modules/telemetry/api/painel.py` (linha do tempo),
  `backend/modules/dispatch/domain/linha_do_tempo.py`,
  `backend/modules/fleet/api/instancias_diretas.py`,
  `backend/modules/fleet/application/remover_maquina.py`,
  `backend/modules/fleet/domain/instancia_direta.py` (situações e transições).
