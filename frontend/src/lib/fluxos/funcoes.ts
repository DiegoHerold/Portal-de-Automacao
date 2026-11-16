/**
 * Funções prontas do contrato `fluxo/v1` (as mesmas de `validador.py`, `FUNCOES_PRONTAS`) com o nome e
 * os valores como a tela mostra. `vazio` e `contem` ficam de fora: são condições (linhas da condição).
 */

export type FuncaoPronta = { nome: string; rotulo: string; grupo: "Texto" | "Números" | "Listas" | "Datas"; args: string[]; minimo: number; maximo: number };

export const FUNCOES_PRONTAS: FuncaoPronta[] = [
  { nome: "juntar_texto", rotulo: "Juntar textos", grupo: "Texto", args: ["texto"], minimo: 1, maximo: 10 },
  { nome: "substituir", rotulo: "Substituir no texto", grupo: "Texto", args: ["texto", "procurar", "trocar por"], minimo: 3, maximo: 3 },
  { nome: "dividir_texto", rotulo: "Dividir texto em lista", grupo: "Texto", args: ["texto", "separador"], minimo: 2, maximo: 2 },
  { nome: "maiusculas", rotulo: "Maiúsculas", grupo: "Texto", args: ["texto"], minimo: 1, maximo: 1 },
  { nome: "minusculas", rotulo: "Minúsculas", grupo: "Texto", args: ["texto"], minimo: 1, maximo: 1 },
  { nome: "para_texto", rotulo: "Virar texto", grupo: "Texto", args: ["valor"], minimo: 1, maximo: 1 },
  { nome: "para_numero", rotulo: "Virar número", grupo: "Números", args: ["valor"], minimo: 1, maximo: 1 },
  { nome: "arredondar", rotulo: "Arredondar", grupo: "Números", args: ["número", "casas"], minimo: 1, maximo: 2 },
  { nome: "minimo", rotulo: "Menor valor", grupo: "Números", args: ["valor"], minimo: 1, maximo: 10 },
  { nome: "maximo", rotulo: "Maior valor", grupo: "Números", args: ["valor"], minimo: 1, maximo: 10 },
  { nome: "soma", rotulo: "Somar a lista", grupo: "Números", args: ["lista"], minimo: 1, maximo: 1 },
  { nome: "absoluto", rotulo: "Sem sinal (absoluto)", grupo: "Números", args: ["número"], minimo: 1, maximo: 1 },
  { nome: "tamanho", rotulo: "Tamanho", grupo: "Listas", args: ["lista ou texto"], minimo: 1, maximo: 1 },
  { nome: "primeiro", rotulo: "Primeiro da lista", grupo: "Listas", args: ["lista"], minimo: 1, maximo: 1 },
  { nome: "ultimo", rotulo: "Último da lista", grupo: "Listas", args: ["lista"], minimo: 1, maximo: 1 },
  { nome: "sem_repetidos", rotulo: "Sem repetidos", grupo: "Listas", args: ["lista"], minimo: 1, maximo: 1 },
  { nome: "dividir_em_partes", rotulo: "Dividir lista em partes", grupo: "Listas", args: ["lista", "partes"], minimo: 2, maximo: 2 },
  { nome: "hoje", rotulo: "Hoje", grupo: "Datas", args: [], minimo: 0, maximo: 0 },
  { nome: "agora", rotulo: "Agora", grupo: "Datas", args: [], minimo: 0, maximo: 0 },
  { nome: "somar_dias", rotulo: "Somar dias", grupo: "Datas", args: ["data", "dias"], minimo: 2, maximo: 2 },
  { nome: "competencia", rotulo: "Competência (MM/AAAA)", grupo: "Datas", args: ["data"], minimo: 1, maximo: 1 },
  { nome: "formatar_data", rotulo: "Formatar data", grupo: "Datas", args: ["data", "formato"], minimo: 2, maximo: 2 },
];

export const FUNCAO_PRONTA = Object.fromEntries(FUNCOES_PRONTAS.map((f) => [f.nome, f])) as Record<string, FuncaoPronta>;

/** Nome do valor `i` (as variádicas repetem o primeiro: "texto 2", "texto 3"...). */
export function nomeDoArgumento(f: FuncaoPronta, i: number): string {
  if (i < f.args.length) return f.args[i];
  return `${f.args[f.args.length - 1]} ${i + 1}`;
}
