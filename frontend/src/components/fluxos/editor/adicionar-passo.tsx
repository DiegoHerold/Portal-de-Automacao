"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { GRUPOS, PASSOS, type Grupo, type Passo } from "@/lib/fluxos/catalogo";
import { cn } from "@/lib/utils";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "Adicionar um passo": busca, abas por grupo e um cartão por ação, com a frase do que ela faz. */
export function AdicionarPasso({ aberto, fechar, escolher, foraDeLaco }: {
  aberto: boolean; fechar: () => void; escolher: (p: Passo) => void; foraDeLaco: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState<Grupo | "Todos">("Todos");
  const termo = semAcento(busca.trim());
  const lista = PASSOS.filter((p) => (grupo === "Todos" || p.grupo === grupo)
    && (!termo || semAcento(`${p.nome} ${p.frase} ${p.grupo}`).includes(termo))
    && !(foraDeLaco && (p.tipo === "parar_laco" || p.tipo === "proximo")));
  return (
    <Modal open={aberto} onClose={fechar} title="Adicionar um passo" className="max-w-3xl">
      <div className="space-y-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar ação: automação, repetir, perguntar…"
            className="h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onKeyDown={(e) => { if (e.key === "Enter" && lista.length === 1) escolher(lista[0]); }} aria-label="Buscar ação" />
        </label>
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {(["Todos", ...GRUPOS] as const).map((g) => (
            <button key={g} type="button" role="tab" aria-selected={grupo === g} onClick={() => setGrupo(g)}
              className={cn("rounded-full border px-3 py-1.5 text-sm transition-colors",
                grupo === g ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted")}>
              {g}
            </button>
          ))}
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {lista.map((p) => (
            <button key={p.tipo} type="button" onClick={() => escolher(p)} data-passo={p.tipo}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-primary/5">
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", p.cor)}><p.icone className="h-[18px] w-[18px]" /></span>
              <span>
                <span className="block text-sm font-semibold text-titulo">{p.nome}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{p.frase}</span>
              </span>
            </button>
          ))}
          {lista.length === 0 && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">Nenhuma ação com esse nome.</p>}
        </div>
      </div>
    </Modal>
  );
}
