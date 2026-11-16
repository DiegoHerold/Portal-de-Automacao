# Limites

Os tetos que protegem o Portal e as máquinas: tamanho de pacote, execuções ao mesmo tempo, tempo máximo, blocos por fluxo etc. Cada limite diz onde vale, e mudar vale na hora.

## O que aparece

- Campo **Buscar limite** e a contagem "N limites · M fora do padrão".
- Os limites agrupados (Pacotes e arquivos, Execuções, Agendamentos, Máquinas, Tempo real, Fluxos). Cada linha mostra:
  - nome, para que serve e "Vale em: ...";
  - o valor atual, em forma legível (ex.: "4 horas", "64 KB", "200 MB");
  - "Padrão", ou a etiqueta "Padrão: X" quando o valor foi mudado, ou "Arquivo .env" quando o limite vem do arquivo de configuração;
  - o botão **Mudar** (para quem gerencia, e só nos limites que mudam pela tela).

## O que dá para fazer

- **Mudar**: abre uma janela com o valor, a unidade, a faixa aceita e onde vale.
  - Aceita só número inteiro dentro da faixa; fora dela, a tela avisa e o backend recusa (422).
  - **Salvar** só habilita quando o valor muda.
  - **Voltar ao padrão (X)** aparece quando o valor está diferente do padrão.
  - Vale na hora: cada uso do limite lê o valor gravado. O limite de telas ao vivo (`realtime.max_sse_connections`) é guardado por até 30 segundos em cada processo.
- Limites de origem "arquivo" só aparecem para consulta: mudam no `.env` do backend e valem depois de reiniciar o Portal.
- Toda mudança vai para a auditoria (`limite.definido`, com o valor de antes).
- Sem valor gravado, vale o padrão do catálogo. Um valor gravado fora da faixa é trazido para dentro dela ao ser lido.

## Catálogo de limites

| Chave | Nome | Padrão | Faixa | Efeito |
|---|---|---|---|---|
| `package.max_size_mb` | Tamanho máximo do pacote | 200 MB | 1 a 2048 MB | Maior pacote de automação aceito no envio pelo Catálogo. |
| `artifact.max_size_mb` | Tamanho máximo de cada arquivo | 200 MB | 1 a 2048 MB | Maior arquivo que uma execução pode entregar (planilha, TXT, imagem), no envio de arquivos e no Storage. |
| `execution.max_concurrent` | Execuções ao mesmo tempo | 20 | 1 a 500 | Quantos jobs rodam juntos em todas as máquinas. Acima disso, os jobs esperam na fila. |
| `execution.max_timeout_seconds` | Tempo máximo de uma execução | 14400 s (4 horas) | 60 s a 7 dias | Teto do tempo limite declarado pela automação. Quem pede mais recebe este valor, ao montar o job. |
| `execution.max_retries` | Repetições automáticas | 3 | 0 a 20 | Teto de novas tentativas quando uma execução falha. Quem pede mais recebe este valor, ao montar o job. |
| `schedule.min_interval_seconds` | Intervalo mínimo entre repetições | 60 s | 60 s a 1 dia | Menor intervalo aceito num agendamento do tipo intervalo, ao criar e editar. |
| `agent.max_registered` | Agents cadastrados | 100 | 1 a 10000 | Quantos Agents podem ser cadastrados. Um Agent que já existe sempre pode se registrar de novo. |
| `gateway.max_message_bytes` | Tamanho máximo de mensagem do Agent | 65536 bytes (64 KB) | 1 KB a 10 MB | Maior mensagem que um Agent manda pelo canal de comunicação. **Vem do arquivo** (`AGENT_GATEWAY_MAX_MESSAGE_BYTES`); não muda pela tela. |
| `realtime.max_sse_connections` | Telas acompanhando ao mesmo tempo | 250 | 10 a 5000 | Conexões ao vivo (Painel, Fila, Acompanhar) abertas juntas. Acima disso, a tela tenta de novo em alguns segundos. |
| `fluxo.max_blocos` | Blocos por fluxo | 500 | 10 a 5000 | Quantos blocos um fluxo pode ter, ao salvar e publicar. |
| `fluxo.max_passos` | Passos por execução | 10000 | 100 a 1000000 | Quantos blocos uma execução de fluxo roda no total. Protege contra laço sem fim. |
| `fluxo.max_voltas` | Voltas por laço | 1000 | 10 a 100000 | Quantas voltas um laço (repetir, enquanto, para cada) pode dar. |
| `fluxo.max_duracao_segundos` | Tempo máximo de um fluxo | 604800 s (7 dias) | 60 s a 30 dias | Quanto uma execução de fluxo pode durar, contando as esperas. |
| `fluxo.max_partes` | Partes por divisão | 50 | 2 a 500 | Em quantas partes "Dividir automação entre máquinas" reparte o trabalho, ao pôr na fila. |

## Quem pode

- **Ver** (`limites.ver`): o item no menu e a lista.
- **Gerenciar** (`limites.gerenciar`): o botão Mudar e o Voltar ao padrão.
- Admin vê e gerencia tudo.

## Por dentro

- Tela: `frontend/src/app/(dashboard)/governance/limits/page.tsx`, `frontend/src/components/governance/limites-do-sistema.tsx`, `frontend/src/lib/configuracoes.ts`
- API:
  - `GET /governance/limites` — grupos e itens (catálogo + valor em vigor + se foi mudado).
  - `PUT /governance/limites/{chave}` (`{"valor": 30}`) — grava o valor.
- Regras no backend:
  - `backend/modules/governance/domain/configuracoes.py` (`LIMITES`: catálogo, padrões, faixas, `validar_limite`)
  - `backend/modules/governance/application/configuracoes.py` (`ListarLimites`, `DefinirLimite`, auditoria)
  - `backend/modules/governance/api/configuracoes.py` (rotas)
  - `backend/modules/governance/infrastructure/limites.py` (`ler_limite`, `ler_limite_em_bytes`, `limite_em_cache`: o que os outros contextos usam)
  - `backend/modules/governance/infrastructure/repositories/sqlalchemy_configuracoes.py` (tabela `system_limits`, escopo global)

## Como criar um limite novo

Precisa de código; a tela se monta sozinha a partir do catálogo.

1. **Catálogo**: acrescente um `Limite` em `LIMITES` (`backend/modules/governance/domain/configuracoes.py`), no grupo certo, com chave única, nome, descrição, unidade (`mb`, `segundos`, `quantidade` ou `bytes`), padrão, mínimo, máximo e "onde vale". O padrão precisa estar dentro da faixa. Para um limite que vem do `.env`, use `origem="arquivo"` e informe `variavel_de_ambiente` (e crie o campo em `backend/infrastructure/config.py`).
2. **Uso**: no ponto onde o limite vale, leia com `ler_limite(db, "sua.chave")` (ou `ler_limite_em_bytes` para MB; `limite_em_cache` quando não houver sessão de banco). Não guarde o valor em variável de módulo: assim a mudança vale na hora.
3. **Teste**: `backend/modules/governance/tests/test_configuracoes.py::test_catalogo_consistente` confere chave única e padrão dentro da faixa. Acrescente um teste do efeito (ex.: em `backend/tests/db/test_limites_e_limpeza.py`) que mude o valor e confira que o ponto de uso respeita.
4. **Documentação**: acrescente a linha na tabela acima.

Sem linha gravada no banco, vale o padrão: o limite já funciona na instalação, e mudar o padrão no código chega a quem nunca o alterou. Uma unidade nova também precisa ser tratada em `frontend/src/lib/configuracoes.ts`.
