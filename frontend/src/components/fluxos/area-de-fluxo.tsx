"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

import { cn } from "@/lib/utils";

const CHAVE = "portal.fluxos.tela_cheia";

/**
 * Tela cheia dos fluxos (esconde menu e topo do Portal). Lembrada por pessoa, neste navegador.
 * ``comEsc``: Esc sai da tela cheia (o editor trata o Esc ele mesmo: primeiro tira a seleção).
 */
export function useTelaCheia(comEsc = true) {
  const [cheia, setCheia] = useState(false);
  useEffect(() => {
    try { setCheia(window.localStorage.getItem(CHAVE) === "1"); } catch { /* sem armazenamento: começa normal */ }
  }, []);
  const mudar = useCallback((valor: boolean) => {
    setCheia(valor);
    try { window.localStorage.setItem(CHAVE, valor ? "1" : "0"); } catch { /* sem armazenamento */ }
  }, []);
  useEffect(() => {
    if (!comEsc || !cheia) return;
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (e.key === "Escape" && !alvo.closest?.("input, textarea, select") && !document.querySelector("[role=dialog], [role=menu]")) mudar(false);
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [comEsc, cheia, mudar]);
  return useMemo(() => ({ cheia, mudar }), [cheia, mudar]);
}

/** A moldura das telas de quadro: ocupa toda a área do Portal, ou a janela inteira em tela cheia. */
export function AreaDeFluxo({ cheia, children, testId }: { cheia: boolean; children: ReactNode; testId?: string }) {
  return (
    <div className={cn("flex flex-col bg-background", cheia ? "fixed inset-0 z-[60]" : "h-[calc(100dvh-4rem)] min-h-[520px]")}
      data-testid={testId} data-tela-cheia={cheia || undefined}>
      {children}
    </div>
  );
}

export function BotaoTelaCheia({ cheia, mudar }: { cheia: boolean; mudar: (v: boolean) => void }) {
  const titulo = cheia ? "Sair da tela cheia (Esc)" : "Tela cheia";
  return (
    <button type="button" onClick={() => mudar(!cheia)} aria-label={titulo} title={titulo} aria-pressed={cheia}
      className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
      {cheia ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
    </button>
  );
}

/** Separador fininho entre grupos de ações do topo. */
export function Divisor() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />;
}
