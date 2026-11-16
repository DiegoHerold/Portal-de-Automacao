import type { ReactNode } from "react";

import { FUNCAO_PRONTA } from "@/lib/fluxos/funcoes";
import { CAMPOS_DO_RESULTADO, type Comando, type Destino, type Expr } from "@/lib/fluxos/tipos";

/** Nomes que o resumo precisa (vêm das listas do Portal). */
export type Nomes = { automacoes: Record<string, string>; fluxos: Record<string, string>; times: Record<string, string> };

const ROTULO_DO_CAMPO = Object.fromEntries(CAMPOS_DO_RESULTADO.map((c) => [c.campo, c.rotulo]));
export const OPERADORES: Record<string, string> = {
  "=": "é igual a", "!=": "é diferente de", "<": "é menor que", ">": "é maior que", "<=": "é no máximo", ">=": "é pelo menos",
  "+": "+", "-": "−", "*": "×", "/": "÷", "%": "resto de", e: "e", ou: "ou",
};

export function Ficha({ children, de }: { children: ReactNode; de?: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-primary/15 bg-primary/10 px-2 py-px text-xs font-semibold text-primary">
      {children}
      {de && <span className="font-normal text-muted-foreground">de {de}</span>}
    </span>
  );
}

/** A expressão como frase com fichas. Nunca mostra código. */
export function frase(x: Expr | undefined | null): ReactNode {
  if (!x) return <span className="text-muted-foreground">vazio</span>;
  switch (x.tipo) {
    case "numero": return <b>{x.valor}</b>;
    case "texto": return x.valor ? <>“{x.valor}”</> : <span className="text-muted-foreground">texto vazio</span>;
    case "booleano": return <b>{x.valor ? "verdadeiro" : "falso"}</b>;
    case "nulo": return <span className="text-muted-foreground">vazio</span>;
    case "var": case "entrada": return <Ficha>{x.nome}</Ficha>;
    case "campo": return <Ficha de={x.de.tipo === "var" ? x.de.nome : undefined}>{ROTULO_DO_CAMPO[x.campo] ?? x.campo}</Ficha>;
    case "lista":
      if (!x.itens.length) return <span className="text-muted-foreground">lista vazia</span>;
      return <>{x.itens.slice(0, 4).map((i, n) => <span key={n}>{n > 0 && ", "}{frase(i)}</span>)}{x.itens.length > 4 && ` e mais ${x.itens.length - 4}`}</>;
    case "fn":
      if (x.nome === "vazio") return <>{frase(x.args[0])} está vazio</>;
      if (x.nome === "contem") return <>{frase(x.args[0])} contém {frase(x.args[1])}</>;
      return <><i>{(FUNCAO_PRONTA[x.nome]?.rotulo ?? x.nome.replace(/_/g, " ")).toLowerCase()}</i>{x.args.length > 0 && <> de {x.args.map((a, n) => <span key={n}>{n > 0 && ", "}{frase(a)}</span>)}</>}</>;
    case "nao":
      if (x.a.tipo === "fn" && x.a.nome === "vazio") return <>{frase(x.a.args[0])} não está vazio</>;
      if (x.a.tipo === "fn" && x.a.nome === "contem") return <>{frase(x.a.args[0])} não contém {frase(x.a.args[1])}</>;
      return <>não ({frase(x.a)})</>;
    case "op": return <>{frase(x.a)} {x.op === "e" || x.op === "ou" ? <b>{OPERADORES[x.op]}</b> : OPERADORES[x.op]} {frase(x.b)}</>;
    case "item": return <>item {frase(x.indice)} de {frase(x.de)}</>;
    case "chamar": return <><i>{x.funcao.replace(/_/g, " ")}</i>{x.args.length > 0 && <> de {x.args.map((a, n) => <span key={n}>{n > 0 && ", "}{frase(a)}</span>)}</>}</>;
    case "objeto": return <>objeto</>;
    default: return "…";
  }
}

export function quem(para: Destino | undefined, nomes: Nomes): string {
  if (!para || para.tipo === "quem_executou") return "quem executou";
  if (para.tipo === "time") return `o time ${nomes.times[String(para.id)] ?? para.id ?? "?"}`;
  return "uma pessoa";
}

/** O resumo do cartão (embaixo do nome). */
export function resumo(c: Comando, nomes: Nomes): ReactNode {
  const e = (chave: string) => c[chave] as Expr | undefined;
  const automacao = (chave: unknown) => (chave ? nomes.automacoes[String(chave)] ?? String(chave) : <span className="text-destructive">escolha a automação</span>);
  switch (c.tipo) {
    case "executar_automacao": return <>{automacao(c.automacao)}{c.itens ? <> · itens: {frase(e("itens"))}</> : null}
      {c.guardar_em ? <> · guarda em <Ficha>{String(c.guardar_em)}</Ficha></> : null}</>;
    case "dividir_automacao": return <>{automacao(c.automacao)} · <b>{c.partes ? `${c.partes} partes` : `${c.itens_por_parte} por parte`}</b>
      {" "}· {c.modo === "fatias" ? <>trabalho: {frase(e("fatias"))}</> : <>itens: {frase(e("itens"))}</>}</>;
    case "se": return null;
    case "enquanto": return <>{c.modo === "ate" ? "Até que" : "Enquanto"} {frase(e("condicao"))}</>;
    case "repetir_vezes": return <>{frase(e("vezes"))} vezes</>;
    case "para_cada": return <>Cada <Ficha>{String(c.variavel)}</Ficha> em {frase(e("lista"))}</>;
    case "definir": return c.variavel ? <><Ficha>{String(c.variavel)}</Ficha> recebe {frase(e("valor"))}</> : <span className="text-destructive">escolha a variável</span>;
    case "alterar": return c.variavel ? <><Ficha>{String(c.variavel)}</Ficha> soma {frase(e("por"))}</> : <span className="text-destructive">escolha a variável</span>;
    case "adicionar": return <>{frase(e("valor"))} no fim de <Ficha>{String(c.lista || "?")}</Ficha></>;
    case "esperar": {
      const s = e("segundos");
      if (s?.tipo === "numero") return s.valor % 3600 === 0 ? `${s.valor / 3600} h` : s.valor % 60 === 0 ? `${s.valor / 60} minutos` : `${s.valor} segundos`;
      return s ? <>{frase(s)} segundos</> : <>até {frase(e("ate"))}</>;
    }
    case "perguntar": return <>A {quem(c.para as Destino, nomes)}: {frase(e("pergunta"))}</>;
    case "avisar": return <>A {quem(c.para as Destino, nomes)}: {frase(e("texto"))}</>;
    case "registrar": return frase(e("texto"));
    case "tentar": return c.motivo_em ? <>O motivo da falha vai para <Ficha>{String(c.motivo_em)}</Ficha></> : null;
    case "chamar_subfluxo": return c.fluxo ? <>{nomes.fluxos[String(c.fluxo)] ?? String(c.fluxo)}{c.guardar_em ? <> · guarda em <Ficha>{String(c.guardar_em)}</Ficha></> : null}</>
      : <span className="text-destructive">escolha o fluxo</span>;
    case "concluir": return c.valor ? <>Com o resultado {frase(e("valor"))}</> : "Sem resultado";
    case "falhar": return frase(e("motivo"));
    default: return null;
  }
}
