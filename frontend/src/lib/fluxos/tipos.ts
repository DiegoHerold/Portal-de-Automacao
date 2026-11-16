/**
 * Fluxos em blocos: os tipos do contrato `contracts/flows/v1` (schema em `GET /fluxos/contrato`).
 * O editor lê e grava esta árvore direto: cada cartão é um comando (ADR-021).
 */

export type TipoDeValor = "texto" | "numero" | "booleano" | "data" | "objeto" | "qualquer" | "resultado" | { lista: TipoDeValor };

export type Expr =
  | { tipo: "numero"; valor: number; id?: string }
  | { tipo: "texto"; valor: string; id?: string }
  | { tipo: "booleano"; valor: boolean; id?: string }
  | { tipo: "nulo"; id?: string }
  | { tipo: "lista"; itens: Expr[]; id?: string }
  | { tipo: "objeto"; campos: Record<string, Expr>; id?: string }
  | { tipo: "var"; nome: string; id?: string }
  | { tipo: "entrada"; nome: string; id?: string }
  | { tipo: "op"; op: Operador; a: Expr; b: Expr; id?: string }
  | { tipo: "nao"; a: Expr; id?: string }
  | { tipo: "fn"; nome: string; args: Expr[]; id?: string }
  | { tipo: "campo"; de: Expr; campo: string; id?: string }
  | { tipo: "item"; de: Expr; indice: Expr; id?: string }
  | { tipo: "chamar"; funcao: string; args: Expr[]; id?: string };

export type Operador = "+" | "-" | "*" | "/" | "%" | "=" | "!=" | "<" | "<=" | ">" | ">=" | "e" | "ou";

export type Destino = { tipo: "time" | "pessoa" | "quem_executou"; id?: number | string };

export type Comando = { id: string; tipo: TipoDeComando; comentario?: string } & Record<string, unknown>;

export type TipoDeComando =
  | "definir" | "alterar" | "adicionar" | "se" | "repetir_vezes" | "enquanto" | "para_cada" | "parar_laco" | "proximo"
  | "esperar" | "registrar" | "avisar" | "tentar" | "concluir" | "falhar" | "executar_automacao" | "dividir_automacao"
  | "perguntar" | "chamar_subfluxo";

export type Entrada = { nome: string; tipo: TipoDeValor; obrigatoria?: boolean; rotulo?: string; descricao?: string };
export type Declaracao = { nome: string; tipo: TipoDeValor };
export type Funcao = { nome: string; id?: string; parametros: Declaracao[]; retorno: Expr; tipo_retorno?: TipoDeValor };

export type Fluxo = { contrato: "fluxo/v1"; entradas?: Entrada[]; variaveis?: Declaracao[]; funcoes?: Funcao[]; corpo: Comando[] };

export type ErroDoFluxo = { bloco: string | null; campo: string | null; mensagem: string };

export type FluxoResumo = {
  id: string; nome: string; descricao: string | null; situacao: "ativo" | "arquivado"; versao_publicada: number | null;
  publicada_em: string | null; rascunho_mudou: boolean; rascunho_atualizado_em: string; criado_em: string;
};

export type FluxoDetalhe = FluxoResumo & {
  rascunho: Fluxo; erros: ErroDoFluxo[];
  versoes: { numero: number; publicada_em: string; publicada_por: string | null; notas: string | null }[];
};

export const CAMPOS_DO_RESULTADO: { campo: string; rotulo: string; tipo: TipoDeValor }[] = [
  { campo: "situacao", rotulo: "situação", tipo: "texto" },
  { campo: "total_ok", rotulo: "total ok", tipo: "numero" },
  { campo: "total_com_erro", rotulo: "total com erro", tipo: "numero" },
  { campo: "itens_ok", rotulo: "itens ok", tipo: { lista: "texto" } },
  { campo: "itens_com_erro", rotulo: "itens com erro", tipo: { lista: "texto" } },
  { campo: "itens_em_atencao", rotulo: "itens em atenção", tipo: { lista: "texto" } },
  { campo: "fatias_com_erro", rotulo: "partes do trabalho com erro", tipo: { lista: "texto" } },
  { campo: "arquivos", rotulo: "arquivos entregues", tipo: { lista: "objeto" } },
  { campo: "motivo", rotulo: "motivo da falha", tipo: "texto" },
];

export function nomeDoTipo(tipo: TipoDeValor | undefined): string {
  if (!tipo) return "qualquer";
  if (typeof tipo === "object") return `lista de ${nomeDoTipo(tipo.lista)}`;
  return { texto: "texto", numero: "número", booleano: "sim/não", data: "data", objeto: "objeto", qualquer: "qualquer",
           resultado: "resultado de automação" }[tipo];
}
