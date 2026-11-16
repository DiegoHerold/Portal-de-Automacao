"use client";

import { createContext, useContext, useEffect, useRef, useState, type DragEvent } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Copy, GripVertical, MoreHorizontal, MoveDown, MoveUp, Plus, Trash2, XCircle } from "lucide-react";

import { frase, resumo, type Nomes } from "@/components/fluxos/frases";
import { corposDe, type Caminho, type Lugar } from "@/lib/fluxos/arvore";
import { INICIO, PASSO_POR_TIPO } from "@/lib/fluxos/catalogo";
import type { Comando, Expr, Fluxo } from "@/lib/fluxos/tipos";
import { cn } from "@/lib/utils";

/*
 * A tela do editor: uma coluna de cartões ligados por uma linha, com "+" entre eles. Condição,
 * pergunta e tentar abrem ramos lado a lado; repetições mostram "Faça" dentro do cartão. Arrastar um
 * cartão pela alça e soltar num "+" muda o passo de lugar.
 */

export type AcaoDoCartao = "duplicar" | "subir" | "descer" | "apagar";
/** Tela ao vivo (Fase 7): por onde a execução passou e onde está agora. */
export type Marca = "atual" | "esperando" | "feito" | "erro";

type Tela = {
  fluxo: Fluxo; selecionado: string | null; nomes: Nomes; erros: Map<string, string[]>; somenteLeitura: boolean; marcas?: Map<string, Marca>;
  selecionar: (id: string) => void; inserirEm: (lugar: Lugar) => void; agir: (id: string, acao: AcaoDoCartao) => void;
  soltar: (id: string, lugar: Lugar) => void;
};

const TelaCtx = createContext<Tela | null>(null);
const ArrastoCtx = createContext<{ arrastando: string | null; setArrastando: (id: string | null) => void }>({ arrastando: null, setArrastando: () => undefined });
const useTela = () => useContext(TelaCtx)!;

export function TelaDoFluxo(props: Tela) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const totalDeEntradas = props.fluxo.entradas?.length ?? 0;
  return (
    <TelaCtx.Provider value={props}>
      <ArrastoCtx.Provider value={{ arrastando, setArrastando }}>
        <div className="flex w-max flex-col items-center" data-testid="tela-do-fluxo">
          <CartaoBase id="inicio" icone={INICIO.icone} cor={INICIO.cor} nome={INICIO.nome}
            resumo={totalDeEntradas ? `${totalDeEntradas} ${totalDeEntradas === 1 ? "entrada" : "entradas"}: ${(props.fluxo.entradas ?? []).map((e) => e.rotulo || e.nome).join(", ")}`
              : "Executado à mão, sem entradas."} />
          <ListaDePassos caminho={["corpo"]} itens={props.fluxo.corpo} raiz />
        </div>
      </ArrastoCtx.Provider>
    </TelaCtx.Provider>
  );
}

function ListaDePassos({ caminho, itens, raiz }: { caminho: Caminho; itens: Comando[]; raiz?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center", !raiz && "w-full")}>
      {itens.length === 0 && !raiz ? (
        <Inserir lugar={{ lista: caminho, indice: 0 }} vazio />
      ) : (
        <>
          {raiz && <Ligacao />}
          {raiz && <Inserir lugar={{ lista: caminho, indice: 0 }} />}
          {itens.map((c, i) => (
            <div key={c.id} className={cn("flex flex-col items-center", !raiz && "w-full")}>
              {(raiz || i > 0) && <Ligacao />}
              {!raiz && i === 0 && <Inserir lugar={{ lista: caminho, indice: 0 }} compacto />}
              {!raiz && i === 0 && <Ligacao />}
              <Cartao c={c} caminho={[...caminho, i]} />
              <Ligacao />
              <Inserir lugar={{ lista: caminho, indice: i + 1 }} compacto={!raiz} />
            </div>
          ))}
          {raiz && itens.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Clique no + para adicionar o primeiro passo.</p>}
        </>
      )}
    </div>
  );
}

function Ligacao() {
  return <span aria-hidden className="block h-4 w-0.5 bg-border" />;
}

function Inserir({ lugar, vazio, compacto }: { lugar: Lugar; vazio?: boolean; compacto?: boolean }) {
  const t = useTela();
  const { arrastando, setArrastando } = useContext(ArrastoCtx);
  const [sobre, setSobre] = useState(false);
  if (t.somenteLeitura) return vazio ? <p className="py-2 text-center text-sm text-muted-foreground">Nenhum passo</p> : null;
  const soltar = (e: DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/fluxo-passo") || arrastando;
    setSobre(false);
    setArrastando(null);
    if (id) t.soltar(id, lugar);
  };
  const alvo = {
    onDragOver: (e: DragEvent) => { if (arrastando) { e.preventDefault(); setSobre(true); } },
    onDragLeave: () => setSobre(false),
    onDrop: soltar,
  };
  if (vazio) {
    return (
      <button type="button" {...alvo} onClick={() => t.inserirEm(lugar)} data-inserir={lugar.lista.join(".") + ":" + lugar.indice}
        className={cn("flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm transition-colors",
          sobre ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary")}>
        <Plus className="h-4 w-4" /> {arrastando ? "Soltar aqui" : "Adicionar um passo"}
      </button>
    );
  }
  return (
    <button type="button" {...alvo} onClick={() => t.inserirEm(lugar)} aria-label="Adicionar um passo aqui"
      data-inserir={lugar.lista.join(".") + ":" + lugar.indice}
      className={cn("grid place-items-center rounded-full border bg-card text-primary shadow-sm transition-all",
        compacto ? "h-6 w-6" : "h-7 w-7",
        sobre ? "scale-125 border-primary bg-primary text-primary-foreground" : arrastando ? "border-primary ring-4 ring-primary/15" : "border-border hover:border-primary hover:bg-primary hover:text-primary-foreground")}>
      <Plus className="h-4 w-4" />
    </button>
  );
}

const BORDA_DA_MARCA: Record<Marca, string> = {
  atual: "border-info ring-[3px] ring-info/25", esperando: "border-warning ring-[3px] ring-warning/25",
  feito: "border-success/50", erro: "border-destructive ring-[3px] ring-destructive/15",
};

function SeloDaMarca({ marca }: { marca: Marca | undefined }) {
  if (!marca) return null;
  if (marca === "feito") return <CheckCircle2 className="h-4 w-4 text-success" aria-label="Passou por aqui" />;
  if (marca === "erro") return <XCircle className="h-4 w-4 text-destructive" aria-label="Falhou aqui" />;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
      marca === "atual" ? "bg-info/15 text-info" : "bg-warning/15 text-warning")} data-marca={marca}>
      <span className={cn("h-1.5 w-1.5 animate-pulse rounded-full", marca === "atual" ? "bg-info" : "bg-warning")} />
      {marca === "atual" ? "Agora" : "Esperando"}
    </span>
  );
}

function CartaoBase({ id, icone: Icone, cor, nome, resumo: texto }: { id: string; icone: typeof INICIO.icone; cor: string; nome: string; resumo: React.ReactNode }) {
  const t = useTela();
  const sel = t.selecionado === id;
  const marca = t.marcas?.get(id);
  return (
    <div className={cn("w-[460px] max-w-full rounded-xl border bg-card shadow-sm transition-shadow",
      sel ? "border-primary ring-[3px] ring-primary/15" : marca ? BORDA_DA_MARCA[marca] : "border-border hover:border-primary/40")}
      data-cartao={id}>
      <button type="button" onClick={() => t.selecionar(id)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", cor)}><Icone className="h-[18px] w-[18px]" /></span>
        <span className="min-w-0">
          <span className="flex items-center gap-2 font-semibold text-titulo">{nome}<SeloDaMarca marca={marca} /></span>
          <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{texto}</span>
        </span>
      </button>
    </div>
  );
}

function Cartao({ c, caminho }: { c: Comando; caminho: Caminho }) {
  const t = useTela();
  const { setArrastando } = useContext(ArrastoCtx);
  const [recolhido, setRecolhido] = useState(false);
  const meta = PASSO_POR_TIPO[c.tipo];
  const Icone = meta?.icone ?? AlertCircle;
  const sel = t.selecionado === c.id;
  const erros = t.erros.get(c.id) ?? [];
  const corpos = corposDe(c, caminho);
  const lado = c.tipo === "se" || c.tipo === "tentar" || c.tipo === "perguntar";
  const texto = resumo(c, t.nomes);
  const marca = t.marcas?.get(c.id);

  return (
    <div className={cn(corpos.length ? "w-max min-w-[460px]" : "w-[460px]", "max-w-none rounded-xl border bg-card shadow-sm transition-shadow",
      sel ? "border-primary ring-[3px] ring-primary/15" : marca ? BORDA_DA_MARCA[marca] : erros.length ? "border-destructive/60" : "border-border hover:border-primary/40")}
      data-cartao={c.id} data-tipo={c.tipo} data-marca={marca}
      draggable={!t.somenteLeitura}
      onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData("text/fluxo-passo", c.id); e.dataTransfer.effectAllowed = "move"; setArrastando(c.id); }}
      onDragEnd={() => setArrastando(null)}>
      <div className="flex items-center gap-1 pr-2">
        {!t.somenteLeitura && <GripVertical aria-hidden className="ml-1.5 h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60" />}
        <button type="button" onClick={() => t.selecionar(c.id)} className={cn("flex min-w-0 flex-1 items-center gap-3 py-3 text-left", t.somenteLeitura ? "px-3.5" : "pl-1.5 pr-1")}>
          <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", meta?.cor ?? "bg-muted")}><Icone className="h-[18px] w-[18px]" /></span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-semibold text-titulo">
              {meta?.nome ?? c.tipo}
              {erros.length > 0 && <AlertCircle className="h-4 w-4 text-destructive" aria-label="Este passo tem pendências" />}
              <SeloDaMarca marca={marca} />
            </span>
            {texto && <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{texto}</span>}
            {c.comentario && <span className="mt-1 block text-xs italic text-muted-foreground">{String(c.comentario)}</span>}
          </span>
        </button>
        {corpos.length > 0 && (
          <button type="button" aria-label={recolhido ? "Mostrar o que tem dentro" : "Recolher"} onClick={() => setRecolhido(!recolhido)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            {recolhido ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
        {!t.somenteLeitura && <MenuDoCartao id={c.id} />}
      </div>
      {erros.length > 0 && sel && (
        <div className="mx-3.5 mb-3 rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive">{erros[0]}</div>
      )}
      {c.tipo === "se" && !recolhido && (c.casos as { condicao: Expr }[]).map((caso, i) => (
        <p key={i} className="pb-2 pl-[60px] pr-4 text-sm leading-relaxed">{i > 0 && <b>Senão, se </b>}{frase(caso.condicao)}</p>
      ))}
      {recolhido && corpos.length > 0 && (
        <p className="px-4 pb-3 text-sm text-muted-foreground">{corpos.map((k) => k.rotulo).join(" · ")} recolhidos</p>
      )}
      {!recolhido && corpos.length > 0 && (lado ? (
        <div className="mx-3 mb-3 flex gap-3.5">
          {corpos.map((k) => <Ramo key={k.caminho.join(".")} rotulo={k.rotulo} tom={k.tom} caminho={k.caminho} />)}
        </div>
      ) : (
        corpos.map((k) => (
          <div key={k.caminho.join(".")} className="mx-3 mb-3 rounded-lg border border-dashed border-border bg-muted/40 px-4 pb-2 pt-3">
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{k.rotulo}</p>
            <ListaDePassos caminho={k.caminho} itens={lerLista(t.fluxo, k.caminho)} />
          </div>
        ))
      ))}
    </div>
  );
}

function lerLista(fluxo: Fluxo, caminho: Caminho): Comando[] {
  let no: unknown = fluxo;
  for (const p of caminho) no = (no as Record<string | number, unknown> | undefined)?.[p];
  return Array.isArray(no) ? (no as Comando[]) : [];
}

const PONTO = { sim: "bg-success", nao: "bg-muted-foreground", erro: "bg-destructive", neutro: "bg-muted-foreground" };

function Ramo({ rotulo, tom = "neutro", caminho }: { rotulo: string; tom?: keyof typeof PONTO; caminho: Caminho }) {
  const t = useTela();
  return (
    <div className="min-w-[330px] flex-[1_0_auto] rounded-lg border border-dashed border-border bg-muted/40 px-3.5 pb-2 pt-3" data-ramo={rotulo}>
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-titulo">
        <span className={cn("h-2.5 w-2.5 rounded-full", PONTO[tom])} />{rotulo}
      </h4>
      <ListaDePassos caminho={caminho} itens={lerLista(t.fluxo, caminho)} />
    </div>
  );
}

function MenuDoCartao({ id }: { id: string }) {
  const t = useTela();
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);
  const item = (acao: AcaoDoCartao, Icone: typeof Copy, texto: string, perigo?: boolean) => (
    <button type="button" role="menuitem" onClick={() => { setAberto(false); t.agir(id, acao); }}
      className={cn("flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted", perigo && "text-destructive")}>
      <Icone className="h-4 w-4" /> {texto}
    </button>
  );
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label="Mais ações do passo" aria-haspopup="menu" onClick={() => setAberto(!aberto)}
        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-border bg-card p-1 shadow-lg">
          {item("duplicar", Copy, "Duplicar")}
          {item("subir", MoveUp, "Subir")}
          {item("descer", MoveDown, "Descer")}
          {item("apagar", Trash2, "Apagar", true)}
        </div>
      )}
    </div>
  );
}
