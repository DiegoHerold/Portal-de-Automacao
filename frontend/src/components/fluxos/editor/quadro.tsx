"use client";

import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type PointerEvent as EventoDePonteiro, type ReactNode,
} from "react";
import { Hand, MousePointer2, Scan, ZoomIn, ZoomOut } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * Quadro dos fluxos: a área infinita onde ficam os cartões (editor e tela ao vivo).
 *
 * - Ctrl/⌘ + rolar (ou pinça no touchpad): zoom no ponto do mouse. Rolar: anda na tela (Shift: para os lados).
 * - Ferramentas: Seleção (V) clica e arrasta cartões; Mão (H) só move a tela. Espaço segurado ou o botão do meio
 *   viram a mão na hora. Na Seleção, arrastar o fundo também move a tela.
 * - Ctrl + 0: 100%; Ctrl + "+"/"−": zoom; Shift + 1: ajustar à tela.
 */

export type Ferramenta = "selecionar" | "mao";
export type QuadroApi = { focar: (id: string) => void; ajustar: () => void };
type Vista = { x: number; y: number; z: number };

const MIN = 0.25;
const MAX = 2;
const MARGEM = 32;
const limitar = (z: number) => Math.min(MAX, Math.max(MIN, z));

function digitando(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  return Boolean(el?.closest?.("input, textarea, select, [contenteditable=true]"));
}

export const Quadro = forwardRef<QuadroApi, { children: ReactNode; aoClicarNoFundo?: () => void; className?: string }>(function Quadro(
  { children, aoClicarNoFundo, className }, ref,
) {
  const janela = useRef<HTMLDivElement>(null);
  const conteudo = useRef<HTMLDivElement>(null);
  const [vista, setVista] = useState<Vista>({ x: MARGEM, y: MARGEM, z: 1 });
  const [suave, setSuave] = useState(false);
  const [ferramenta, setFerramenta] = useState<Ferramenta>("selecionar");
  const [espaco, setEspaco] = useState(false);
  const [movendo, setMovendo] = useState(false);
  const arrasto = useRef<{ x: number; y: number; vx: number; vy: number; andou: boolean; fundo: boolean } | null>(null);
  const vistaAtual = useRef(vista);
  vistaAtual.current = vista;
  const mao = ferramenta === "mao" || espaco;

  const mudar = useCallback((nova: Vista, animar = false) => {
    setSuave(animar);
    setVista(nova);
  }, []);

  const zoomEm = useCallback((cx: number, cy: number, z: number, animar = false) => {
    const v = vistaAtual.current;
    const novo = limitar(z);
    mudar({ z: novo, x: cx - ((cx - v.x) * novo) / v.z, y: cy - ((cy - v.y) * novo) / v.z }, animar);
  }, [mudar]);

  const zoomNoCentro = useCallback((fator: number | "100") => {
    const r = janela.current?.getBoundingClientRect();
    if (!r) return;
    zoomEm(r.width / 2, r.height / 2, fator === "100" ? 1 : vistaAtual.current.z * fator, true);
  }, [zoomEm]);

  const ajustar = useCallback(() => {
    const j = janela.current, c = conteudo.current;
    if (!j || !c) return;
    const z = limitar(Math.min(1, (j.clientWidth - MARGEM * 2) / c.offsetWidth, (j.clientHeight - MARGEM * 2) / c.offsetHeight));
    mudar({ z, x: Math.max(MARGEM, (j.clientWidth - c.offsetWidth * z) / 2), y: MARGEM }, true);
  }, [mudar]);

  const trazer = useCallback((alvo: Element | null | undefined) => {
    const j = janela.current;
    if (!j || !alvo) return;
    const jr = j.getBoundingClientRect();
    const r = alvo.getBoundingClientRect();
    const v = vistaAtual.current;
    let { x, y } = v;
    const largura = Math.min(r.width, jr.width - MARGEM * 2);
    if (r.left < jr.left + MARGEM) x += jr.left + MARGEM - r.left;
    else if (r.left + largura > jr.right - MARGEM) x -= r.left + largura - (jr.right - MARGEM);
    if (r.top < jr.top + MARGEM) y += jr.top + MARGEM - r.top;
    else if (r.bottom > jr.bottom - MARGEM) y -= Math.min(r.bottom - (jr.bottom - MARGEM), r.top - (jr.top + MARGEM));
    if (x !== v.x || y !== v.y) mudar({ ...v, x, y }, true);
  }, [mudar]);

  const focar = useCallback((id: string) => trazer(conteudo.current?.querySelector(`[data-cartao="${CSS.escape(id)}"]`)), [trazer]);

  useImperativeHandle(ref, () => ({ focar, ajustar }), [focar, ajustar]);

  // Primeira vista: o fluxo centralizado na largura, a partir do topo.
  useLayoutEffect(() => {
    const j = janela.current, c = conteudo.current;
    if (j && c) setVista({ z: 1, x: Math.max(MARGEM, (j.clientWidth - c.offsetWidth) / 2), y: MARGEM });
  }, []);

  // Rolar e zoom: o ouvinte precisa ser "não passivo" para segurar o zoom da página.
  useEffect(() => {
    const j = janela.current;
    if (!j) return;
    const rolar = (e: WheelEvent) => {
      if (digitando(e.target) || (e.target as HTMLElement).closest("[role=menu]")) return;
      e.preventDefault();
      const r = j.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomEm(e.clientX - r.left, e.clientY - r.top, vistaAtual.current.z * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)));
        return;
      }
      const passo = e.deltaMode === 1 ? 32 : 1;
      const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * passo;
      const dy = (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * passo;
      const v = vistaAtual.current;
      mudar({ ...v, x: v.x - dx, y: v.y - dy });
    };
    j.addEventListener("wheel", rolar, { passive: false });
    return () => j.removeEventListener("wheel", rolar);
  }, [zoomEm, mudar]);

  // Atalhos de teclado (fora de campos e de janelas abertas).
  useEffect(() => {
    const aberta = () => Boolean(document.querySelector("[role=dialog]"));
    const desce = (e: KeyboardEvent) => {
      if (digitando(e.target) || aberta()) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === "Space" && !e.repeat && !(e.target as HTMLElement).closest?.("button, a, [role=menuitem]")) {
        e.preventDefault();
        setEspaco(true);
      } else if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoomNoCentro(1.2); }
      else if (mod && e.key === "-") { e.preventDefault(); zoomNoCentro(1 / 1.2); }
      else if (mod && e.key === "0") { e.preventDefault(); zoomNoCentro("100"); }
      else if (!mod && e.shiftKey && e.code === "Digit1") { e.preventDefault(); ajustar(); }
      else if (!mod && !e.altKey && e.key.toLowerCase() === "v") setFerramenta("selecionar");
      else if (!mod && !e.altKey && e.key.toLowerCase() === "h") setFerramenta("mao");
    };
    const sobe = (e: KeyboardEvent) => { if (e.code === "Space") setEspaco(false); };
    const solta = () => setEspaco(false);
    document.addEventListener("keydown", desce);
    document.addEventListener("keyup", sobe);
    window.addEventListener("blur", solta);
    return () => {
      document.removeEventListener("keydown", desce);
      document.removeEventListener("keyup", sobe);
      window.removeEventListener("blur", solta);
    };
  }, [zoomNoCentro, ajustar]);

  // Arrastar a tela: mão, espaço, botão do meio ou o fundo (na Seleção).
  const noFundo = (alvo: EventTarget) => !(alvo as HTMLElement).closest("[data-cartao], button, a, input, select, textarea, [role=menu], [role=toolbar]");
  const apertar = (e: EventoDePonteiro<HTMLDivElement>) => {
    const fundo = noFundo(e.target);
    if (!(mao || e.button === 1 || (e.button === 0 && fundo))) return;
    if (e.button === 1) e.preventDefault();
    arrasto.current = { x: e.clientX, y: e.clientY, vx: vistaAtual.current.x, vy: vistaAtual.current.y, andou: false, fundo };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const mover = (e: EventoDePonteiro<HTMLDivElement>) => {
    const a = arrasto.current;
    if (!a) return;
    const dx = e.clientX - a.x, dy = e.clientY - a.y;
    if (!a.andou && Math.hypot(dx, dy) < 4) return;
    if (!a.andou) { a.andou = true; setMovendo(true); }
    mudar({ ...vistaAtual.current, x: a.vx + dx, y: a.vy + dy });
  };
  const soltar = (e: EventoDePonteiro<HTMLDivElement>) => {
    const a = arrasto.current;
    arrasto.current = null;
    setMovendo(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (a && !a.andou && a.fundo && !mao) aoClicarNoFundo?.();
  };

  const z = vista.z;
  return (
    <div ref={janela} className={cn("relative h-full min-h-0 select-none overflow-hidden bg-muted/40 outline-none", className,
      mao ? (movendo ? "cursor-grabbing" : "cursor-grab") : movendo && "cursor-grabbing")}
      style={{ backgroundImage: "radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)",
               backgroundSize: `${22 * z}px ${22 * z}px`, backgroundPosition: `${vista.x}px ${vista.y}px` }}
      onPointerDown={apertar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar} onAuxClick={(e) => e.button === 1 && e.preventDefault()}
      onFocus={(e) => { if (e.target.matches(":focus-visible")) trazer(e.target.closest("[data-cartao]") ?? e.target); }}
      onScroll={(e) => {
        // O navegador pode rolar a área (foco, busca na página): vira deslocamento do quadro.
        const el = e.currentTarget;
        if (!el.scrollLeft && !el.scrollTop) return;
        const v = vistaAtual.current;
        mudar({ ...v, x: v.x - el.scrollLeft, y: v.y - el.scrollTop });
        el.scrollLeft = 0;
        el.scrollTop = 0;
      }}
      data-testid="quadro" data-ferramenta={mao ? "mao" : "selecionar"} data-zoom={Math.round(z * 100)}>
      <div ref={conteudo} className={cn("absolute left-0 top-0 origin-top-left pb-24", suave && "transition-transform duration-200 ease-out motion-reduce:transition-none",
        mao && "pointer-events-none")}
        style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${z})` }} onTransitionEnd={() => setSuave(false)}>
        {children}
      </div>
      <BarraDoQuadro ferramenta={ferramenta} setFerramenta={setFerramenta} zoom={z} zoomNoCentro={zoomNoCentro} ajustar={ajustar} />
    </div>
  );
});

function BarraDoQuadro({ ferramenta, setFerramenta, zoom, zoomNoCentro, ajustar }: {
  ferramenta: Ferramenta; setFerramenta: (f: Ferramenta) => void; zoom: number; zoomNoCentro: (f: number | "100") => void; ajustar: () => void;
}) {
  const botao = "grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-20 flex cursor-default items-center gap-1 rounded-xl border border-border bg-card/95 p-1 shadow-lg backdrop-blur"
      role="toolbar" aria-label="Ferramentas do quadro" onPointerDown={(e) => e.stopPropagation()}>
      {([["selecionar", MousePointer2, "Seleção (V)"], ["mao", Hand, "Mão: mover a tela (H, ou segure Espaço)"]] as const).map(([f, Icone, titulo]) => (
        <button key={f} type="button" aria-pressed={ferramenta === f} aria-label={titulo} title={titulo} onClick={() => setFerramenta(f)}
          className={cn(botao, ferramenta === f && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground")}>
          <Icone className="h-4 w-4" />
        </button>
      ))}
      <span className="mx-1 h-6 w-px bg-border" aria-hidden />
      <button type="button" className={botao} aria-label="Diminuir o zoom (Ctrl −)" title="Diminuir o zoom (Ctrl −)" onClick={() => zoomNoCentro(1 / 1.2)}><ZoomOut className="h-4 w-4" /></button>
      <button type="button" className="h-9 w-14 rounded-md text-xs font-semibold tabular-nums text-foreground hover:bg-muted" title="Voltar a 100% (Ctrl 0)"
        aria-label="Voltar a 100%" onClick={() => zoomNoCentro("100")} data-testid="zoom">{Math.round(zoom * 100)}%</button>
      <button type="button" className={botao} aria-label="Aumentar o zoom (Ctrl +)" title="Aumentar o zoom (Ctrl +)" onClick={() => zoomNoCentro(1.2)}><ZoomIn className="h-4 w-4" /></button>
      <button type="button" className={botao} aria-label="Ajustar à tela (Shift 1)" title="Ajustar à tela (Shift 1)" onClick={ajustar}><Scan className="h-4 w-4" /></button>
      <span className="ml-1 hidden pr-2 text-[11px] leading-tight text-muted-foreground 2xl:block">Ctrl + rolar: zoom<br />Espaço + arrastar: mover</span>
    </div>
  );
}
