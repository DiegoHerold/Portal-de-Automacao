"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import { nomeDoTipo, type Entrada, type Fluxo } from "@/lib/fluxos/tipos";

/*
 * Executar à mão (Fase 7): o formulário sai das entradas da **versão publicada** (é ela que roda).
 * Listas: um valor por linha. Depois de executar, abre a tela ao vivo.
 */

type Valor = string | boolean;

function converter(e: Entrada, bruto: Valor | undefined): unknown {
  if (bruto === undefined || bruto === "") return undefined;
  if (typeof e.tipo === "object") {
    const linhas = String(bruto).split("\n").map((l) => l.trim()).filter(Boolean);
    return e.tipo.lista === "numero" ? linhas.map((l) => Number(l.replace(",", "."))) : linhas;
  }
  if (e.tipo === "numero") return Number(String(bruto).replace(",", "."));
  if (e.tipo === "booleano") return bruto === true || bruto === "sim";
  if (e.tipo === "objeto") {
    try { return JSON.parse(String(bruto)); } catch { return String(bruto); }
  }
  return String(bruto);
}

export function ExecutarFluxo({ fluxo, aberto, fechar }: { fluxo: { id: string; nome: string; versao_publicada: number | null }; aberto: boolean; fechar: () => void }) {
  const { token } = useAuth();
  const router = useRouter();
  const versao = useApi<{ numero: number; ast: Fluxo }>(aberto && fluxo.versao_publicada ? `/fluxos/${fluxo.id}/versoes/${fluxo.versao_publicada}` : null);
  const entradas = versao.data?.ast.entradas ?? [];
  const [valores, setValores] = useState<Record<string, Valor>>({});
  const [ocupado, setOcupado] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const faltando = entradas.filter((e) => e.obrigatoria && e.tipo !== "booleano" && !String(valores[e.nome] ?? "").trim());

  const executar = async () => {
    setOcupado(true);
    setFalha(null);
    const corpo: Record<string, unknown> = {};
    for (const e of entradas) {
      const v = converter(e, e.tipo === "booleano" ? Boolean(valores[e.nome]) : valores[e.nome]);
      if (v !== undefined) corpo[e.nome] = v;
    }
    try {
      const r = await apiRequest<{ id: string }>(`/fluxos/${fluxo.id}/executar`, { token, method: "POST", body: JSON.stringify({ entradas: corpo }) });
      router.push(`/flows/execucoes/${r.id}`);
    } catch (err) {
      setFalha(err instanceof Error ? err.message : "Não foi possível executar.");
      setOcupado(false);
    }
  };

  return (
    <Modal open={aberto} onClose={fechar} title={`Executar ${fluxo.nome}`}
      description={fluxo.versao_publicada ? `Roda a versão ${fluxo.versao_publicada} (a publicada), com as permissões de quem executa.` : undefined}
      footer={<><Button variant="ghost" onClick={fechar}>Cancelar</Button>
        <Button onClick={executar} disabled={ocupado || !versao.data || faltando.length > 0}>{ocupado ? "Executando…" : "Executar agora"}</Button></>}>
      {!fluxo.versao_publicada ? <p className="text-sm text-muted-foreground">Publique uma versão antes de executar.</p>
        : versao.loading && !versao.data ? <p className="text-sm text-muted-foreground">Lendo as entradas…</p>
        : versao.error ? <p className="text-sm text-destructive">{versao.error}</p>
        : (
          <form className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); if (!faltando.length) void executar(); }} data-testid="entradas-do-fluxo">
            {entradas.length === 0 && <p className="text-sm text-muted-foreground">Este fluxo não pede entradas.</p>}
            {entradas.map((e) => {
              const id = `entrada-${e.nome}`;
              const rotulo = `${e.rotulo || e.nome}${e.obrigatoria && e.tipo !== "booleano" ? " *" : ""}`;
              const mudar = (v: Valor) => setValores((x) => ({ ...x, [e.nome]: v }));
              const lista = typeof e.tipo === "object";
              return (
                <div key={e.nome} className="space-y-1.5">
                  {e.tipo === "booleano" ? (
                    <label className="flex items-center gap-2 text-sm font-semibold text-titulo">
                      <input id={id} type="checkbox" className="h-4 w-4 accent-primary" checked={Boolean(valores[e.nome])} onChange={(ev) => mudar(ev.target.checked)} />
                      {e.rotulo || e.nome}
                    </label>
                  ) : (
                    <>
                      <label htmlFor={id} className="text-sm font-semibold text-titulo">{rotulo}</label>
                      {lista ? <Textarea id={id} rows={4} value={String(valores[e.nome] ?? "")} onChange={(ev) => mudar(ev.target.value)} placeholder="Um por linha" />
                        : e.tipo === "objeto" ? <Textarea id={id} rows={3} value={String(valores[e.nome] ?? "")} onChange={(ev) => mudar(ev.target.value)} placeholder='{"campo": "valor"}' />
                        : e.tipo === "qualquer" ? <Input id={id} value={String(valores[e.nome] ?? "")} onChange={(ev) => mudar(ev.target.value)} />
                        : <Input id={id} type={e.tipo === "numero" ? "number" : e.tipo === "data" ? "date" : "text"} value={String(valores[e.nome] ?? "")}
                            onChange={(ev) => mudar(ev.target.value)} />}
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">{e.descricao || nomeDoTipo(e.tipo)}</p>
                </div>
              );
            })}
            {falha && <p className="text-sm text-destructive" role="alert">{falha}</p>}
          </form>
        )}
    </Modal>
  );
}

