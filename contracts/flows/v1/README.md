# Contrato `fluxo/v1`: fluxos em blocos

Um fluxo é um programa em blocos salvo como uma árvore JSON (AST). Portal e editor usam o mesmo
schema: [`fluxo.schema.json`](fluxo.schema.json). Decisão: ADR-021 em [docs/decisoes.md](../../../docs/decisoes.md); como funciona: [docs/telas/fluxos.md](../../../docs/telas/fluxos.md).
Exemplos válidos em [`examples/`](examples/) (os testes conferem que continuam válidos).

## Forma
```json
{ "contrato": "fluxo/v1", "entradas": [], "variaveis": [], "funcoes": [], "corpo": [ ...comandos ] }
```
- **Comando**: `{"id", "tipo", ...}`; o `id` é único no fluxo (o id do bloco no editor) e serve para
  apontar erro e, na execução, destacar o bloco em andamento.
- **Expressão**: `{"tipo", ...}` com `id` opcional. Nunca é texto avaliado: não há `eval`.
- **Tipos de valor**: `texto`, `numero`, `booleano`, `data`, `objeto`, `resultado` (de automação),
  `qualquer` e `{"lista": tipo}`.
- **Nomes** (entradas, variáveis, funções): letras minúsculas, números e `_`.

## Comandos
| tipo | campos | observação |
|---|---|---|
| `definir` | `variavel`, `valor` | variável declarada em `variaveis` |
| `alterar` | `variavel`, `por` | soma um número |
| `adicionar` | `lista`, `valor` | no fim da lista |
| `se` | `casos[{condicao, corpo}]`, `senao` | se / senão se / senão |
| `repetir_vezes` | `vezes`, `corpo` | |
| `enquanto` | `condicao`, `corpo`, `modo` (`enquanto`/`ate`) | condição fixa sem saída é erro |
| `para_cada` | `variavel`, `lista`, `corpo` | a variável só existe dentro do corpo |
| `parar_laco`, `proximo` | | só dentro de laço |
| `esperar` | `segundos` ou `ate` (data) | |
| `registrar` | `texto`, `nivel` | log do fluxo |
| `avisar` | `para{tipo: time/pessoa/quem_executou, id}`, `texto` | notificação |
| `tentar` | `corpo`, `se_falhar`, `motivo_em` | |
| `concluir` | `valor` | resultado do fluxo |
| `falhar` | `motivo` | |
| `executar_automacao` | `automacao` (chave), `itens`, `parametros`, `guardar_em`, `novas_tentativas{ate, esperar_segundos}` | sempre pela fila |
| `dividir_automacao` | `automacao`, `modo` (`itens`/`fatias`), `itens` ou `item`+`fatias`, `partes` ou `itens_por_parte`, `parametros`, `guardar_em` | cada parte é um job na fila |
| `perguntar` | `para`, `pergunta`, `opcoes[{rotulo, corpo}]` (2 a 6), `guardar_em` | pendência de decisão |
| `chamar_subfluxo` | `fluxo` (id), `entradas`, `guardar_em` | execução filha da última versão publicada (mesma pessoa); `guardar_em` recebe o valor do "concluir" dela; falha ou cancelamento dela é falha tratável; sem chamada circular |

## Expressões
`numero`, `texto`, `booleano`, `nulo`, `lista{itens}`, `objeto{campos}`, `var{nome}`, `entrada{nome}`,
`op{op, a, b}` (`+ - * / %`, `= != < <= > >=`, `e`, `ou`), `nao{a}`, `campo{de, campo}`,
`item{de, indice}`, `chamar{funcao, args}` (função do fluxo) e `fn{nome, args}` (funções prontas:
`tamanho`, `vazio`, `contem`, `juntar_texto`, `substituir`, `dividir_texto`, `maiusculas`,
`minusculas`, `arredondar`, `minimo`, `maximo`, `soma`, `absoluto`, `hoje`, `agora`, `somar_dias`,
`competencia`, `formatar_data`, `primeiro`, `ultimo`, `dividir_em_partes`, `sem_repetidos`,
`para_texto`, `para_numero`).

Campos do `resultado`: `situacao` (`ok`, `parcial`, `falhou`, `cancelada`), `motivo`, `total_ok`,
`total_com_erro`, `itens_ok`, `itens_com_erro`, `itens_em_atencao`, `fatias_com_erro`, `partes_com_erro`,
`arquivos`, `execucao`. Com `guardar_em`, o fluxo segue e decide; sem `guardar_em` e com erro, o passo
falha (um "tentar" pode tratar). Dividir por `fatias` exige a automação com `execucao.aceita_partes`
no manifesto; cada parte recebe `_parte = {indice, total, fatias}` nos parâmetros.

## Funções do fluxo
`{"nome", "parametros": [{nome, tipo}], "retorno": expressão, "tipo_retorno"}`: cálculo ou comparação
reutilizável, sem automação e sem efeito. Recursão (direta ou indireta) é erro.

## Validação
Estrutura pelo schema; sentido pelo Portal (`backend/modules/orchestration/fluxos/domain/validador.py`).
Cada erro: `{"bloco", "campo", "mensagem"}`. Limite de blocos: `fluxo.max_blocos` (Governança > Limites).
Ler uma variável declarada antes de definir devolve `nulo`. Posição em lista (`item`) começa em **1**.
Datas trafegam como texto ISO (`2026-11-13` ou com hora).
