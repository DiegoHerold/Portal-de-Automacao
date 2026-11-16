"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Calculator, Minus, Plus, X } from "lucide-react";

import { frase } from "@/components/fluxos/frases";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { FUNCAO_PRONTA, FUNCOES_PRONTAS, nomeDoArgumento } from "@/lib/fluxos/funcoes";
import type { Declaracao, Destino, Expr, Funcao, TipoDeValor } from "@/lib/fluxos/tipos";
import { cn } from "@/lib/utils";

/*
 * Campos do painel do editor de fluxos. Valor digitado ou ficha de "valores dinâmicos": o campo em
 * foco fica ativo e clicar numa ficha do rodapé do painel o preenche (padrão do Power Automate).
 */

type Ativo = { id: string; aplicar: (valor: Expr) => void } | null;
const CampoAtivo = createContext<{ ativo: Ativo; ativar: (a: Ativo) => void }>({ ativo: null, ativar: () => undefined });

export function ProvedorDeCampoAtivo({ children }: { children: ReactNode }) {
  const [ativo, ativar] = useState<Ativo>(null);
  return <CampoAtivo.Provider value={{ ativo, ativar }}>{children}</CampoAtivo.Provider>;
}

export function useCampoAtivo() {
  return useContext(CampoAtivo);
}

/** As funções do fluxo, para o menu "Calcular" de qualquer campo. */
const FuncoesDoFluxo = createContext<Funcao[]>([]);
export const ProvedorDeFuncoes = FuncoesDoFluxo.Provider;

const CONTAS: { op: "+" | "-" | "*" | "/" | "%"; rotulo: string }[] = [
  { op: "+", rotulo: "+ somar" }, { op: "-", rotulo: "− subtrair" }, { op: "*", rotulo: "× multiplicar" },
  { op: "/", rotulo: "÷ dividir" }, { op: "%", rotulo: "resto da divisão" },
];
const ehConta = (v: Expr) => v.tipo === "op" && ["+", "-", "*", "/", "%"].includes(v.op);

/** Menu "Calcular": conta, posição numa lista, funções prontas e funções do fluxo. */
function MenuCalcular({ aplicar }: { aplicar: (v: Expr) => void }) {
  const funcoes = useContext(FuncoesDoFluxo);
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);
  const vazio = (): Expr => ({ tipo: "texto", valor: "" });
  const escolher = (v: Expr) => { setAberto(false); aplicar(v); };
  const grupos = ["Texto", "Números", "Listas", "Datas"] as const;
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label="Calcular" title="Calcular: conta, função pronta ou função do fluxo" onClick={() => setAberto(!aberto)}
        className="grid h-10 w-10 place-items-center rounded-md border border-input text-muted-foreground hover:border-primary hover:text-primary">
        <Calculator className="h-4 w-4" />
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg" data-testid="menu-calcular">
          <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Conta</p>
          <button type="button" role="menuitem" className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-muted"
            onClick={() => escolher({ tipo: "op", op: "+", a: { tipo: "numero", valor: 0 }, b: { tipo: "numero", valor: 0 } })}>Conta (+ − × ÷)</button>
          <button type="button" role="menuitem" className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-muted"
            onClick={() => escolher({ tipo: "item", de: { tipo: "lista", itens: [] }, indice: { tipo: "numero", valor: 1 } })}>Item da lista na posição…</button>
          {funcoes.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Funções do fluxo</p>
              {funcoes.map((f) => (
                <button key={f.nome} type="button" role="menuitem" className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => escolher({ tipo: "chamar", funcao: f.nome, args: f.parametros.map(vazio) })}>{f.nome}</button>
              ))}
            </>
          )}
          {grupos.map((g) => (
            <div key={g}>
              <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{g}</p>
              {FUNCOES_PRONTAS.filter((f) => f.grupo === g).map((f) => (
                <button key={f.nome} type="button" role="menuitem" data-funcao={f.nome} className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => escolher({ tipo: "fn", nome: f.nome, args: Array.from({ length: f.minimo }, vazio) })}>{f.rotulo}</button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Conta, posição de lista ou função: uma caixa com um campo por valor (cada um aceita ficha ou outra conta). */
function CampoComposto({ valor, onChange, limpar }: { valor: Expr; onChange: (v: Expr) => void; limpar: () => void }) {
  const funcoes = useContext(FuncoesDoFluxo);
  let titulo = "";
  let corpo: ReactNode = null;
  if (valor.tipo === "op") {
    titulo = "Conta";
    corpo = (
      <>
        <CampoDeValor valor={valor.a} espera="qualquer" onChange={(a) => onChange({ ...valor, a })} />
        <Select aria-label="Operação" value={valor.op} onChange={(e) => onChange({ ...valor, op: e.target.value as typeof valor.op })}>
          {CONTAS.map((c) => <option key={c.op} value={c.op}>{c.rotulo}</option>)}
        </Select>
        <CampoDeValor valor={valor.b} espera="qualquer" onChange={(b) => onChange({ ...valor, b })} />
      </>
    );
  } else if (valor.tipo === "item") {
    titulo = "Item da lista";
    corpo = (
      <>
        <Rotulado rotulo="lista"><CampoDeValor valor={valor.de} espera="lista" onChange={(de) => onChange({ ...valor, de })} /></Rotulado>
        <Rotulado rotulo="posição (1 = primeiro)"><CampoDeValor valor={valor.indice} espera="numero" onChange={(indice) => onChange({ ...valor, indice })} /></Rotulado>
      </>
    );
  } else if (valor.tipo === "fn" || valor.tipo === "chamar") {
    const pronta = valor.tipo === "fn" ? FUNCAO_PRONTA[valor.nome] : undefined;
    const propria = valor.tipo === "chamar" ? funcoes.find((f) => f.nome === valor.funcao) : undefined;
    titulo = pronta?.rotulo ?? (valor.tipo === "chamar" ? `Função ${valor.funcao}` : valor.nome);
    const nomes = valor.args.map((_, i) => (pronta ? nomeDoArgumento(pronta, i) : propria?.parametros[i]?.nome ?? `valor ${i + 1}`));
    const mudarArg = (i: number, a: Expr) => onChange({ ...valor, args: valor.args.map((x, n) => (n === i ? a : x)) });
    corpo = (
      <>
        {valor.args.map((a, i) => (
          <Rotulado key={i} rotulo={nomes[i]} tirar={pronta && valor.args.length > pronta.minimo ? () => onChange({ ...valor, args: valor.args.filter((_, n) => n !== i) }) : undefined}>
            <CampoDeValor valor={a} espera="qualquer" onChange={(novo) => mudarArg(i, novo)} />
          </Rotulado>
        ))}
        {pronta && valor.args.length < pronta.maximo && (
          <Button size="sm" variant="ghost" onClick={() => onChange({ ...valor, args: [...valor.args, { tipo: "texto", valor: "" }] })}>
            <Plus className="h-4 w-4" /> {nomeDoArgumento(pronta, valor.args.length)}
          </Button>
        )}
        {valor.args.length === 0 && <p className="text-xs text-muted-foreground">Sem valores para preencher.</p>}
      </>
    );
  }
  return (
    <div className="space-y-2 rounded-md border border-primary/25 bg-primary/5 p-2.5" data-composto={valor.tipo}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-primary">{titulo}</span>
        <button type="button" aria-label="Tirar o cálculo" onClick={limpar} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      {corpo}
    </div>
  );
}

function Rotulado({ rotulo, children, tirar }: { rotulo: string; children: ReactNode; tirar?: () => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{rotulo}</span>
        {tirar && <button type="button" onClick={tirar} className="text-xs text-muted-foreground hover:text-destructive">tirar</button>}
      </div>
      {children}
    </div>
  );
}

export type Espera = "texto" | "numero" | "lista" | "data" | "booleano" | "qualquer";
const REFERENCIA = new Set(["var", "entrada", "campo", "item", "fn", "chamar", "op", "nao", "objeto"]);

export function literalVazio(espera: Espera): Expr {
  if (espera === "numero") return { tipo: "numero", valor: 0 };
  if (espera === "lista") return { tipo: "lista", itens: [] };
  if (espera === "booleano") return { tipo: "booleano", valor: true };
  return { tipo: "texto", valor: "" };
}

/** Rótulo, campo e uma ajuda curta embaixo. */
export function Campo({ rotulo, ajuda, children, erro }: { rotulo: string; ajuda?: ReactNode; children: ReactNode; erro?: string | null }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-titulo">{rotulo}</p>
      {children}
      {erro ? <p className="text-xs text-destructive">{erro}</p> : ajuda ? <p className="text-xs leading-relaxed text-muted-foreground">{ajuda}</p> : null}
    </div>
  );
}

/** Um valor: digitado (texto, número, lista um por linha) ou uma ficha de valor dinâmico. */
export function CampoDeValor({ valor, onChange, espera = "texto", placeholder }: {
  valor: Expr | undefined; onChange: (v: Expr) => void; espera?: Espera; placeholder?: string;
}) {
  const id = useId();
  const { ativo, ativar } = useCampoAtivo();
  const foco = () => ativar({ id, aplicar: onChange });
  const ehAtivo = ativo?.id === id;
  const v = valor ?? literalVazio(espera);
  const moldura = cn("w-full rounded-md border bg-background transition-shadow", ehAtivo ? "border-primary ring-2 ring-primary/20" : "border-input");

  if (ehConta(v) || v.tipo === "fn" && FUNCAO_PRONTA[v.nome] || v.tipo === "chamar" || v.tipo === "item") {
    return <CampoComposto valor={v} onChange={onChange} limpar={() => onChange(literalVazio(espera))} />;
  }
  if (REFERENCIA.has(v.tipo) || (v.tipo === "lista" && v.itens.some((i) => i.tipo !== "texto" && i.tipo !== "numero"))) {
    return (
      <div className={cn(moldura, "flex min-h-10 items-center gap-2 px-3 py-1.5")} tabIndex={0} onFocus={foco} onClick={foco} data-campo-dinamico>
        <span className="min-w-0 flex-1 text-sm leading-relaxed">{frase(v)}</span>
        <button type="button" aria-label="Tirar o valor dinâmico" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={(e) => { e.stopPropagation(); onChange(literalVazio(espera)); }}>
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-1.5">
      <div className="min-w-0 flex-1"><CampoLiteral v={v} onChange={onChange} espera={espera} placeholder={placeholder} moldura={moldura} foco={foco} /></div>
      {espera !== "booleano" && <MenuCalcular aplicar={onChange} />}
    </div>
  );
}

function CampoLiteral({ v, onChange, espera, placeholder, moldura, foco }: {
  v: Expr; onChange: (v: Expr) => void; espera: Espera; placeholder?: string; moldura: string; foco: () => void;
}) {
  if (espera === "numero" || v.tipo === "numero") {
    return <Input type="number" className={moldura} value={v.tipo === "numero" ? v.valor : ""} onFocus={foco} placeholder={placeholder ?? "0"}
      onChange={(e) => onChange({ tipo: "numero", valor: e.target.value === "" ? 0 : Number(e.target.value) })} />;
  }
  if (espera === "booleano" || v.tipo === "booleano") {
    return (
      <Select className={moldura} value={v.tipo === "booleano" && v.valor ? "sim" : "nao"} onFocus={foco}
        onChange={(e) => onChange({ tipo: "booleano", valor: e.target.value === "sim" })}>
        <option value="sim">Sim (verdadeiro)</option><option value="nao">Não (falso)</option>
      </Select>
    );
  }
  if (espera === "lista" || v.tipo === "lista") {
    const linhas = v.tipo === "lista" ? v.itens.map((i) => (i.tipo === "texto" || i.tipo === "numero" ? String(i.valor) : "")).join("\n") : "";
    return <Textarea className={cn(moldura, "min-h-20")} rows={3} value={linhas} onFocus={foco} placeholder={placeholder ?? "Um por linha, ou clique num valor dinâmico"}
      onChange={(e) => onChange({ tipo: "lista", itens: e.target.value.split("\n").filter((l) => l.trim()).map((l) => ({ tipo: "texto", valor: l.trim() })) })} />;
  }
  return <Input className={moldura} value={v.tipo === "texto" ? v.valor : ""} onFocus={foco} placeholder={placeholder ?? "Digite ou clique num valor dinâmico"}
    type={espera === "data" ? "date" : "text"} onChange={(e) => onChange({ tipo: "texto", valor: e.target.value })} />;
}

// -- condição em linhas -------------------------------------------------------------------------

type Linha = { a: Expr; op: string; b?: Expr };
const OPERADORES_DA_LINHA: { op: string; rotulo: string; precisaB: boolean }[] = [
  { op: "=", rotulo: "é igual a", precisaB: true }, { op: "!=", rotulo: "é diferente de", precisaB: true },
  { op: ">", rotulo: "é maior que", precisaB: true }, { op: "<", rotulo: "é menor que", precisaB: true },
  { op: ">=", rotulo: "é pelo menos", precisaB: true }, { op: "<=", rotulo: "é no máximo", precisaB: true },
  { op: "vazio", rotulo: "está vazio", precisaB: false }, { op: "nao_vazio", rotulo: "não está vazio", precisaB: false },
  { op: "contem", rotulo: "contém", precisaB: true },
];

function folhas(x: Expr, juncao: "e" | "ou"): Expr[] {
  return x.tipo === "op" && x.op === juncao ? [...folhas(x.a, juncao), ...folhas(x.b, juncao)] : [x];
}

function paraLinha(x: Expr): Linha | null {
  if (x.tipo === "op" && ["=", "!=", ">", "<", ">=", "<="].includes(x.op)) return { a: x.a, op: x.op, b: x.b };
  if (x.tipo === "fn" && x.nome === "vazio") return { a: x.args[0], op: "vazio" };
  if (x.tipo === "nao" && x.a.tipo === "fn" && x.a.nome === "vazio") return { a: x.a.args[0], op: "nao_vazio" };
  if (x.tipo === "fn" && x.nome === "contem") return { a: x.args[0], op: "contem", b: x.args[1] };
  return null;
}

function lerCondicao(x: Expr | undefined): { juncao: "e" | "ou"; linhas: Linha[] } | null {
  if (!x || (x.tipo === "booleano")) return { juncao: "e", linhas: [] };
  const juncao = x.tipo === "op" && x.op === "ou" ? "ou" : "e";
  const linhas = folhas(x, juncao).map(paraLinha);
  return linhas.every(Boolean) ? { juncao, linhas: linhas as Linha[] } : null;
}

function montarCondicao(juncao: "e" | "ou", linhas: Linha[]): Expr {
  const exprs: Expr[] = linhas.map((l) => {
    if (l.op === "vazio") return { tipo: "fn", nome: "vazio", args: [l.a] };
    if (l.op === "nao_vazio") return { tipo: "nao", a: { tipo: "fn", nome: "vazio", args: [l.a] } };
    if (l.op === "contem") return { tipo: "fn", nome: "contem", args: [l.a, l.b ?? literalVazio("texto")] };
    return { tipo: "op", op: l.op as "=", a: l.a, b: l.b ?? literalVazio("texto") };
  });
  if (!exprs.length) return { tipo: "booleano", valor: true };
  return exprs.reduce((acc, atual) => ({ tipo: "op", op: juncao, a: acc, b: atual }));
}

/** "valor · operador · valor", com E/OU. Condição que não cabe em linhas aparece como frase. */
export function CampoDeCondicao({ valor, onChange }: { valor: Expr | undefined; onChange: (v: Expr) => void }) {
  const lida = lerCondicao(valor);
  if (!lida) {
    return (
      <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
        <p className="leading-relaxed">{frase(valor)}</p>
        <Button size="sm" variant="outline" onClick={() => onChange(montarCondicao("e", [{ a: literalVazio("texto"), op: "=" }]))}>Refazer em linhas</Button>
      </div>
    );
  }
  const { juncao, linhas } = lida;
  const mudar = (novas: Linha[], j: "e" | "ou" = juncao) => onChange(montarCondicao(j, novas));
  return (
    <div className="space-y-2" data-testid="condicao">
      {linhas.length > 1 && (
        <Select value={juncao} onChange={(e) => mudar(linhas, e.target.value as "e" | "ou")} aria-label="Como juntar as condições">
          <option value="e">Todas as condições abaixo (e)</option>
          <option value="ou">Qualquer uma das condições (ou)</option>
        </Select>
      )}
      {linhas.map((l, i) => {
        const tipo = OPERADORES_DA_LINHA.find((o) => o.op === l.op);
        return (
          <div key={i} className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5" data-linha={i}>
            <CampoDeValor valor={l.a} espera="qualquer" onChange={(a) => mudar(linhas.map((x, n) => (n === i ? { ...x, a } : x)))} />
            <div className="flex gap-2">
              <Select value={l.op} aria-label="Operador" onChange={(e) => mudar(linhas.map((x, n) => (n === i ? { ...x, op: e.target.value } : x)))}>
                {OPERADORES_DA_LINHA.map((o) => <option key={o.op} value={o.op}>{o.rotulo}</option>)}
              </Select>
              <Button size="icon" variant="ghost" aria-label="Tirar esta condição" onClick={() => mudar(linhas.filter((_, n) => n !== i))}><X className="h-4 w-4" /></Button>
            </div>
            {tipo?.precisaB && <CampoDeValor valor={l.b} espera="qualquer" onChange={(b) => mudar(linhas.map((x, n) => (n === i ? { ...x, b } : x)))} />}
          </div>
        );
      })}
      <Button size="sm" variant="outline" onClick={() => mudar([...linhas, { a: literalVazio("texto"), op: "=" }])}>
        <Plus className="h-4 w-4" /> {linhas.length ? "Mais uma condição" : "Adicionar condição"}
      </Button>
      {!linhas.length && <p className="text-xs text-muted-foreground">Sem condição: sempre verdadeiro.</p>}
    </div>
  );
}

// -- seletores ------------------------------------------------------------------------------------

function compativel(esperado: TipoDeValor | undefined, tipo: TipoDeValor): boolean {
  if (!esperado || esperado === "qualquer" || tipo === "qualquer") return true;
  if (typeof esperado === "object") return typeof tipo === "object";
  return esperado === tipo;
}

/** Variável do fluxo: as compatíveis e "nova variável" (cria e escolhe). */
export function SeletorDeVariavel({ valor, onChange, variaveis, tipo, criar, permitirNenhuma }: {
  valor: string | undefined; onChange: (nome: string | undefined) => void; variaveis: Declaracao[]; tipo?: TipoDeValor;
  criar: (nome: string, tipo: TipoDeValor) => void; permitirNenhuma?: boolean;
}) {
  const [nova, setNova] = useState<string | null>(null);
  const opcoes = variaveis.filter((v) => compativel(tipo, v.tipo));
  if (nova !== null) {
    const nome = nova.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+/, "");
    return (
      <div className="flex gap-2">
        <Input autoFocus value={nova} placeholder="nome_da_variavel" onChange={(e) => setNova(e.target.value)} aria-label="Nome da nova variável" />
        <Button disabled={!nome} onClick={() => { criar(nome, tipo ?? "qualquer"); onChange(nome); setNova(null); }}>Criar</Button>
        <Button variant="ghost" onClick={() => setNova(null)}>Cancelar</Button>
      </div>
    );
  }
  return (
    <Select value={valor ?? ""} aria-label="Variável" onChange={(e) => (e.target.value === "__nova" ? setNova("") : onChange(e.target.value || undefined))}>
      <option value="">{permitirNenhuma ? "Não guardar" : "Escolha a variável"}</option>
      {opcoes.map((v) => <option key={v.nome} value={v.nome}>{v.nome}</option>)}
      <option value="__nova">+ Nova variável…</option>
    </Select>
  );
}

export function SeletorDeDestino({ valor, onChange, times }: { valor: Destino | undefined; onChange: (d: Destino) => void; times: { id: number; name: string }[] }) {
  const atual = valor?.tipo === "time" ? `time:${valor.id}` : "quem_executou";
  return (
    <Select value={atual} aria-label="Para quem" onChange={(e) => onChange(e.target.value === "quem_executou" ? { tipo: "quem_executou" }
      : { tipo: "time", id: Number(e.target.value.split(":")[1]) })}>
      <option value="quem_executou">Quem executou o fluxo</option>
      {times.map((t) => <option key={t.id} value={`time:${t.id}`}>Time {t.name}</option>)}
    </Select>
  );
}

export function Segmentos<T extends string>({ valor, opcoes, onChange }: { valor: T; opcoes: { valor: T; rotulo: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid overflow-hidden rounded-md border border-border" style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }} role="radiogroup">
      {opcoes.map((o) => (
        <button key={o.valor} type="button" role="radio" aria-checked={o.valor === valor} onClick={() => onChange(o.valor)}
          className={cn("px-3 py-2 text-sm transition-colors", o.valor === valor ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function Contador({ valor, onChange, minimo = 0, maximo = 9999, rotulo }: { valor: number; onChange: (v: number) => void; minimo?: number; maximo?: number; rotulo: string }) {
  return (
    <div className="inline-flex items-center overflow-hidden rounded-md border border-border" aria-label={rotulo}>
      <button type="button" aria-label="Menos" className="px-3 py-2 text-primary hover:bg-muted" onClick={() => onChange(Math.max(minimo, valor - 1))}><Minus className="h-4 w-4" /></button>
      <input aria-label={rotulo} className="w-16 border-x border-border bg-background py-2 text-center font-semibold tabular-nums" value={valor}
        onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); if (!Number.isNaN(n)) onChange(Math.min(maximo, Math.max(minimo, n))); }} />
      <button type="button" aria-label="Mais" className="px-3 py-2 text-primary hover:bg-muted" onClick={() => onChange(Math.min(maximo, valor + 1))}><Plus className="h-4 w-4" /></button>
    </div>
  );
}
