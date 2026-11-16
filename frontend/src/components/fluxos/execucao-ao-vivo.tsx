"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Ban, Clock, GitFork, MessageCircleQuestion, Pause, Pencil, Play, SquareStack } from "lucide-react";

import { AreaDeFluxo, BotaoTelaCheia, Divisor, useTelaCheia } from "@/components/fluxos/area-de-fluxo";
import { TelaDoFluxo } from "@/components/fluxos/editor/cartoes";
import { Quadro, type QuadroApi } from "@/components/fluxos/editor/quadro";
import type { Nomes } from "@/components/fluxos/frases";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingState } from "@/components/shared/loading-state";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import {
  SITUACAO, TERMINAIS, duracao, marcasDaExecucao, textoDoValor, type Agora, type ExecucaoDetalhe, type PassoDaLinha,
} from "@/lib/fluxos/execucao";
import type { Fluxo } from "@/lib/fluxos/tipos";
import { podeGerenciar } from "@/lib/permissions";
import { haQuanto } from "@/lib/tempo";
import type { Automation } from "@/types/automation";
import { cn } from "@/lib/utils";

/*
 * Tela ao vivo de uma execução de fluxo (Fase 7): os cartões da versão que roda, com o passo atual
 * destacado e por onde já passou; ao lado, o que a execução espera agora (automações e partes com a
 * máquina de cada uma, a pergunta aberta, o fluxo chamado), variáveis, entradas e a linha do tempo.
 * Atualiza a cada 2 s enquanto não termina (a fonte é o Portal; o intervalo é só transporte).
 */

const ATUALIZAR_A_CADA = 2000;

export function ExecucaoAoVivo({ id }: { id: string }) {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [terminou, setTerminou] = useState(false);
  const detalhe = useApi<ExecucaoDetalhe>(`/fluxos/execucoes/${id}`, { pollMs: terminou ? undefined : ATUALIZAR_A_CADA });
  const e = detalhe.data;
  if (e && TERMINAIS.has(e.situacao) !== terminou) setTerminou(TERMINAIS.has(e.situacao));
  const versao = useApi<{ ast: Fluxo }>(e ? `/fluxos/${e.fluxo_id}/versoes/${e.versao}` : null);
  const automacoes = useApi<Automation[]>("/automations");
  const [filtro, setFiltro] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const telaCheia = useTelaCheia();
  const quadro = useRef<QuadroApi>(null);
  // O passo atual vem para a vista quando a tela abre e a cada vez que a execução anda para outro passo.
  const blocoAtual = e && !TERMINAIS.has(e.situacao) ? e.bloco_atual : null;
  const temVersao = Boolean(versao.data);
  useEffect(() => {
    if (!blocoAtual || !temVersao) return;
    const quadroAnimado = requestAnimationFrame(() => quadro.current?.focar(blocoAtual));
    return () => cancelAnimationFrame(quadroAnimado);
  }, [blocoAtual, temVersao]);
  const gerencia = podeGerenciar(user, "fluxos");

  const nomes: Nomes = useMemo(() => ({
    automacoes: Object.fromEntries((automacoes.data ?? []).filter((a) => a.key).map((a) => [a.key as string, a.name])),
    fluxos: Object.fromEntries((e?.filhas ?? []).map((f) => [f.fluxo_id, f.fluxo_nome])), times: {},
  }), [automacoes.data, e?.filhas]);
  const marcas = useMemo(() => (e ? marcasDaExecucao(e) : new Map()), [e]);

  if (detalhe.loading && !e) return <div className="p-8"><LoadingState label="Abrindo a execução..." /></div>;
  if (detalhe.error && !e) return <div className="p-8"><ErrorState message={detalhe.error} onRetry={detalhe.refetch} /></div>;
  if (!e) return null;

  const agir = async (acao: "pausar" | "continuar" | "cancelar") => {
    try {
      const novo = await apiRequest<ExecucaoDetalhe>(`/fluxos/execucoes/${e.id}/${acao}`, { token, method: "POST" });
      detalhe.mutate(novo);
      toast({ title: { pausar: "Execução pausada", continuar: "Execução continuando", cancelar: "Execução cancelada" }[acao], kind: "success" });
    } catch (err) {
      toast({ title: "Não foi possível", description: err instanceof Error ? err.message : undefined, kind: "error" });
    }
  };
  const situacao = SITUACAO[e.situacao] ?? { rotulo: e.situacao, cor: "" };
  const passos = filtro ? e.passos.filter((p) => p.bloco === filtro) : e.passos;

  return (
    <AreaDeFluxo cheia={telaCheia.cheia} testId="execucao-ao-vivo">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-2 sm:px-3">
        <Link href={`/flows/${e.fluxo_id}/execucoes`} aria-label="Voltar para as execuções" title="Voltar para as execuções"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="truncate px-1 text-base font-semibold text-titulo">{e.fluxo_nome}</h1>
        <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold", situacao.cor)} data-testid="situacao-da-execucao">
          {!TERMINAIS.has(e.situacao) && e.situacao !== "pausada" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
          {situacao.rotulo}
        </span>
        <span className="hidden truncate text-xs text-muted-foreground lg:inline">
          Versão {e.versao} · {e.disparado_por_nome ? `por ${e.disparado_por_nome} · ` : ""}começou {haQuanto(e.criado_em)} · {duracao(e.criado_em, e.terminado_em)}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {gerencia && (e.situacao === "rodando" || e.situacao === "esperando") && (
            <Button size="sm" variant="outline" className="h-8" onClick={() => agir("pausar")}><Pause className="h-4 w-4" /> Pausar</Button>
          )}
          {gerencia && e.situacao === "pausada" && <Button size="sm" variant="outline" className="h-8" onClick={() => agir("continuar")}><Play className="h-4 w-4" /> Continuar</Button>}
          {gerencia && !TERMINAIS.has(e.situacao) && (
            <Button size="sm" variant="destructive" className="h-8" onClick={() => setCancelando(true)}><Ban className="h-4 w-4" /> Cancelar</Button>
          )}
          <Divisor />
          <Link href={`/flows/${e.fluxo_id}`} aria-label="Abrir o fluxo no editor" title="Abrir o fluxo no editor"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            <Pencil className="h-4 w-4" /> <span className="hidden xl:inline">Abrir o fluxo</span>
          </Link>
          <BotaoTelaCheia cheia={telaCheia.cheia} mudar={telaCheia.mudar} />
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        <section className="relative min-h-0">
          {versao.data ? (
            <Quadro ref={quadro} aoClicarNoFundo={() => setFiltro(null)}>
              <TelaDoFluxo fluxo={versao.data.ast} selecionado={filtro} nomes={nomes} erros={new Map()} somenteLeitura marcas={marcas}
                selecionar={(b) => setFiltro((f) => (f === b || b === "inicio" ? null : b))} inserirEm={() => undefined} agir={() => undefined} soltar={() => undefined} />
            </Quadro>
          ) : <div className="p-8"><LoadingState label="Lendo a versão..." /></div>}
        </section>
        <aside className="min-h-0 overflow-y-auto border-l border-border bg-card" aria-label="Andamento">
          <Fim e={e} />
          {e.mae && (
            <Bloco titulo="Chamado por">
              <Link href={`/flows/execucoes/${e.mae.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                <SquareStack className="h-4 w-4" /> {e.mae.fluxo_nome} <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Bloco>
          )}
          {e.agora && <AgoraNaExecucao agora={e.agora} acordarEm={e.acordar_em} nomes={nomes} />}
          {!e.agora && e.situacao === "esperando" && e.acordar_em && (
            <Bloco titulo="Agora"><p className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4 text-warning" /> Esperando até {new Date(e.acordar_em).toLocaleString("pt-BR")}</p></Bloco>
          )}
          <Valores titulo="Variáveis" valores={e.variaveis} vazio="Este fluxo não tem variáveis." />
          <Valores titulo="Entradas" valores={e.entradas} vazio="Executado sem entradas." />
          {e.filhas.length > 0 && (
            <Bloco titulo="Fluxos chamados">
              <ul className="space-y-1.5">
                {e.filhas.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/flows/execucoes/${f.id}`} className="font-medium text-primary hover:underline">{f.fluxo_nome}</Link>
                    <span className={cn("rounded-full border px-2 py-0.5 text-xs", SITUACAO[f.situacao]?.cor)}>{SITUACAO[f.situacao]?.rotulo ?? f.situacao}</span>
                  </li>
                ))}
              </ul>
            </Bloco>
          )}
          <Linha passos={passos} filtro={filtro} limpar={() => setFiltro(null)} />
        </aside>
      </div>
      <Modal open={cancelando} onClose={() => setCancelando(false)} title="Cancelar a execução?"
        description="Para agora: as automações que este fluxo pôs na fila, a pergunta em aberto e os fluxos que ele chamou também param."
        footer={<><Button variant="ghost" onClick={() => setCancelando(false)}>Voltar</Button>
          <Button variant="destructive" onClick={async () => { setCancelando(false); await agir("cancelar"); }}>Cancelar a execução</Button></>}>
        <p className="text-sm text-muted-foreground">O que já terminou continua valendo.</p>
      </Modal>
    </AreaDeFluxo>
  );
}

function Bloco({ titulo, children, className }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3 border-b border-border px-5 py-4", className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {children}
    </section>
  );
}

function Fim({ e }: { e: ExecucaoDetalhe }) {
  if (e.situacao === "concluida") {
    return (
      <Bloco titulo="Resultado" className="bg-success/5">
        <p className="text-sm" data-testid="resultado-da-execucao">{e.resultado === null || e.resultado === undefined ? "Concluída sem resultado." : textoDoValor(e.resultado)}</p>
      </Bloco>
    );
  }
  if (e.situacao === "falhou" || e.situacao === "cancelada") {
    return (
      <Bloco titulo={e.situacao === "falhou" ? "Por que falhou" : "Cancelada"} className={e.situacao === "falhou" ? "bg-destructive/5" : undefined}>
        <p className={cn("text-sm", e.situacao === "falhou" && "text-destructive")} data-testid="motivo-da-execucao">{e.motivo ?? "Sem motivo registrado."}</p>
      </Bloco>
    );
  }
  return null;
}

function AgoraNaExecucao({ agora, acordarEm, nomes }: { agora: Agora; acordarEm: string | null; nomes: Nomes }) {
  if (agora.tipo === "decisao") {
    return (
      <Bloco titulo="Esperando uma pessoa" className="bg-warning/5">
        <div className="flex items-start gap-3" data-testid="pendencia-da-execucao">
          <MessageCircleQuestion className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="space-y-2">
            <p className="font-semibold text-titulo">{agora.pergunta}</p>
            <p className="text-xs text-muted-foreground">Opções: {agora.opcoes.join(" · ")}{agora.desde ? ` · perguntado ${haQuanto(agora.desde)}` : ""}</p>
            <Button size="sm" asChild><Link href={`/pendencias/decisoes/${agora.decisao}`}>Responder</Link></Button>
          </div>
        </div>
      </Bloco>
    );
  }
  if (agora.tipo === "subfluxo") {
    return (
      <Bloco titulo="Esperando outro fluxo">
        <Link href={`/flows/execucoes/${agora.execucao}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <SquareStack className="h-4 w-4" /> {agora.fluxo_nome} <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        <p className="text-xs text-muted-foreground">Situação: {SITUACAO[agora.situacao ?? ""]?.rotulo ?? agora.situacao}</p>
      </Bloco>
    );
  }
  const nome = agora.automacao ? nomes.automacoes[agora.automacao] ?? agora.automacao : "Automação";
  const prontos = agora.jobs.filter((j) => j.terminou_em).length;
  return (
    <Bloco titulo={agora.jobs.length > 1 ? `Automação em ${agora.jobs.length} partes` : "Automação rodando"}>
      <div className="flex items-center gap-2 text-sm font-semibold text-titulo">
        {agora.jobs.length > 1 && <GitFork className="h-4 w-4 text-primary" />} {nome}
        {agora.tentativa > 1 && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">tentativa {agora.tentativa}</span>}
      </div>
      {agora.nova_tentativa_em && <p className="text-xs text-warning">Nova tentativa {new Date(agora.nova_tentativa_em).toLocaleTimeString("pt-BR")} (só o que falhou).</p>}
      {agora.jobs.length > 1 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`${prontos} de ${agora.jobs.length} partes terminadas`}>
          <div className="h-full bg-primary transition-all" style={{ width: `${(prontos / agora.jobs.length) * 100}%` }} />
        </div>
      )}
      <ul className="space-y-2" data-testid="partes-ao-vivo">
        {agora.jobs.map((j) => (
          <li key={j.job} className="rounded-md border border-border px-3 py-2 text-sm" data-parte={j.parte ?? ""}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{agora.jobs.length > 1 ? `Parte ${j.parte}` : "Execução"}</span>
              <StatusBadge status={j.situacao} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {j.maquina ? <>Máquina <b className="text-foreground">{j.maquina}</b></> : "Aguardando máquina"}
              {j.fatias ? ` · ${j.fatias} ${j.fatias === 1 ? "parte do trabalho" : "partes do trabalho"}` : j.itens.length ? ` · ${j.itens.length} ${j.itens.length === 1 ? "item" : "itens"}` : ""}
              {j.execucao && <> · <Link href={`/execucoes/${j.execucao}`} className="text-primary hover:underline">acompanhar</Link></>}
            </p>
          </li>
        ))}
      </ul>
      {acordarEm && <p className="text-xs text-muted-foreground">Confere de novo {haQuanto(acordarEm)}.</p>}
    </Bloco>
  );
}

function Valores({ titulo, valores, vazio }: { titulo: string; valores: Record<string, unknown>; vazio: string }) {
  const pares = Object.entries(valores ?? {});
  return (
    <Bloco titulo={titulo}>
      {pares.length === 0 ? <p className="text-sm text-muted-foreground">{vazio}</p> : (
        <dl className="space-y-1.5 text-sm" data-testid={`valores-${titulo.toLowerCase()}`}>
          {pares.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[minmax(0,40%)_1fr] gap-3">
              <dt className="truncate font-medium text-muted-foreground">{k}</dt>
              <dd className="break-words">{textoDoValor(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Bloco>
  );
}

const COR_DO_NIVEL = { info: "bg-muted-foreground/50", aviso: "bg-warning", erro: "bg-destructive" };

function Linha({ passos, filtro, limpar }: { passos: PassoDaLinha[]; filtro: string | null; limpar: () => void }) {
  const ordem = [...passos].reverse();
  return (
    <Bloco titulo="Linha do tempo" className="border-b-0">
      {filtro && <button type="button" onClick={limpar} className="text-xs text-primary hover:underline">Mostrando só um passo. Ver todos</button>}
      {ordem.length === 0 ? <p className="text-sm text-muted-foreground">Ainda nada aconteceu.</p> : (
        <ol className="space-y-2.5" data-testid="linha-do-tempo">
          {ordem.map((p) => (
            <li key={p.numero} className="flex gap-2.5 text-sm">
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", COR_DO_NIVEL[p.nivel] ?? COR_DO_NIVEL.info)} />
              <div className="min-w-0">
                <p className={cn("break-words leading-snug", p.nivel === "erro" && "text-destructive")}>{p.resumo}</p>
                <p className="text-xs text-muted-foreground">{new Date(p.quando).toLocaleTimeString("pt-BR")}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Bloco>
  );
}
