"use client";

import Link from "next/link";
import { useState } from "react";
import { History, Pencil, Play } from "lucide-react";

import { ExecutarFluxo } from "@/components/fluxos/executar-fluxo";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingState } from "@/components/shared/loading-state";
import { PageTitle } from "@/components/shared/page-title";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { SITUACAO, TERMINAIS, duracao, type ExecucaoResumo } from "@/lib/fluxos/execucao";
import type { FluxoDetalhe } from "@/lib/fluxos/tipos";
import { podeGerenciar } from "@/lib/permissions";
import { haQuanto } from "@/lib/tempo";
import { cn } from "@/lib/utils";

const ORIGEM: Record<string, string> = { manual: "à mão", subfluxo: "chamado por outro fluxo", agenda: "pela agenda" };

/** Histórico de execuções de um fluxo (Fase 7): situação, versão, quem, quando e quanto durou. */
export function ExecucoesDoFluxo({ id }: { id: string }) {
  const { user } = useAuth();
  const fluxo = useApi<FluxoDetalhe>(`/fluxos/${id}`);
  const lista = useApi<{ execucoes: ExecucaoResumo[] }>(`/fluxos/${id}/execucoes`, { pollMs: 5000 });
  const [executando, setExecutando] = useState(false);
  const gerencia = podeGerenciar(user, "fluxos");
  const f = fluxo.data;

  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Fluxos" title={f ? `Execuções de ${f.nome}` : "Execuções"}
        description="Cada execução roda a versão publicada no momento em que começou."
        actions={<>
          <Button variant="outline" asChild><Link href={`/flows/${id}`}><Pencil className="h-4 w-4" /> Abrir o editor</Link></Button>
          {gerencia && f?.versao_publicada && f.situacao === "ativo" && <Button onClick={() => setExecutando(true)}><Play className="h-4 w-4" /> Executar</Button>}
        </>} />
      {lista.loading && !lista.data ? <LoadingState label="Carregando execuções..." />
        : lista.error ? <ErrorState message={lista.error} onRetry={lista.refetch} />
        : !lista.data?.execucoes.length ? (
          <EmptyState icon={History} title="Nenhuma execução ainda"
            description={f?.versao_publicada ? "Execute o fluxo para ver aqui o andamento e o resultado." : "Publique uma versão no editor e depois execute."} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm" data-testid="execucoes-do-fluxo">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3">Situação</th><th className="px-4 py-3">Começou</th><th className="px-4 py-3">Duração</th>
                  <th className="px-4 py-3">Versão</th><th className="px-4 py-3">Quem</th><th className="px-4 py-3">Resultado</th></tr>
              </thead>
              <tbody>
                {lista.data.execucoes.map((e) => {
                  const s = SITUACAO[e.situacao] ?? { rotulo: e.situacao, cor: "" };
                  return (
                    <tr key={e.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link href={`/flows/execucoes/${e.id}`} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", s.cor)}>
                          {!TERMINAIS.has(e.situacao) && e.situacao !== "pausada" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
                          {s.rotulo}
                        </Link>
                      </td>
                      <td className="px-4 py-3"><Link href={`/flows/execucoes/${e.id}`} className="hover:text-primary hover:underline">{haQuanto(e.criado_em)}</Link></td>
                      <td className="px-4 py-3 tabular-nums">{duracao(e.criado_em, e.terminado_em)}</td>
                      <td className="px-4 py-3">{e.versao}</td>
                      <td className="px-4 py-3">{e.disparado_por_nome ?? "—"} <span className="text-muted-foreground">· {ORIGEM[e.origem] ?? e.origem}</span></td>
                      <td className="max-w-[24rem] truncate px-4 py-3 text-muted-foreground">{e.situacao === "falhou" ? e.motivo : e.situacao === "concluida" ? "Concluída" : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      {f && gerencia && <ExecutarFluxo fluxo={f} aberto={executando} fechar={() => setExecutando(false)} />}
    </div>
  );
}
