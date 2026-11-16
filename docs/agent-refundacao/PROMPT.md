# Refundação do Automation Agent em .NET

Status: rascunho em revisão com o usuário (16/11/2026). Nenhuma fase começou.

Este documento é a especificação. Releia a parte relevante no começo de cada fase. Quando
uma decisão for tomada, registre-a aqui (seção "Decisões tomadas") com a data; se for decisão
de arquitetura, acrescente também uma linha nova em `docs/decisoes.md`.

Neste documento, **"evolução N"** quer dizer a fase N da evolução multi-máquina do Portal
(novembro de 2026), para não confundir com as fases deste plano.

A documentação antiga do Portal (relatórios de fase, matriz de certificação,
`automation-package.md` e outros) foi apagada em 16/11/2026 e continua no Git, no commit
`f1bbaea` (`git show f1bbaea:docs/<arquivo>`). Use-a só como evidência histórica. O que vale
hoje está em `docs/visao-geral.md`, `docs/decisoes.md`, `docs/telas/` e `contracts/`.

---

# 1. Missão

Refazer o Automation Agent em .NET: o programa que roda nas máquinas Windows da Biason,
recebe do Portal os jobs da fila, executa as automações e devolve ao Portal tudo o que
acontece (etapas, itens, progresso, logs, passos com imagem, arquivos e resultado).

Prioridades, nesta ordem: **segurança, confiabilidade, paridade com o modo direto e leveza.**

Trate o Agent como software de alto risco. Ele executa código em máquinas com dados de folha
de pagamento e credenciais, inclusive da Domínio. Se ele for comprometido, a máquina também é.
Na dúvida, recuse a ação, registre o motivo e pergunte.

O Agent novo substitui o atual (`automation-agent/`), mas **não começa do zero no
conhecimento**: o protocolo com o Portal, o contrato de eventos da automação e o SDK Python
já estão provados e continuam valendo. O que muda é o rigor: regras escritas antes do
código, assinatura de tudo o que executa, menor privilégio possível e cenários de ataque
executáveis como prova.

O método vem do projeto Agente Biason em Rust
(`C:\Users\diego\Desktop\Projetos\Biason\Agente Biason`), cuja Fase 0 é leitura
obrigatória: `docs/especificacao.md` e `docs/fase-0/01` a `09`. Tudo o que lá for
específico de Rust deve ser traduzido para .NET. O que lá supõe "o portal ainda não
existe" deve ser substituído pelo Portal real descrito aqui.

Escreva documentação, mensagens, logs e relatórios em português do Brasil, em linguagem
simples. Na interface do Portal, use "Máquina" e "Agent", nunca "Worker".

---

# 2. Forma de trabalho

- Trabalhe por fases. **Ao fim de cada fase, PARE e espere aprovação explícita.** Não comece
  a fase seguinte, nem "adiante um pouco", sem essa aprovação.
- Comece pela Fase 0. Não escreva código do Agent novo antes de aprovadas as regras.
- Nunca afirme que algo funciona sem mostrar a saída real do comando que provou isso.
- Nunca declare o Agent "seguro" ou "pronto para produção". Diga o que foi testado e o que
  continua sem verificação.
- Se um requisito for ambíguo ou estiver em conflito com o código, um ADR ou outro trecho
  deste documento, **pergunte**. Não invente.
- Não enfraqueça uma regra de segurança para fazer algo funcionar. Pare e avise.
- Não altere, remova, ignore nem relaxe um teste ou cenário de ataque sem aprovação explícita.
  Toda mudança desse tipo aparece no relatório da fase.
- O usuário não vai revisar C# linha por linha. **A prova são os cenários de ataque e os
  testes**, que precisam ser executáveis e ter saída legível.
- Fatos sobre Windows, .NET, Python, bibliotecas ou ferramentas citados aqui devem ser
  comprovados na versão fixada. Se a prática contradisser este documento, pare e avise.
- Siga o `AGENTS.md` do repositório. Ele prevalece sobre este documento em caso de conflito,
  e o conflito deve ser apontado.

## Regras do ambiente (valem em todas as fases)

- O Portal roda nativo, sem Docker, por `scripts/portal.ps1`. PostgreSQL dedicado na porta
  5433, sempre por `127.0.0.1`. Redis só em loopback.
- **Nunca reinicie o Portal real por conta própria.** Reiniciar aplica migrations. Peça
  autorização, diga quais migrations entram e confira a revisão depois.
- O Portal real tem **dados reais** (folha de pagamento, LGPD). Testes nunca escrevem nele,
  salvo na certificação autorizada da Fase 7, com automação de certificação própria.
- Testes nunca usam pastas reais de automações ou de dados. Sempre pastas temporárias
  criadas pelo próprio teste.
- A Integração Contábil (`C:\Users\diego\Desktop\Projetos\Integração contabil`) roda em
  produção pelo modo direto. **Não toque nela**, nem no repositório dela.
- Nada de acesso à Domínio, a máquinas de produção ou ao GitHub de produção sem autorização
  explícita para aquele teste.
- Commit ou push só quando o usuário pedir.

---

# 3. Ponto de partida (levantado em 13/11/2026)

## O que o Agent atual faz e foi provado

- Registro, credencial, WebSocket com o Portal, heartbeat e ACK (prova real em 14/08/2026).
- Oferta, aceite, recusa, commit e cancelamento; segundo plano com sucesso, falha, tempo
  limite e cancelamento; logs, progresso, métricas e artefatos com SHA-256 (prova real em
  14/08/2026, `docs/certification/`).
- Canal local com a automação por pipe nomeado, com token por tentativa (evolução 1).
- Imagens dos passos enviadas ao vivo (evolução 4).
- Build sem erros; 206 testes unitários e 112 de integração aprovados em 13/11/2026.

## Problemas encontrados que motivam a refundação

| Problema | Evidência |
|---|---|
| Não confere assinatura de pacote. A opção existe e nenhum código a usa. Um Portal invadido roda código em todas as máquinas | `automation-agent/src/Agent.Domain/Configuration/SecurityOptions.cs:11` |
| Roda como LocalSystem (o serviço é criado sem conta) | `automation-agent/scripts/install-service.ps1` |
| Não existe nenhum cenário de ataque executável | `f1bbaea:docs/certification/final-agent-feature-matrix.md`, linha "Security regression suite" |
| A documentação promete ambiente Python isolado a partir do `requirements.txt`, mas nenhum código faz isso | `f1bbaea:docs/automation-package.md:57`; nenhuma ocorrência de venv, pip ou wheel em `automation-agent/src` |
| No modo agente faltam: parar depois do item, segredos e e-mail | `backend/modules/orchestration/application/use_cases/queue.py:229`, `sdk/python/portal_automacoes/transporte_agente.py:64,71` |
| Nunca testados com o Agent real: arquivos (evolução 8), `dados_dos_itens` no `input.json`, tela, navegador, queda e volta durante execução, Portal ou Agent reiniciando | `f1bbaea:docs/fase-5-relatorio.md`, `f1bbaea:docs/fase-8-relatorio.md`, matriz final de certificação |
| Sem instalador nem atualização automática | `f1bbaea:docs/agent-distribution.md`, `automation-agent/docs/windows-service.md` |
| .NET 8, cujo suporte terminou em 10/11/2026 (confirmar na Fase 0). O SDK 10.0.303 está instalado | `dotnet --list-sdks` |
| Credencial do Agent é um segredo compartilhado (bearer). O modo direto já usa par de chaves com desafio assinado | `backend/modules/fleet/api/routes.py`, `backend/gateway/direct_gateway/instancias.py` |

## O que se reaproveita

- **Contratos**: `contracts/protocol/v1`, `contracts/messages`, `contracts/events`,
  `contracts/automation-events/v1`, `contracts/manifests`, `contracts/errors`. Eles são a
  fonte; o Agent não duplica schemas à mão (gere ou valide contra eles).
- **O SDK Python** (`sdk/python`), em especial `transporte_agente.py`. Ele deve continuar
  funcionando, ou mudar junto, com versão nova e teste.
- **O Agent atual como referência de comportamento**: protocolo, fila local (inbox e outbox),
  canal com a automação, envio de imagens. Código copiado passa pelas mesmas regras e testes
  do código novo. Nada é copiado "porque já funcionava".
- O Agent atual fica **congelado** em `automation-agent/`: só recebe correção que o usuário
  pedir. Ele não é apagado antes da Fase 9, e só com autorização.

---

# 4. O que o Agent novo precisa fazer

## No Portal (Control Plane)

As regras do `AGENTS.md` valem integralmente. Em resumo:

- O Portal decide o que executar e escolhe Agents candidatos. **O Agent faz a validação final
  de admissão e pode recusar** mesmo depois de escolhido.
- O Portal é a fonte oficial do estado global. O Agent é a fonte das observações da máquina e
  dos processos.
- Modelo separado: `Execution`, `TaskExecution`, `ExecutionAttempt`, `ExecutionOffer`.
  Oferta recusada não é falha da automação. **O Agent não inicia execução antes de
  `execution.commit`.**
- Toda mensagem Portal–Agent tem `protocol_version`, `message_id`, `message_type`, `sent_at`,
  `agent_id`, `agent_instance_id` e `payload`.
- Máquina é entidade própria (ADR-019). O Agent pertence a uma máquina. Automação de tela
  ocupa a máquina sozinha, somando os dois modos (`machine:{id}:screen`).
- Os dois modos de conexão (ADR-018) usam o mesmo contrato de eventos. **Trocar de modo é
  configuração, não código.**

## Funções obrigatórias

1. Inscrição da máquina, identidade própria e sessão com o Portal só por conexão de saída.
2. Relato da máquina: perfil, capacidade, capabilities, sessão (logada, bloqueada,
   desconectada), versão, ocupação.
3. Admissão: aceitar ou recusar ofertas com motivo do catálogo `contracts/errors`.
4. Preparação: obter pacote e runtime assinados, verificar e deixar prontos.
5. Execução por job: segundo plano, navegador e tela, com Job Object, tempo limite, lease e
   cancelamento.
6. Canal com a automação: eventos `automation-events/1`, comandos (`parar_apos_item`,
   `cancelar`), imagens, arquivos, segredos, e-mail, entrada (`input.json` com
   `dados_dos_itens` e `retomada`).
7. Entrega ao Portal: lotes de eventos idempotentes, artefatos por HTTPS com o upload guiado
   pelo ACK, resultado final.
8. Resiliência: fila local durável, reenvio sem duplicar, reconciliação (`agent.sync_state`),
   adoção ou encerramento seguro de processos depois de uma queda.
9. Emergência: congelar, descongelar, desativar a máquina, revogar chave, todos por ordem
   assinada.
10. Instalação, desinstalação e atualização automática do próprio Agent.

## Fora do escopo (salvo instrução explícita)

- Gerenciar instâncias diretas de longa duração, como a Integração Contábil. Ela continua no
  modo direto, sem Agent.
- Isolamento entre automações. Nunca diga que ele existe (ver seção 5).
- Qualquer porta de entrada, inclusive em localhost.

---

# 5. Modelo de confiança

## O que o Agent não confia

- **Portal**: não decide o que é código válido. Ele escolhe, entre pacotes assinados para
  aquela máquina, qual rodar e quando. Toda resposta dele é entrada hostil, com parser estrito
  e limites.
- **Rede**: toda resposta é hostil.
- **Configuração local, variáveis de ambiente e relógio**: nenhum deles troca chave, desliga
  verificação ou afrouxa limite compilado.
- **Mensagens da automação no pipe**: a automação é código assinado e confiável, mas o que ela
  envia é tratado como entrada hostil (tamanho, tipos, caminhos, quantidade). Um erro dela
  não pode derrubar o Agent nem escrever em outra tentativa.

## Um Portal invadido NÃO pode

- instalar ou executar código fora do que foi assinado para aquela máquina;
- desligar verificação, trocar chave ou afrouxar limite;
- apagar dados locais, forçar o encerramento sem ordem assinada, ou atualizar o Agent sem as
  assinaturas exigidas;
- ler ou forjar segredos (se a decisão D-07 for pelo envelope cifrado; se não, registre isso
  como risco aceito).

## Riscos aceitos (descrever o impacto no negócio na Fase 0)

Um Portal invadido PODE: iniciar e cancelar jobs de pacotes assinados; escolher a versão
entre as assinadas; reter trabalho e atualizações; enviar entradas maliciosas aos jobs (cada
automação valida o que recebe, e o contrato da automação diz isso); ler logs e imagens que a
automação enviou; negar serviço.

## Limite de isolamento

Agent e automações rodam no mesmo usuário Windows (salvo decisão D-01 diferente). Logo, ACL e
DPAPI **não** os isolam: uma automação pode ler segredos de outra, ler memória de outros
processos e falsificar o estado local do Agent. Conferências locais de hash e a cadeia de
auditoria **detectam** erro acidental e adulteração simples; **não impedem** código malicioso
que já roda como esse usuário. Escreva isso assim na documentação.

Administrador local e SYSTEM estão fora do escopo: anulam todas as proteções. Na Fase 0,
proponha alternativas de isolamento com custo (usuário por automação, processo intermediário
em outra conta, AppContainer para o que não usa tela, máquina ou VM por automação).

---

# 6. Arquitetura

## Plataforma

- Somente Windows 10/11 x64. **.NET 10 LTS** (confirmar na Fase 0 a versão e o fim do suporte),
  com o SDK fixado em `global.json`.
- Publicação: NativeAOT ou self-contained single-file (decisão D-10). O Agent não depende de
  runtime .NET instalado na máquina.
- O Agent **não escuta porta nenhuma**. Toda conexão é de saída: WebSocket (WSS) para controle
  e HTTPS para binários (ADR-005, ADR-006).

## Modelo de execução no Windows (decisão D-01, obrigatória na Fase 0)

Compare, com evidência medida na máquina de testes:

| Opção | Como | Ganho | Custo |
|---|---|---|---|
| A | Tarefa no logon de um usuário dedicado **sem administrador**; tudo roda nessa sessão | Menor privilégio; tela disponível | Depende de logon (automático, em máquina dedicada); nada roda antes do logon |
| B | Serviço como SYSTEM e executor na sessão do usuário (modelo atual) | Sobe sem logon; controla sessões | SYSTEM comprometido = máquina inteira |
| C | Serviço em conta sem privilégio (conta virtual) para conexão e segundo plano, mais executor de sessão iniciado por tarefa no logon | Sobe sem logon para segundo plano; tela sem SYSTEM | Dois processos e duas contas; segundo plano roda em outra conta (acesso à rede e à Domínio a provar) |

Recomendação inicial: **A**, em máquina ou VM dedicada com logon automático e senha como
segredo LSA, como no `01-sessao-interativa.md` do Agente Biason. A Fase 0 confirma ou derruba
com medições. Em qualquer opção:

- recuse iniciar como SYSTEM, elevado, membro de Administradores (mesmo com token filtrado)
  ou com privilégios perigosos (depuração, backup, restauração, tomada de posse), exceto o
  componente que a opção B ou C exigir, com justificativa escrita;
- nunca tente elevar privilégio;
- uma só instância por usuário e por raiz, com bloqueio que outro usuário sem privilégio não
  consiga tomar antes.

## Componentes (proposta para a Fase 0 refinar)

```text
agent.exe (controle)                       sem portas abertas
  |-- conexão       --> Portal (WSS/HTTPS)
  |-- admissão      --> decide aceitar/recusar com dados locais
  |-- preparação    --> pacotes e runtimes assinados, um ciclo por vez
  |-- supervisão    --> lê o estado dos vigias, aplica tempo limite e lease
  |-- auditoria     --> cadeia JSONL local, enviada ao Portal
  |
  | inicia; passa configuração e segredos por pipe anônimo, nunca por linha de comando
  v
vigia (mesmo .exe, subcomando; um por tentativa; sobrevive à queda do controle)
  |-- canal com a automação: pipe nomeado com ACL do usuário + token da tentativa
  |-- captura stdout/stderr, remove segredos, rotaciona, grava estado de forma atômica
  v
Job Object nomeado
  '-- automação e filhos
```

- Projetos sugeridos: `Agent.Nucleo` (lógica pura: formatos assinados, manifesto, ordens,
  nomes, limites, política; sem disco, rede ou relógio do sistema), `Agent.Plataforma.Windows`
  (único com P/Invoke e `unsafe`, se precisar), `Agent.Protocolo`, `Agent.Conexao`,
  `Agent.Preparacao`, `Agent.Execucao`, `Agent.Vigia`, `Agent.Estado`, `Agent` (executável),
  `Agent.Empacotador` (ferramenta de build, fora do executável), `Agent.SegredosAdmin` (se D-07
  for pelo envelope; fora do executável), `tools/Ataques`, `tools/PortalFalso`.
- Local do código novo: decisão D-11 (recomendação: `agent/` na raiz do repositório).

## Pastas

Raiz configurável (padrão `C:\Automacoes`), com `agent\` (exe, config, estado, auditoria,
logs), `temp\` (no mesmo volume, nunca `%TEMP%`), `store\runtimes\`, `store\pacotes\`,
`execucoes\<tentativa>\` (input, artefatos, passos, logs).

- Em `C:\`, usuários autenticados podem criar pastas. Confira dono e ACL da raiz e das pastas
  sensíveis a cada início e antes de cada preparação. Dono errado ou acesso de outra conta não
  administrativa: recuse e registre. Nunca adote pasta preexistente.
- Sem herança de permissões. Sem junctions nem symlinks.
- Toda gravação de estado é atômica e resistente a queda de energia (temporário no mesmo
  volume, descarga em disco, troca atômica; ou SQLite em WAL com `synchronous=FULL`).
- Descreva na Fase 0 o que acontece se a máquina for restaurada de backup ou snapshot
  (sequências e ids usados regridem).

---

# 7. Pacotes, runtimes e assinatura

## O que é executado

- Tudo chega em **pacotes assinados**, gerados pelo build e assinados fora do Portal: pacote
  de automação, de runtime (Python e ferramentas) e do próprio Agent. O tipo faz parte do que
  é assinado.
- O Agent **não** clona do GitHub, **não** baixa dependências da internet e as máquinas não
  guardam token do GitHub.
- O Portal guarda e entrega pacotes e manifestos assinados. **O Portal nunca assina.** A
  Fase 3 altera o fluxo de publicação do Catálogo para aceitar só pacotes assinados (ver
  seção 14). Levante na Fase 0 como o Portal gera pacotes hoje: código em
  `backend/modules/catalog/`, telas em `docs/telas/automacoes.md` e `docs/telas/runtimes.md`, e
  os documentos antigos `f1bbaea:docs/automation-package.md`,
  `f1bbaea:docs/github-automation-discovery.md` e `f1bbaea:docs/manual-automation-import.md`.

## Formatos assinados

Itens assinados: manifesto de automação, manifesto de runtime, manifesto do Agent, ordem e
(se D-07 = envelope) envelope de segredo.

- Algoritmo: decisão D-04 (Ed25519 por biblioteca estabelecida, ou ECDSA P-256 nativo do
  .NET; confirmar suporte da chave física escolhida). **Nunca escreva criptografia própria.**
- Verifique a assinatura sobre os bytes exatos **antes** de interpretar o conteúdo. Garanta
  isso pelo tipo: o parser só aceita um `ItemVerificado` que só a verificação cria (construtor
  interno, sem outro caminho). Interpretar antes de verificar não pode compilar.
- Cada tipo tem contexto próprio dentro do assinado. Assinatura de um tipo nunca vale para
  outro.
- Recuse campo desconhecido, campo duplicado, item acima do limite.
- O id de reuso é campo assinado, nunca a própria assinatura.
- Assine um cabeçalho pequeno (contexto, id da chave, SHA-256 dos bytes) se a chave física
  limitar a mensagem. Decida na Fase 0 (o ADR-01 do Agente Biason recomenda sempre).

## Chaves

- Chaves públicas compiladas no executável, por papel: `pacotes`, `ordens`, `agente` e (se
  aplicável) `segredos`. Duas por papel, para troca. Uma chave só vale para seu papel.
- Nenhuma configuração, variável ou resposta do Portal troca chave ou desliga verificação.
- Assinatura de produção externa (chave física ou cofre). A chave privada nunca fica em
  arquivo, código ou CI. **Você nunca recebe, gera nem guarda chaves de produção.**
- `revogar_chave` por ordem assinada da outra chave do mesmo papel. A última chave de um papel
  não pode ser revogada.
- `atualizar_agente` exige duas assinaturas de chaves diferentes (decisão D-04 do Agente
  Biason, já aprovada lá; reconfirmar).

## Manifesto

Campos: versão do formato, tipo, id da chave, nome (id da automação), versão, sequência,
SHA-256 e tamanho do pacote, SHA-256 de cada arquivo, runtime exigido, máquinas permitidas
(ids de máquina do Portal, lista não vazia, sem curinga), emissão, validade e sequência mínima
segura. Ele carrega também o `automation.yaml` atual do Catálogo
(`contracts/manifests/automation-manifest.schema.json`: runtime, entrypoint, execution,
capabilities, itens, etapas), sem duplicar schema: o schema do Catálogo é a fonte.

Recuse: assinatura inválida, chave desconhecida, revogada ou de outro papel, manifesto vencido
na preparação, máquina não permitida, campo desconhecido, sequência abaixo da mínima segura.

- A validade do manifesto vale só para preparar. Pacote já preparado continua executando.
- Antes de cada execução, confira o hash de todos os arquivos do pacote e do runtime. Arquivo
  faltando, alterado ou a mais: recuse o início com motivo.
- Entre verificar e iniciar, mantenha os arquivos abertos sem compartilhar escrita e exclusão
  (comprovado no Agente Biason, E5), ou mecanismo equivalente. Documente a janela que sobra.

## Ambiente Python (decisão D-05)

- **B (recomendada)**: ambiente pronto dentro do pacote assinado, gerado no build. Nada roda na
  instalação; tudo o que executa é coberto pela assinatura.
- A: wheels no pacote e ambiente criado na máquina, 100% offline, sem sdist, com inventário.
- Em qualquer caso: interpretador vem de runtime assinado; execução por caminho absoluto, sem
  PATH; `python -I -B`; `.pth` e `.pyd` entram na conferência (`.pth` executa mesmo com `-I`,
  comprovado no Agente Biason, E4); nada grava `__pycache__` nas pastas verificadas.
- O SDK `portal_automacoes` entra no ambiente do pacote como qualquer dependência.

## Relógio

Guarde a maior data assinada já vista e recuse preparação e ordens se o relógio estiver antes
dela. Emissão no futuro além de tolerância curta: recuse. Relógio errado nunca interrompe
execução em andamento.

## Extração segura

Recuse o pacote inteiro, sem gravar nada no destino, se houver: caminho absoluto, `..`, UNC,
prefixo de dispositivo ou letra de unidade; symlink, junction, reparse point ou hard link; nome
reservado do Windows (mesmo com extensão), fluxo alternativo (`:`), caractere de controle, nome
terminado em ponto ou espaço; colisão ao ignorar maiúsculas ou após normalização Unicode, nome
curto 8.3, entrada duplicada; ZIP cifrado, método fora da lista, divergência entre cabeçalho
local e diretório central; excesso de tamanho, arquivos, profundidade, comprimento de caminho
ou taxa de compressão, **medidos durante a descompressão**; arquivo a mais ou a menos que o
manifesto, ou hash divergente.

Leitor: decisão D-09 (leitor próprio de um subconjunto, como no ADR-12 do Agente Biason, ou
`System.IO.Compression` com verificação estrita por fora). `ZipFile.ExtractToDirectory` é
proibido. Todo caminho final é normalizado, confirmado dentro do destino, aberto por handle sem
seguir reparse point, com criação exclusiva.

---

# 8. Execução de processos

- Sem shell: lista de argumentos, nunca texto concatenado. `UseShellExecute` proibido.
- Caminhos absolutos. System32 vem da API do Windows, nunca de PATH ou `SystemRoot`.
- `.ps1`: `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File`, só para
  arquivo verificado (compare com Authenticode na Fase 0). `.bat`/`.cmd`: `cmd.exe /d`, sem
  argumento vindo de fora.
- Ambiente limpo: só uma lista permitida, mais o que o contrato da automação define (seção 10).
  PATH, `PYTHON*`, `UV_*`, `PSModulePath` e proxy não atravessam.
- Pasta de trabalho explícita, fora da pasta do pacote.
- Herança só dos handles listados (`PROC_THREAD_ATTRIBUTE_HANDLE_LIST`).
- Cada tentativa em um Job Object nomeado, sem permissão de sair dele. A política de
  encerramento na queda do controle é a decisão D-08.
- Limitação a documentar: processos abertos por COM, WMI ou Agendador (Excel e Outlook por COM)
  podem ficar fora do Job.
- PID é reutilizado: identifique processo por PID **e** horário de criação **e** caminho da
  imagem. Nunca encerre processo que não seja comprovadamente da tentativa.
- Objetos nomeados com DACL só do usuário do Agent. Objeto preexistente com dono ou DACL
  inesperados: recuse.
- Tempo limite: pede `cancelar` à automação, espera o encerramento gracioso (prazo do
  contrato, hoje 60 s) e só então encerra o Job.

## Endurecimento do executável

- `SetDefaultDllDirectories` antes de qualquer carga; nenhuma DLL carregada da pasta do exe ou
  de trabalho fora da lista; Control Flow Guard onde o .NET permitir (confirmar com NativeAOT).
- Sem minidump com segredos. Mensagem de exceção não inclui dados da operação.
- Prove cada item por inspeção do binário e mostre a saída.
- O executável é assinado com Authenticode no build de release (fora do seu alcance; você
  entrega o fluxo, nunca o certificado).

---

# 9. Conexão com o Portal

## Identidade e sessão

- A máquina gera um par de chaves; a chave privada fica protegida por DPAPI do usuário. O id
  da identidade é a impressão digital da chave pública. O Portal não escolhe esse valor.
- Inscrição com código de uso único, aprovada por um administrador **que escolhe a Máquina**
  cadastrada (ADR-019). O nome informado pela máquina é só dica. É o mesmo padrão do modo
  direto (`backend/gateway/direct_gateway/instancias.py`); **reaproveite o caso de uso do
  Portal**, não crie um terceiro.
- Sessão: desafio assinado (com contexto próprio e o host do Portal) trocado por token curto.
  O token nunca aparece em URL, linha de comando ou log.
- Redefinição de senha da conta pode tornar o DPAPI ilegível: falha segura. O Agent informa e
  não gera identidade nova sozinho. Recuperação = nova inscrição.
- Revogação e quarentena: o Portal recusa a sessão; as execuções em andamento seguem a regra
  definida na Fase 0.

## TLS

- Só WSS e HTTPS, TLS 1.2 ou superior. Valide nome do host e validade.
- Confiança: **raízes compiladas no executável** (duas, para troca), com
  `X509ChainPolicy.TrustMode = CustomRootTrust`. Não use o repositório do Windows. Não existe
  caminho no código para aceitar certificado inválido, nem em depuração.
- `ServerCertificateCustomValidationCallback` que retorne `true` é proibido (analisador de API
  banida). `UseProxy = false`, `AllowAutoRedirect = false`, só o host configurado.
  `ClientWebSocket` usa o mesmo `HttpMessageInvoker` endurecido.
- O Portal hoje sobe em HTTPS com `PORTAL_TLS_CERT`/`PORTAL_TLS_KEY` (`scripts/portal.ps1`); o
  certificado assinado pela "Biason Intranet Root CA" ainda está pendente. Decisão D-13: CA
  dedicada ao Portal (recomendado) ou a CA geral da intranet.
- O Agent informa no heartbeat quantos dias faltam para a raiz vencer.
- Descreva a troca da CA e a recuperação de máquina cujo certificado venceu antes do exe novo.

## Protocolo

- O contrato é o de `contracts/`. Mensagens de saída e de entrada validadas contra o schema;
  campo desconhecido ou acima do limite: recusa com motivo, sem queda.
- Tipos que o Portal já trata (`backend/gateway/agent_gateway/message_router.py`):
  `agent.connected`, `agent.resumed`, `agent.heartbeat`, `agent.profile.updated`,
  `agent.capacity.updated`, `agent.capabilities.updated`, `agent.diagnostic.result`,
  `agent.sync_state`, `agent.update.progress`, `agent.command.ack`, `execution.accepted`,
  `execution.rejected`, `execution.lease.renew`, `execution.started`, `execution.event.batch`,
  `execution.completed`, `execution.failed`, `execution.cancelled`, `execution.timed_out`,
  `artifact.created`, `artifact.uploaded`, `artifact.failed`.
- Comandos do Portal: lista fechada (`contracts/messages/message-types.json`). Comando
  desconhecido é recusado, registrado e respondido com ACK de recusa. Nunca existe "execute
  este texto", shell remoto ou argumento livre.
- Inbox e outbox duráveis, idempotentes por `message_id`; reenvio sem duplicar.
- `execution.started` só depois do processo realmente iniciado (defeito do Agent atual:
  publicava antes).
- Artefatos: `artifact.created` → o ACK do Portal traz `upload_url` e `upload_session_id` → PUT
  por HTTPS → `artifact.uploaded` ou `artifact.failed`. `upload_url` para outro host: recusado.
- Mudança de contrato: nova versão em `contracts/`, Portal e Agent alterados na mesma fase,
  compatibilidade com a versão anterior até a Fase 9.

---

# 10. Canal com a automação (paridade com o modo direto)

O objetivo é que **a mesma automação, com o mesmo SDK, produza o mesmo resultado nos dois
modos**. O teste de paridade (cenário 17 da evolução 1) passa a valer para tudo abaixo.

- Contrato: `contracts/automation-events/v1` (eventos e comandos). O Agent apenas transporta
  os eventos dentro de `execution.event.batch`, sem alterar.
- Transporte: pipe nomeado por tentativa, ACL só do usuário da sessão, token por tentativa,
  ACK, idempotência por `sequence`, limite de 64 KB por evento e 500 por lote (comportamento do
  Agent atual, `Agent.ExecutionHost/Protocol/AutomationEventsServer.cs`, e do SDK
  `transporte_agente.py`).
- O contexto (execução, job, tentativa) **nunca vem da automação**: o Agent o deduz pela
  tentativa dona do pipe. Uma automação não escreve em outra tentativa.
- Variáveis entregues: `PORTAL_MODO=agente`, `AUTOMATION_EVENTS_PIPE`,
  `AUTOMATION_EVENTS_TOKEN`, `AUTOMATION_INPUT_PATH`, `AUTOMATION_ARTIFACTS_PATH` (confirmar a
  lista completa no SDK). Mudança aqui exige SDK novo e teste.
- **Comandos**: `cancelar` e **`parar_apos_item`** (hoje recusado no modo agente). O Portal
  passa a aceitar `apos_item` para tentativas de Agent.
- **Imagens**: `passos/<id>.jpg` sobem na hora pelo fluxo de artefatos. Imagem vazia, corrompida
  ou de cor única é recusada.
- **Arquivos** (evolução 8): enviados pelo fluxo de artefatos, com item e tipo.
- **Entrada**: `input.json` com `dados_dos_itens` e `retomada`, igual ao que o modo direto
  recebe na entrega do job.
- **Segredos e e-mail**: pedidos pelo pipe, atendidos só para a tentativa ativa e só para o que
  a automação declarou (ver seção 11 e decisão D-07).
- Saída padrão e de erro continuam virando `log`, com remoção de segredos.

---

# 11. Segredos

Decisão D-07, obrigatória na Fase 0:

- **(a) Portal guarda e entrega**: o Agent pede, pelo canal autenticado, os segredos da
  tentativa; o Portal entrega se a automação os declarou. Paridade imediata com o modo direto
  (`POST /direto/jobs/{job}/segredos`). Risco: um Portal invadido lê e forja segredos.
- **(b) Envelope cifrado para a máquina e assinado fora do Portal** (HPKE ou formato
  estabelecido, assinatura do papel `segredos`), como no Agente Biason. O Portal guarda e
  entrega sem ver o valor. Vale também para o modo direto, que já tem par de chaves por
  instância. Custo: ferramenta local do administrador, conferência de impressão digital por
  canal independente, mudança na tela de Segredos do Portal.

Em qualquer caso:

- Em disco, só protegidos por DPAPI. Na memória, limpos após o uso quando possível.
- Só vão para a automação que os declarou, na tentativa ativa.
- Nunca entram na preparação nem em testes do pacote.
- Nunca aparecem em log, erro, evento, auditoria, diagnóstico ou exceção. Teste com
  segredo-canário.
- Remoção dos valores na saída capturada, inclusive dividido entre blocos e codificado
  (Base64, URL, hexadecimal, escape JSON, UTF-16). É melhor esforço e não substitui não
  registrar segredos. Documente.

---

# 12. Tela, sessão e capacidade

- Pools: `tela` (interactive), `navegador` e `segundo_plano`. Tela: no máximo um job por
  máquina, somando os dois modos (trava `machine:{id}:screen` do Portal; o Agent também se
  protege localmente).
- O Agent relata sessão logada, bloqueada ou desconectada. Sessão indisponível: recusa oferta
  de tela com motivo, e o Portal não oferece.
- Sessão bloqueada no meio de um job de tela: política da decisão D-12.
- Executor de sessão que morre: detectado, tentativa marcada conforme a regra, nenhum processo
  órfão.
- Navegador: Playwright do pacote, certificado contra página local segura.
- Excel e Domínio: só detecção e verificação somente leitura. Nada de abrir a Domínio real sem
  autorização.
- Admissão com motivo: pool cheio, memória ou disco insuficiente, drenando, sessão indisponível,
  capability ausente, pacote ou runtime inválido, congelado.

---

# 13. Logs, imagens, auditoria e emergência

- Logs, imagens e arquivos podem conter dados de folha. Seguem as regras do Portal: concessão
  por automação ("ver telas e logs"), download auditado, retenção definida por automação
  (**sem prazo padrão**: decisão do usuário na evolução 6; não mude).
- Localmente: retenção limitada por tamanho e idade, definida na Fase 0.
- Texto vindo da automação ou do Portal é escapado no log, contra injeção de linhas.
- Auditoria local em JSONL encadeada por hash (quem pediu, o que fez, resultado, versão, inclusive
  recusas de segurança), enviada ao Portal com o último hash. A cadeia local não protege contra o
  próprio usuário; só o que foi enviado vale como evidência. Documente.
- Sem auditoria gravável: ações críticas recusadas; execuções em andamento continuam.
- Ordens assinadas: `congelar` (bloqueia preparação e atualização; persiste após reinício),
  `descongelar` (vale a emissão mais recente), `desativar_maquina` (encerra execuções, apaga
  identidade e segredos, mantém dados), `revogar_chave`, `forcar_parada`, `atualizar_agente`.
  Ordem: id aleatório, comando, máquinas listadas (sem curinga), emissão, validade (máximo
  compilado). Grave o id como usado antes de executar; recuse repetida, vencida ou de outra
  máquina.

---

# 14. Mudanças no Portal

O Portal muda junto quando a fase pedir. Regras:

- Monolito modular, contextos e ownership de `docs/visao-geral.md` (Módulos do backend) e
  `docs/decisoes.md`.
- Tela alterada: atualize o `docs/telas/<aba>.md` dela no mesmo trabalho (em especial
  `agent.md`, `maquinas.md`, `automacoes.md`, `runtimes.md` e `segredos.md`).
- Migrations sempre aditivas. Aplicar no Portal real só com autorização (reinício).
- Telas novas seguem `docs/design-system.md` e o ADR-020; nada de misturar visual antigo e novo.
- Nenhum mock para esconder integração ausente.
- Reutilizar casos de uso existentes (inscrição e sessão do modo direto, segredos, e-mail,
  comandos, artefatos) antes de criar novos.
- Mudanças previstas: inscrição e sessão do Agent por chave (Fase 4); publicação só de pacote
  assinado e entrega de manifesto (Fase 3); `parar_apos_item`, segredos e e-mail para tentativa
  de Agent (Fase 5); telas de chaves, ordens e emergência (Fase 8).

---

# 15. Código, dependências e build

- `global.json` fixa o SDK. `Directory.Build.props` com `Nullable=enable`,
  `TreatWarningsAsErrors=true`, `AnalysisLevel=latest-all`, `AllowUnsafeBlocks=false` em todos
  os projetos, exceto `Agent.Plataforma.Windows` (cada bloco mínimo e explicado).
- P/Invoke só em `Agent.Plataforma.Windows`, com `LibraryImport` ou CsWin32 (gerador da
  Microsoft).
- `Microsoft.CodeAnalysis.BannedApiAnalyzers` com lista de APIs proibidas, no mínimo:
  `ServerCertificateCustomValidationCallback`, `Process.Start(string)`,
  `ProcessStartInfo.UseShellExecute = true`, `ZipFile.ExtractToDirectory`, `BinaryFormatter`,
  `Environment.GetEnvironmentVariable("PATH")` para resolver executável, `DateTime.Now` fora
  do relógio injetado.
- JSON: `System.Text.Json` com geração de código, membro desconhecido proibido e propriedade
  duplicada recusada (confirmar a opção na versão fixada).
- Aritmética verificada (`checked`) em todo parser. Entrada hostil nunca vira exceção não
  tratada nem queda.
- Gerenciamento central de pacotes, `packages.lock.json` com `RestoreLockedMode` no build,
  mapeamento de origem só para nuget.org, verificação de assinatura dos pacotes NuGet,
  `dotnet list package --vulnerable` sem achados, **quarentena de 14 dias** para versão nova
  (salvo correção de segurança). Mínimo de dependências: para cada uma, confirme que existe,
  quem mantém e por que é necessária. Não confie na memória para nomes.
- Chaves de teste e pontos de falha só em configuração de teste. **O build de release falha**
  sem as chaves públicas e raízes de produção, com chave de teste ou com recurso de teste
  ligado. Prove com teste.
- GitHub Actions (modelo entregue na Fase 8) fixadas por hash de commit, permissões mínimas,
  aprovação manual antes de assinar.

---

# 16. Testes

Obrigatórios: unitários, propriedade (FsCheck ou equivalente), integração com o Portal falso,
fuzzing de parsers e extração (SharpFuzz ou equivalente; confirmar viabilidade no Windows),
mutação no núcleo e na extração (Stryker.NET). Mutante sobrevivente em código de segurança é
falha, salvo explicação aceita pelo usuário.

**Portal falso** (`tools/PortalFalso`): fala o protocolo real (WSS e HTTPS com CA de teste) e
também se comporta como atacante (respostas gigantes, malformadas, repetidas, fora de ordem,
redirecionamento, outro host, comandos fora da lista).

**Executor de ataques** (`dotnet run --project tools/Ataques`): roda cada cenário e imprime
tabela com cenário, invariante, esperado, obtido e APROVADO/REPROVADO/PENDENTE, mais commit,
versão do .NET e ambiente. Qualquer reprovação termina com erro. Pendente nunca aparece como
aprovado.

Um cenário só é aprovado se: tem **controle positivo** (a entrada válida é aceita; um Agent que
recusa tudo reprova); confere o **motivo exato** da recusa; confere a **ausência de efeitos**
(disco, processos, estado, auditoria antes e depois); a recusa aparece na auditoria; está ligado
a invariantes na matriz da Fase 0.

Testes de ataque rodam no ambiente da decisão D-03, nunca contra o Portal real nem em pasta real.

## Cenários

Cenários 1 a 55 do Agente Biason (`docs/especificacao.md` e `docs/fase-0/03-invariantes.md`
de lá), traduzidos. Na Fase 0, classifique cada um: vale como está, vale adaptado (diga como) ou
não se aplica ao modelo por job (diga por quê; precisa de aprovação). Resumo:

1. Pacote alterado após assinatura. 2. Chave desconhecida. 3. Versão antiga ou manifesto
vencido. 4. Pacote de outra máquina. 5. Ordem repetida. 6. Comando fora da lista. 7. Comando
crítico sem ordem assinada. 8. `..`, caminho absoluto, symlink, fluxo alternativo: nada gravado.
9. Bomba de compressão ou download além do limite. 10. TLS inválido ou redirecionamento.
11. Resposta malformada ou gigante. 12. Pacote inválido na preparação: o anterior segue
disponível. 13. Versão nova que falha ao iniciar (adaptar ao modelo por job). 14. Queda de
energia em cada passo. 15. Arquivo do pacote alterado em disco. 16. Segredo-canário em logs,
eventos, auditoria e diagnósticos. 17. Neto da automação sobrevivendo à parada forçada.
18. Nenhuma tentativa de elevar privilégio. 19. Release com chave de teste. 20. Ordem vencida ou
de outra máquina. 21. Preparação com congelamento. 22. Arquivo extra ou estado alterado.
23. Arquivo trocado entre verificação e uso. 24. Agent reiniciado com execução ativa. 25. Segunda
instância. 26. Execução como administrador, elevado ou com token filtrado. 27. Parada que estoura
o prazo. 28. Volta de versão com dados migrados (avaliar). 29. Máquina revogada. 30. Assinatura
de um tipo usada em outro. 31. Chave fora do papel ou revogada. 32. Nome ou versão com caminho
ou nome reservado. 33. Nome divergente entre `automation.yaml` e manifesto. 34. Arquivo a mais
ou a menos que o manifesto. 35. Envelope de segredo inválido (se D-07 = b). 36. Relógio atrasado.
37. `descongelar` antigo depois de `congelar` novo. 38. Raiz criada por outra conta. 39. DLL
plantada. 40. Ambiente contaminado (PATH, PYTHONPATH, UV_*, PSModulePath, SystemRoot, proxy).
41. Ambiente Python alterado ou com `.pth` extra. 42. Mutex, evento ou Job pré-criado. 43–44.
Portal fora do ar ou mentindo durante a espera (adaptar). 45. Parada forçada sem ordem.
46. Autoatualização com pacote errado, versão antiga, exe novo que não sobe ou queda na troca.
47. Disco cheio na auditoria ou no estado. 48. Cadeia de auditoria alterada antes do envio.
49. Release com recurso de teste. 50. Teste do pacote tentando rede, dados ou programa real.
51. Nenhuma porta TCP ou UDP em escuta, em operação normal e na preparação. 52. Segundo pedido
de preparação durante um ciclo: recusado, primeiro ciclo intacto. 53. Conexões de saída
observadas: só ao host configurado. 54. Automação pede segredo que não declarou: não recebe.
55. Conferência estática: nenhum shell com texto montado nem caminho para desligar verificação.

Cenários novos, do modelo do Portal:

56. Oferta ou commit repetidos pelo fio real: um único processo.
57. Nenhuma execução começa sem `execution.commit`; commit de oferta recusada ou vencida: recusado.
58. Mensagem com `agent_id` ou `agent_instance_id` de outro, versão de protocolo diferente ou
    `sent_at` fora da janela: recusada.
59. Lease perdida: a tentativa termina pela regra, sem dois executores para o mesmo job.
60. Processo do mesmo usuário conecta ao pipe sem token, ou com token de outra tentativa: recusado.
61. Automação envia evento com contexto, campo extra, acima de 64 KB, lote acima de 500 ou
    sequência repetida: recusado ou ignorado conforme o contrato, sem queda.
62. Automação pede envio de arquivo fora da pasta de artefatos (com `..`, link ou caminho
    absoluto): recusado.
63. Imagem vazia, corrompida ou de cor única: recusada.
64. Segredo pedido sem declaração, por outra tentativa ou depois do fim: recusado.
65. Dois jobs de tela na mesma máquina, nos dois modos: o segundo espera.
66. Sessão bloqueada antes da oferta: recusa com motivo; durante: política D-12.
67. Executor de sessão encerrado no meio: detectado, sem processo órfão.
68. Conexão cai durante a execução: eventos reenviados sem duplicar e sem perder (comparar
    sequências no Portal).
69. Portal reinicia durante a execução: reconciliação por `agent.sync_state`, estado final igual.
70. Upload de artefato interrompido: retomado ou `artifact.failed`, hash conferido.
71. `upload_url` para outro host: recusado.
72. `parar_apos_item`: o próximo item não começa. `cancelar`: encerramento gracioso no prazo e
    depois o Job inteiro.
73. Mesma automação nos dois modos: mesmos eventos, mesmo histórico, mesma estimativa.
74. PID reutilizado: o Agent não adota nem encerra processo alheio.
75. Mensagem WebSocket gigante ou malformada: conexão fechada, sem queda, com reconexão.
76. Credencial, token de sessão ou token de tentativa em log, diagnóstico, linha de comando ou URL:
    nunca encontrados.

---

# 17. Metas de leveza (medir; não estimar)

Tamanho do executável, memória parado, memória do vigia por tentativa, tempo da conferência
antes do início (pacote médio e grande), tempo entre `execution.commit` e o processo iniciado.
Proponha os alvos na Fase 0 e meça a partir da Fase 2.

---

# 18. Fases

Cada fase termina com o relatório **na conversa** (seção 19) e **parada para aprovação**. Não
crie relatório de fase em arquivo: o `AGENTS.md` proíbe relatórios, diagnósticos e capturas em
`docs/`. O que for documentação duradoura do Agent (regras, ameaças, invariantes, formatos,
limites, guias) fica junto do código novo, em `agent/docs/` (D-11), e descreve como o Agent
funciona, não o que foi feito em cada fase.

## Fase 0: diagnóstico e regras, sem código do Agent

Os documentos da Fase 0 vão para `agent/docs/` (só documentos; a solução .NET nasce na Fase 1).
Se a D-11 ainda estiver aberta, pergunte antes de criar a pasta.

1. Inventário do Agent atual, componente por componente: reaproveitar, reescrever ou descartar,
   com motivo e evidência.
2. Leitura da Fase 0 do Agente Biason e lista do que vale, do que muda e do que não se aplica ao
   modelo por job.
3. Modelo de ameaças com riscos aceitos e impacto no negócio; alternativas de isolamento com
   custo.
4. Invariantes numerados (NUNCA e SEMPRE) e matriz invariante × cenário, incluindo a
   classificação dos cenários 1 a 55 e os 56 a 76.
5. Decisões de arquitetura, cada uma com alternativas, custo e recomendação, cobrindo todas as
   decisões da seção 20.
6. Formatos finais: manifesto, ordem, envelope (se houver), automation.yaml dentro do manifesto.
7. Contratos: o que muda em `contracts/` e no Portal, por fase; contrato da automação no modo
   agente (variáveis, pipe, comandos, prazos).
8. Tabela de limites (tamanhos, quantidades, tempos, taxas), com cada número justificado.
9. Dependências NuGet verificadas (existência, mantenedor, data, avisos), versão do .NET e fim do
   suporte confirmados.
10. Metas de leveza e ambiente de testes de que precisa (com o que exige administrador uma vez).
11. Sondas no Windows que comprovem os fatos de que a arquitetura depende (Job Object, pipe com
    ACL, troca do exe em execução, DLL search, tarefa de logon sem administrador), em pasta
    temporária, com saída anexada. Repita as do Agente Biason que ainda importam, em conta comum.
12. Lista de decisões que precisam do usuário, com qual fase cada uma trava.

## Fase 1: fundação e núcleo de segurança

- Solução nova no local da D-11, com `global.json`, `Directory.Build.props`, analisadores, APIs
  banidas, pacotes centralizados e travados, quarentena conferida por script.
- `Agent.Nucleo`: contêiner assinado e `ItemVerificado`, chaves por papel, manifesto, ordens,
  envelope (se houver), nomes e caminhos, limites, política de admissão. Sem disco, rede ou
  relógio do sistema.
- Portão de build de release (cenários 19 e 49).
- Testes unitários e de propriedade; `tools/Ataques` com a tabela; fuzzing dos parsers; mutação
  do núcleo.
- Aceite: todos os cenários da parte de núcleo aprovados; mutação sem sobreviventes em código de
  segurança; nenhum aviso.

## Fase 2: plataforma Windows e execução local, sem Portal

- Verificação de identidade do processo (privilégios, conta), instância única, pastas e ACL.
- Job Object, criação de processo endurecida, ambiente limpo, herança explícita de handles.
- Vigia por tentativa (ou alternativa aprovada), captura de saída com remoção de segredos,
  estado atômico, auditoria encadeada.
- Reencontro de processos depois da queda do controle (D-08), com PID e horário de criação.
- Detecção de sessão (logada, bloqueada, desconectada).
- Execução de um pacote de teste já presente em pasta temporária, com tempo limite e
  cancelamento.
- Primeira medição de leveza.
- Aceite: cenários 17, 18, 24, 25, 26, 38, 39, 40, 42, 47, 74 e os de canal local que couberem.

## Fase 3: pacotes, runtimes e publicação assinada

- Download por HTTPS com limites (servido pelo Portal falso), verificação, extração segura,
  store de pacotes e runtimes imutáveis, ambiente Python (D-05), conferência antes de cada início.
- `Agent.Empacotador`: pacote e manifesto reproduzíveis (mesma entrada, mesmos bytes), com chaves
  de teste.
- **Portal**: Catálogo aceita e guarda só pacotes assinados, entrega manifesto e pacote ao Agent;
  pacote sem assinatura não fica disponível para o modo agente. Migrations aditivas, sem aplicar
  no Portal real sem autorização.
- Aceite: cenários 1 a 4, 8, 9, 12, 15, 22, 23, 30 a 34, 41, 50 e os de runtime.

## Fase 4: conexão com o Portal

- Identidade por chave, inscrição com código de uso único, aprovação com escolha da Máquina,
  sessão por desafio assinado. **Portal**: inscrição e sessão do Agent reaproveitando o modo
  direto.
- TLS endurecido com raízes compiladas; WebSocket com envelope validado; heartbeat, perfil,
  capacidade e capabilities explícitos; oferta, aceite, recusa, commit, cancelamento, lease;
  inbox e outbox; `agent.sync_state`; artefatos guiados pelo ACK.
- Tudo provado primeiro contra o Portal falso (normal e atacante), depois contra uma instância
  de testes do Portal (banco de teste, nunca o real).
- Aceite: cenários 5, 6, 7, 10, 11, 20, 29, 36, 37, 56 a 59, 70, 71, 75, 76.

## Fase 5: canal da automação e paridade com o modo direto

- Pipe com ACL e token, eventos `automation-events/1`, imagens ao vivo, arquivos, `input.json`
  com `dados_dos_itens` e `retomada`, `cancelar` gracioso, **`parar_apos_item`**, **segredos**
  (D-07) e **e-mail**.
- **Portal**: `apos_item`, segredos e e-mail para tentativa de Agent.
- **SDK**: `transporte_agente.py` atualizado se preciso, com versão nova e testes; a suíte de
  paridade roda nos dois modos.
- Aceite: cenários 16, 35 (se houver), 60 a 64, 72, 73; suíte do SDK aprovada nos dois modos.

## Fase 6: tela, navegador e sessões

- Executor de sessão conforme D-01; trava de tela local e do Portal; sessão bloqueada antes e
  durante (D-12); recuperação do executor de sessão; controle exclusivo.
- Certificação com Notepad, depois navegador (Playwright em página local), depois Excel sem
  afetar processos alheios. Domínio só com detecção somente leitura, salvo autorização.
- Aceite: cenários 65 a 67 e os relatórios de certificação de tela e navegador.

## Fase 7: resiliência e certificação ponta a ponta

- Queda da conexão, Portal reiniciado e Agent reiniciado **durante** execuções; queda de energia
  simulada em cada passo; leases longas com vários ciclos; dois Agents ao mesmo tempo; todos os
  estados conferidos na API e nas telas do Portal (Painel, Fila, Acompanhar, Máquinas).
- Roteiro repetível `scripts/certificar-agent.ps1`, com saída legível.
- Certificação contra o **Portal real** só com autorização, com automação de certificação
  própria, sem dados reais, e sem reiniciar o Portal por conta própria.
- Medição final de leveza.
- Aceite: cenários 14, 24, 43, 44, 68, 69 e a matriz completa sem REPROVADO.

## Fase 8: instalação, atualização e emergência

- Instalador e desinstalador conforme D-01 (com o que exige administrador uma vez documentado);
  desinstalação só apaga dados com confirmação explícita.
- Atualização automática do Agent com tentativa antes da troca e volta automática (ADR-06 do
  Agente Biason), exigindo as assinaturas do papel `agente`.
- Ordens assinadas de emergência ponta a ponta. **Portal**: telas de chaves, ordens, congelamento e
  desativação de máquina (design-system e ADR-020).
- Modelo de GitHub Actions para gerar, conferir e encaminhar à assinatura.
- Guias em `agent/docs/`: instalação, operação, emergência, troca de chaves, troca da CA,
  recuperação de identidade, preparar uma automação para o modo agente.
- Aceite: cenários 21, 27, 45, 46, 48 e os de emergência.

## Fase 9: migração e saída do Agent antigo

- Plano por máquina: instalar o novo, inscrever, conferir, desligar o antigo.
- Compatibilidade do Portal com o Agent antigo até a última máquina migrar; depois, remoção do
  adaptador e do código antigo **somente com autorização explícita**.
- Atualização de `AGENTS.md`, `docs/visao-geral.md`, `docs/README.md`, `docs/telas/agent.md` e
  `docs/telas/maquinas.md` para o Agent novo.

---

# 19. Relatório de cada fase (na conversa, não em arquivo)

- O que foi feito e o que falta.
- Saída real de: build, testes, analisadores, `dotnet list package --vulnerable`, quarentena,
  executor de ataques (tabela), fuzzing e mutação quando houver.
- Tamanho do executável e memória, medidos (a partir da Fase 2).
- Testes ou cenários alterados, com motivo e aprovação.
- Mudanças no Portal e no SDK, com migrations e se foram aplicadas.
- Desvios desta especificação, com motivo.
- Riscos e limitações abertos.
- Decisões que travam a próxima fase.

---

# 20. Decisões que precisam do usuário

| Id | Pergunta | Recomendação inicial | Trava |
|---|---|---|---|
| D-01 | Modelo no Windows: tarefa no logon de usuário comum (A), serviço SYSTEM (B) ou híbrido (C)? Quem faz logon? Logon automático? | A, máquina ou VM dedicada, logon automático com senha como segredo LSA | Fase 2 |
| D-02 | Conta dedicada local ou de domínio? Uma conta para todas as automações? | Domínio (recuperação do DPAPI); uma conta, separando por máquina o que tiver sensibilidade diferente | Fase 2 |
| D-03 | Onde rodam build e testes de ataque? (No Agente Biason a escolha foi este computador) | VM Hyper-V dedicada; este computador só para testes que não criem contas nem tarefas | Fase 1 |
| D-04 | Algoritmo de assinatura, chave física, quantas chaves e quem guarda; duas assinaturas para atualizar o Agent | Confirmar Ed25519 na YubiKey 5 (firmware 5.7.4+); se o .NET exigir biblioteca pouco confiável, ECDSA P-256 nativo. Duas de duas para o Agent | Fase 1 (formato), Fase 3 (aparelhos) |
| D-05 | Python pronto no pacote ou criado na máquina? | Pronto no pacote | Fase 3 |
| D-06 | Onde o pacote é gerado e quem aprova a assinatura? | GitHub Actions gera; uma pessoa confere e assina com a chave física; Portal nunca assina | Fase 3 |
| D-07 | Segredos: Portal guarda e entrega (a) ou envelope cifrado para a máquina (b)? | (b) nos dois modos, se aceitar o custo operacional; senão (a) com o risco registrado | Fase 5 |
| D-08 | Se o controle cair, a automação continua (adotada depois) ou é encerrada? | Continua e é adotada, com PID e horário de criação conferidos | Fase 2 |
| D-09 | Leitor de ZIP próprio e nomes só ASCII? Há arquivos com acento nos pacotes? | Leitor próprio, ASCII, salvo se houver acentos em uso | Fase 3 |
| D-10 | NativeAOT ou self-contained single-file? | NativeAOT, se as bibliotecas escolhidas funcionarem nele | Fase 2 |
| D-11 | Onde fica o código novo? | `agent/` na raiz; `automation-agent/` congelado até a Fase 9 | Fase 1 |
| D-12 | Sessão bloqueada no meio de um job de tela: pausar e esperar, falhar ou pedir atenção? | Pausar com `pausa.iniciada` e avisar; falhar depois de um prazo configurável | Fase 6 |
| D-13 | CA dedicada ao Portal ou a "Biason Intranet Root CA"? Quem opera? | CA dedicada, com restrição de nomes se possível | Fase 4 |
| D-14 | Carregar pacote de pasta local no release? | Não; só em testes | Fase 3 |
| D-15 | Quarentena de 14 dias para dependências? | Sim | Fase 1 |
| D-16 | Retenção local de logs e imagens na máquina | 7 dias ou limite de tamanho, o que vier primeiro | Fase 2 |

## Decisões tomadas

(Registrar aqui, com data, conforme forem aprovadas. Decisão de arquitetura também vira linha
nova em `docs/decisoes.md`.)

---

# 21. Proibido

- Backdoor, modo de manutenção ou senha mestra.
- Opção para pular assinatura, TLS, verificação de hash ou testes, mesmo em depuração.
- Executar ou baixar código fora do fluxo assinado.
- Porta de entrada, inclusive em localhost.
- Telemetria para qualquer destino que não seja o Portal configurado.
- Credenciais reais em código, testes, logs ou documentação.
- Chaves de produção em qualquer lugar ao seu alcance.
- Acesso a máquinas reais, à Domínio, ao GitHub de produção ou ao banco real do Portal sem
  autorização para aquele teste.
- Reiniciar o Portal real ou aplicar migrations nele sem autorização.
- Mexer na Integração Contábil.
- Apagar o Agent antigo, telas ou dados sem autorização explícita.
- Declarar o Agent "seguro" ou "pronto para produção".
- Dizer que há isolamento entre automações.

Comece pela Fase 0 e pare ao terminar.
