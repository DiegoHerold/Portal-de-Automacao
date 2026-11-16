"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArchiveRestore, Blocks, History, Play, Plus, Search } from "lucide-react";

import { ExecutarFluxo } from "@/components/fluxos/executar-fluxo";

import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingState } from "@/components/shared/loading-state";
import { PageTitle } from "@/components/shared/page-title";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import type { FluxoDetalhe, FluxoResumo } from "@/lib/fluxos/tipos";
import { podeGerenciar } from "@/lib/permissions";
import { haQuanto } from "@/lib/tempo";
import { cn } from "@/lib/utils";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Lista de fluxos: buscar, criar, abrir o editor, arquivar e reativar. */
export function ListaDeFluxos() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const gerencia = podeGerenciar(user, "fluxos");
  const [arquivados, setArquivados] = useState(false);
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);
  const [executar, setExecutar] = useState<FluxoResumo | null>(null);
  const lista = useApi<{ fluxos: FluxoResumo[] }>(`/fluxos${arquivados ? "?arquivados=true" : ""}`);
  const termo = semAcento(busca.trim());
  const fluxos = (lista.data?.fluxos ?? []).filter((f) => !termo || semAcento(`${f.nome} ${f.descricao ?? ""}`).includes(termo));

  const mudarSituacao = async (f: FluxoResumo, situacao: "ativo" | "arquivado") => {
    try {
      await apiRequest(`/fluxos/${f.id}`, { token, method: "PUT", body: JSON.stringify({ situacao }) });
      toast({ title: situacao === "arquivado" ? `“${f.nome}” arquivado` : `“${f.nome}” reativado`, kind: "success" });
      await lista.refetch();
    } catch (err) {
      toast({ title: "Não foi possível mudar", description: err instanceof Error ? err.message : undefined, kind: "error" });
    }
  };

  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Operação" title="Fluxos"
        description="Programas em passos que encadeiam automações, repetem processos, perguntam a pessoas e decidem por condições."
        actions={gerencia ? <Button onClick={() => setCriando(true)}><Plus className="h-4 w-4" /> Novo fluxo</Button> : undefined} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar fluxo" className="pl-9" aria-label="Buscar fluxo" />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={arquivados} onChange={(e) => setArquivados(e.target.checked)} />
          Mostrar arquivados
        </label>
      </div>
      {lista.loading && !lista.data ? <LoadingState label="Carregando fluxos..." />
        : lista.error ? <ErrorState message={lista.error} onRetry={lista.refetch} />
        : fluxos.length === 0 ? (
          <EmptyState icon={Blocks} title={termo ? "Nenhum fluxo com esse nome" : "Nenhum fluxo ainda"}
            description={termo ? "Tente outro termo." : "Um fluxo junta automações em passos: rodar, repetir, perguntar a uma pessoa e decidir pelo resultado."}
            action={gerencia && !termo ? <Button onClick={() => setCriando(true)}><Plus className="h-4 w-4" /> Criar o primeiro fluxo</Button> : undefined} />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2" data-testid="lista-de-fluxos">
            {fluxos.map((f) => (
              <li key={f.id} className={cn("flex items-start gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40", f.situacao === "arquivado" && "opacity-70")}>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Blocks className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <Link href={`/flows/${f.id}`} className="text-lg font-semibold text-titulo hover:text-primary hover:underline">{f.nome}</Link>
                  {f.descricao && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{f.descricao}</p>}
                  <p className="mt-2 text-sm text-muted-foreground">
                    {f.situacao === "arquivado" ? "Arquivado"
                      : f.versao_publicada ? <>Versão {f.versao_publicada} publicada {haQuanto(f.publicada_em)}{f.rascunho_mudou && " · rascunho com mudanças"}</>
                      : "Rascunho, nunca publicado"}
                    {" · "}editado {haQuanto(f.rascunho_atualizado_em)}
                  </p>
                </div>
                <Button size="icon" variant="ghost" aria-label="Execuções" title="Execuções" asChild>
                  <Link href={`/flows/${f.id}/execucoes`}><History className="h-4 w-4" /></Link>
                </Button>
                {gerencia && f.situacao === "ativo" && f.versao_publicada && (
                  <Button size="icon" variant="ghost" aria-label={`Executar ${f.nome}`} title="Executar" onClick={() => setExecutar(f)}>
                    <Play className="h-4 w-4" />
                  </Button>
                )}
                {gerencia && (
                  <Button size="icon" variant="ghost" aria-label={f.situacao === "arquivado" ? "Reativar" : "Arquivar"} title={f.situacao === "arquivado" ? "Reativar" : "Arquivar"}
                    onClick={() => mudarSituacao(f, f.situacao === "arquivado" ? "ativo" : "arquivado")}>
                    {f.situacao === "arquivado" ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      <NovoFluxo aberto={criando} fechar={() => setCriando(false)} />
      {executar && <ExecutarFluxo fluxo={executar} aberto fechar={() => setExecutar(null)} />}
    </div>
  );
}

function NovoFluxo({ aberto, fechar }: { aberto: boolean; fechar: () => void }) {
  const { token } = useAuth();
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const criar = async () => {
    setOcupado(true);
    setFalha(null);
    try {
      const f = await apiRequest<FluxoDetalhe>("/fluxos", { token, method: "POST", body: JSON.stringify({ nome: nome.trim(), descricao: descricao.trim() || null }) });
      router.push(`/flows/${f.id}`);
    } catch (err) {
      setFalha(err instanceof Error ? err.message : "Não foi possível criar.");
      setOcupado(false);
    }
  };
  return (
    <Modal open={aberto} onClose={fechar} title="Novo fluxo" description="Dê um nome. Os passos você monta no editor em seguida."
      footer={<><Button variant="ghost" onClick={fechar}>Cancelar</Button><Button onClick={criar} disabled={!nome.trim() || ocupado}>{ocupado ? "Criando…" : "Criar e abrir"}</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (nome.trim()) void criar(); }}>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-titulo" htmlFor="nome-do-fluxo">Nome</label>
          <Input id="nome-do-fluxo" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Integração Contábil da Planet em 5 máquinas" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-titulo" htmlFor="descricao-do-fluxo">Descrição (opcional)</label>
          <Textarea id="descricao-do-fluxo" rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        {falha && <p className="text-sm text-destructive" role="alert">{falha}</p>}
      </form>
    </Modal>
  );
}
