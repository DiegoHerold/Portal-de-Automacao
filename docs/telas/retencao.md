# Retenção

Por quanto tempo o Portal guarda cada coisa. A tela tem duas partes: a **limpeza automática do sistema** (registros que o Portal só precisa por um tempo) e os prazos de **imagens, logs e arquivos por automação**.

## O que aparece

### Limpeza automática do sistema

- Campo **Buscar regra**.
- As regras agrupadas (Avisos, Máquinas, Acesso e segurança, Comunicação interna, Execuções, Guardado sempre). Cada linha mostra:
  - nome, para que serve e "Sai: ..." (o que é apagado);
  - o prazo em vigor ("7 dias", "Sem prazo"), com "Padrão" ou a etiqueta "Padrão: X" quando foi mudado;
  - "Última limpeza há ..." e o total apagado até hoje, ou "Ainda não rodou";
  - o botão **Mudar** (para quem gerencia);
  - nas regras fixas, a etiqueta **Guardado sempre**, sem botão.

### Imagens, logs e arquivos por automação

- Uma linha por automação do catálogo, com o prazo de **Imagens**, **Logs** e **Arquivos** ("Sem prazo" quando não definido) e o botão **Definir prazos**.
- A contagem "N de M com prazo". Com mais de 8 automações, aparece **Buscar automação**.

## O que dá para fazer

### Mudar o prazo de uma regra do sistema

- **Guardar por N dias**, dentro da faixa da regra; ou **Sem prazo: não apagar nada** (desliga a regra).
- **Voltar ao padrão** aparece quando a regra foi mudada.
- Se o novo prazo for menor que o atual, o botão vira **Salvar e apagar o que passar do prazo** e a janela avisa: na próxima limpeza (em até 30 minutos), o que for mais antigo que o novo prazo é apagado de vez.
- Toda mudança vai para a auditoria (`limpeza.prazo_definido`).

### Definir prazos de uma automação

- Três campos em dias: **Imagens das telas**, **Linhas de log** e **Arquivos entregues**. Em branco: sem prazo, nada é apagado. Faixa: 1 a 3650 dias.
- Se algum prazo encurtar, o botão vira **Salvar e apagar o que passar do prazo** e a janela avisa: na próxima limpeza (em até 1 hora), o que passar do prazo é apagado de vez. Não tem volta.
- Toda mudança vai para a auditoria (`retencao.definida`, com o antes).

### Como a limpeza roda

- **Sistema**: a cada 30 minutos. Cada regra com prazo apaga até 5000 registros por passada; o resto sai nas próximas. Uma regra com erro não segura as outras. Cada passada que apagou algo vai para a auditoria (`limpeza.aplicada`).
- **Por automação**: a cada hora. Sem prazo definido, não apaga nada. Etapas, progresso e o histórico de tempos ficam: as estimativas não mudam.
- Sem nada gravado, vale o padrão do catálogo: a limpeza do sistema já funciona na instalação. Por automação, **não há prazo padrão**: nada é apagado até alguém definir.

## Regras de limpeza do sistema

| Chave | Grupo | Nome | Padrão | Faixa | O que sai |
|---|---|---|---|---|---|
| `notificacoes` | Avisos | Notificações | 7 dias | 2 a 365 | Notificações do sino e as entregas delas, lidas ou não. |
| `maquinas.recursos` | Máquinas | Medições de CPU, memória e disco | 7 dias | 1 a 365 | Medições antigas. A última de cada Agent fica. |
| `maquinas.sessoes` | Máquinas | Estado da sessão do Windows | 7 dias | 1 a 365 | Registros antigos. O último de cada Agent fica. |
| `maquinas.comandos` | Máquinas | Comandos enviados às máquinas | 30 dias | 7 a 3650 | Comandos concluídos (confirmados, falhos ou entregues). Pendentes ficam. |
| `maquinas.diagnosticos` | Máquinas | Diagnósticos das máquinas | 30 dias | 7 a 3650 | Diagnósticos concluídos. |
| `acesso.sessoes_diretas` | Acesso e segurança | Sessões vencidas do modo direto | 7 dias | 1 a 365 | Sessões e desafios de login das automações em modo direto, vencidos ou revogados. |
| `acesso.tokens_de_job` | Acesso e segurança | Tokens de job vencidos | 7 dias | 1 a 365 | Tokens de job vencidos ou revogados. |
| `acesso.codigos_vencidos` | Acesso e segurança | Códigos de cadastro não usados | 30 dias | 1 a 3650 | Códigos de cadastro de Agents e automações diretas que venceram sem uso. Os usados ficam. |
| `interno.mensagens` | Comunicação interna | Mensagens internas processadas | 30 dias | 7 a 3650 | Mensagens já processadas ou publicadas. Pendentes e com erro ficam. |
| `interno.idempotencia` | Comunicação interna | Proteção contra pedido repetido | 7 dias | 1 a 365 | Registros vencidos. |
| `execucoes.decisoes` | Execuções | Decisões de despacho | 90 dias | 30 a 3650 | Por que cada job foi para uma máquina. |
| `execucoes.reconciliacoes` | Execuções | Reconciliações | 90 dias | 30 a 3650 | Reconciliações concluídas. |
| `execucoes.webhooks` | Execuções | Chamadas de webhook | 90 dias | 7 a 3650 | Histórico de chamadas recebidas pelos webhooks. |
| `fluxos.passos` | Execuções | Linha do tempo dos fluxos | 90 dias | 7 a 3650 | Passos de execuções de fluxo já terminadas. A execução e o resultado ficam. |
| `sempre.auditoria` | Guardado sempre | Auditoria | — | — | Nada. |
| `sempre.execucoes` | Guardado sempre | Execuções, etapas e itens | — | — | Nada. Imagens, logs e arquivos têm o prazo por automação. |
| `sempre.tempos` | Guardado sempre | Histórico de tempos | — | — | Nada. Apagar mudaria as estimativas. |

O prazo das notificações não vai abaixo de 2 dias porque o detector de avisos olha as últimas 24 horas: menos que isso repetiria avisos.

## Quem pode

- **Ver** (`retencao.ver`): o item no menu e as duas listas.
- **Gerenciar** (`retencao.gerenciar`): mudar prazos do sistema e definir prazos por automação.
- O botão **Definir prazos** aparece para todos que abrem a tela; sem Gerenciar, o backend recusa (403) ao salvar.
- Admin vê e gerencia tudo.

## Por dentro

- Tela: `frontend/src/app/(dashboard)/governance/retention/page.tsx`, `frontend/src/components/governance/limpeza-do-sistema.tsx`, `frontend/src/components/governance/retencao-por-automacao.tsx`, `frontend/src/lib/configuracoes.ts`
- API:
  - `GET /governance/limpeza` — regras com prazo em vigor e última passada.
  - `PUT /governance/limpeza/{chave}` (`{"dias": 14}`, `{"dias": null}` ou `{"voltar_ao_padrao": true}`).
  - `GET /governance/retencao-por-automacao` — prazos de cada automação e a faixa aceita.
  - `PUT /governance/retencao-por-automacao/{automation_id}` (`imagens_dias`, `logs_dias`, `arquivos_dias`).
- Regras no backend:
  - `backend/modules/governance/domain/configuracoes.py` (`LIMPEZAS`: catálogo, padrões, faixas, `validar_prazo`)
  - `backend/modules/governance/application/configuracoes.py` (`DefinirPrazoDeLimpeza`, `AplicarLimpezaDoSistema`, lote de 5000)
  - `backend/modules/governance/infrastructure/adapters/limpeza.py` (`LIMPADORES`: quem apaga cada regra)
  - `backend/modules/governance/api/configuracoes.py` e `backend/modules/governance/api/retencao.py` (rotas)
  - `backend/modules/governance/domain/retencao_por_automacao.py` e `backend/modules/governance/application/retencao.py` (prazos por automação)
  - `backend/workers/celery_app.py` (agenda: limpeza do sistema a cada 30 min, retenção por automação a cada hora) e `backend/workers/tasks/housekeeping_tasks.py`

## Como criar uma regra de limpeza nova

Precisa de código; a tela se monta sozinha a partir do catálogo.

1. **Catálogo**: acrescente uma `Limpeza` em `LIMPEZAS` (`backend/modules/governance/domain/configuracoes.py`), no grupo certo, com chave única, nome, descrição, "o que sai", padrão em dias (ou `None` para começar desligada), mínimo e máximo. O padrão precisa estar dentro da faixa.
2. **Quem apaga**: escreva a função no contexto dono da tabela, em `backend/modules/<contexto>/infrastructure/limpeza.py`, com a forma `(db, corte, lote) -> quantos saíram`. Use `apagar_em_lote` (`backend/modules/shared/infrastructure/limpeza.py`) para apagar no máximo `lote` linhas por chamada. Apague só o que passou do `corte` e preserve o que ainda é preciso (pendentes, o último de cada Agent etc.).
3. **Registro**: ponha a chave e a função em `LIMPADORES` (`backend/modules/governance/infrastructure/adapters/limpeza.py`).
4. **Teste**: `backend/modules/governance/tests/test_configuracoes.py::test_catalogo_consistente` falha se uma regra editável não tiver quem apague (ou se uma regra fixa tiver). Acrescente um teste com banco (ex.: em `backend/tests/db/test_limites_e_limpeza.py`) que crie registros antigos e novos, rode `build_aplicar_limpeza(sessao).execute()` e confira que só os antigos saíram.
5. **Documentação**: acrescente a linha na tabela acima.

Uma regra só para consulta (nunca apagada) usa `editavel=False`, `padrao_dias=None` e não entra em `LIMPADORES`.
