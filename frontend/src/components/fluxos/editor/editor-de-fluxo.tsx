"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Calculator, Check, CloudOff, History, Loader2, Play, Redo2, Undo2 } from "lucide-react";

import { AreaDeFluxo, BotaoTelaCheia, Divisor, useTelaCheia } from "@/components/fluxos/area-de-fluxo";
import { Quadro, type QuadroApi } from "@/components/fluxos/editor/quadro";

import { AdicionarPasso } from "@/components/fluxos/editor/adicionar-passo";
import { ProvedorDeCampoAtivo, ProvedorDeFuncoes } from "@/components/fluxos/editor/campos";
import { TelaDoFluxo, type AcaoDoCartao } from "@/components/fluxos/editor/cartoes";
import { PainelDoPasso, type DadosDoPortal } from "@/components/fluxos/editor/painel";
import { ExecutarFluxo } from "@/components/fluxos/executar-fluxo";
import type { Nomes } from "@/components/fluxos/frases";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingState } from "@/components/shared/loading-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { ErroDaApi, apiRequest } from "@/lib/api";
import { acharLugar, atualizar, duplicar, inserir, mover, moverPara, remover, type Lugar } from "@/lib/fluxos/arvore";
import type { Passo } from "@/lib/fluxos/catalogo";
import type { Comando, ErroDoFluxo, Fluxo, FluxoDetalhe, FluxoResumo } from "@/lib/fluxos/tipos";
import { podeGerenciar } from "@/lib/permissions";
import { haQuanto } from "@/lib/tempo";
import type { Automation } from "@/types/automation";
import { cn } from "@/lib/utils";

/*
 * Editor de fluxos em cartões (Fase 6, ADR-021). Cada mudança vira uma versão nova do rascunho na
 * memória (desfazer/refazer) e é gravada sozinha depois de um instante; o Portal devolve as pendências
 * de cada passo. Publicar congela o rascunho numa versão.
 */

type Salvamento = "salvo" | "salvando" | "pendente" | "falhou";
const ESPERA_PARA_SALVAR = 700;
const LIMITE_DO_HISTORICO = 100;

export function EditorDeFluxo({ id }: { id: string }) {
  const detalhe = useApi<FluxoDetalhe>(`/fluxos/${id}`);
  if (detalhe.loading && !detalhe.data) return <div className="p-8"><LoadingState label="Abrindo o fluxo..." /></div>;
  if (detalhe.error || !detalhe.data) return <div className="p-8"><ErrorState message={detalhe.error ?? "Fluxo não encontrado."} onRetry={detalhe.refetch} /></div>;
  return <Editor key={detalhe.data.id} inicial={detalhe.data} recarregar={detalhe.refetch} />;
}

function Editor({ inicial, recarregar }: { inicial: FluxoDetalhe; recarregar: () => Promise<void> }) {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const somenteLeitura = !podeGerenciar(user, "fluxos") || inicial.situacao === "arquivado";

  const [historico, setHistorico] = useState<{ passado: Fluxo[]; atual: Fluxo; futuro: Fluxo[] }>({ passado: [], atual: inicial.rascunho, futuro: [] });
  const fluxo = historico.atual;
  const [erros, setErros] = useState<ErroDoFluxo[]>(inicial.erros);
  const [salvamento, setSalvamento] = useState<Salvamento>("salvo");
  const [salvoEm, setSalvoEm] = useState<string>(inicial.rascunho_atualizado_em);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [inserindo, setInserindo] = useState<Lugar | null>(null);
  const [publicando, setPublicando] = useState(false);
  const quadro = useRef<QuadroApi>(null);
  const telaCheia = useTelaCheia(false);
  const [resumo, setResumo] = useState<FluxoResumo>(inicial);
  const [executando, setExecutando] = useState(false);

  const automacoes = useApi<Automation[]>("/automations");
  const outros = useApi<{ fluxos: FluxoResumo[] }>("/fluxos");
  const times = useApi<{ id: number; name: string }[]>("/teams");
  const dados: DadosDoPortal = useMemo(() => ({
    automacoes: (automacoes.data ?? []).filter((a) => a.key && a.status !== "archived").map((a) => ({ chave: a.key as string, nome: a.name })),
    fluxos: (outros.data?.fluxos ?? []).map((f) => ({ id: f.id, nome: f.nome, versao: f.versao_publicada })),
    times: times.data ?? [],
  }), [automacoes.data, outros.data, times.data]);
  const nomes: Nomes = useMemo(() => ({
    automacoes: Object.fromEntries(dados.automacoes.map((a) => [a.chave, a.nome])),
    fluxos: Object.fromEntries(dados.fluxos.map((f) => [f.id, f.nome])),
    times: Object.fromEntries(dados.times.map((t) => [String(t.id), t.name])),
  }), [dados]);

  // -- mudanças e histórico ---------------------------------------------------------------------
  const mudar = useCallback((transformar: (f: Fluxo) => Fluxo) => {
    if (somenteLeitura) return;
    setHistorico((h) => {
      const novo = transformar(h.atual);
      if (novo === h.atual) return h;
      return { passado: [...h.passado, h.atual].slice(-LIMITE_DO_HISTORICO), atual: novo, futuro: [] };
    });
    setSalvamento("pendente");
  }, [somenteLeitura]);
  const desfazer = useCallback(() => {
    setHistorico((h) => (h.passado.length ? { passado: h.passado.slice(0, -1), atual: h.passado[h.passado.length - 1], futuro: [h.atual, ...h.futuro] } : h));
    setSalvamento("pendente");
  }, []);
  const refazer = useCallback(() => {
    setHistorico((h) => (h.futuro.length ? { passado: [...h.passado, h.atual], atual: h.futuro[0], futuro: h.futuro.slice(1) } : h));
    setSalvamento("pendente");
  }, []);

  // -- gravar sozinho ---------------------------------------------------------------------------
  const versaoGravada = useRef(fluxo);
  useEffect(() => {
    if (somenteLeitura || salvamento !== "pendente" || fluxo === versaoGravada.current) return;
    const vez = setTimeout(async () => {
      setSalvamento("salvando");
      try {
        const r = await apiRequest<{ erros: ErroDoFluxo[] }>(`/fluxos/${inicial.id}/rascunho`, { token, method: "PUT", body: JSON.stringify(fluxo) });
        versaoGravada.current = fluxo;
        setErros(r.erros);
        setSalvoEm(new Date().toISOString());
        setResumo((x) => ({ ...x, rascunho_mudou: true }));
        setSalvamento((s) => (s === "salvando" ? "salvo" : s));
      } catch {
        setSalvamento("falhou");
      }
    }, ESPERA_PARA_SALVAR);
    return () => clearTimeout(vez);
  }, [fluxo, salvamento, somenteLeitura, token, inicial.id]);

  useEffect(() => {
    const sair = (e: BeforeUnloadEvent) => { if (salvamento !== "salvo") e.preventDefault(); };
    window.addEventListener("beforeunload", sair);
    return () => window.removeEventListener("beforeunload", sair);
  }, [salvamento]);

  // -- ações dos cartões ------------------------------------------------------------------------
  const agir = useCallback((id: string, acao: AcaoDoCartao) => {
    if (acao === "apagar") {
      mudar((f) => remover(f, id));
      setSelecionado((s) => (s === id ? null : s));
    } else if (acao === "duplicar") {
      // Ids novos saem do sorteio: calcula uma vez, fora do atualizador do estado.
      const r = duplicar(fluxo, id);
      mudar(() => r.fluxo);
      setSelecionado(r.id);
    } else {
      mudar((f) => mover(f, id, acao === "subir" ? -1 : 1));
    }
  }, [mudar, fluxo]);

  const escolherPasso = (p: Passo) => {
    if (!inserindo) return;
    const r = inserir(fluxo, inserindo, p.novo());
    setInserindo(null);
    mudar(() => r.fluxo);
    setSelecionado(r.id);
  };

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      const digitando = alvo.closest("input, textarea, select, [contenteditable=true]");
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !digitando) { e.preventDefault(); if (e.shiftKey) refazer(); else desfazer(); }
      else if (mod && e.key.toLowerCase() === "y" && !digitando) { e.preventDefault(); refazer(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && !digitando && selecionado && selecionado !== "inicio" && selecionado !== "funcoes" && !somenteLeitura
        && !document.querySelector("[role=dialog]")) {
        e.preventDefault(); agir(selecionado, "apagar");
      } else if (e.key === "Escape" && !digitando && !document.querySelector("[role=dialog], [role=menu]")) {
        if (selecionado) setSelecionado(null);
        else if (telaCheia.cheia) telaCheia.mudar(false);
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [selecionado, agir, desfazer, refazer, somenteLeitura, telaCheia]);

  // Desfazer pode tirar o passo que estava aberto no painel: fecha o painel.
  useEffect(() => {
    if (selecionado && selecionado !== "inicio" && selecionado !== "funcoes" && !acharLugar(fluxo, selecionado)) setSelecionado(null);
  }, [fluxo, selecionado]);

  // O painel abre e o quadro encolhe: traz o cartão escolhido para a vista (depois do novo tamanho).
  useEffect(() => {
    if (!selecionado || selecionado === "funcoes") return;
    let segundo = 0;
    const primeiro = requestAnimationFrame(() => { segundo = requestAnimationFrame(() => quadro.current?.focar(selecionado)); });
    return () => { cancelAnimationFrame(primeiro); cancelAnimationFrame(segundo); };
  }, [selecionado]);

  const errosPorBloco = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of erros) if (e.bloco) m.set(e.bloco, [...(m.get(e.bloco) ?? []), e.mensagem]);
    return m;
  }, [erros]);
  const idsDasFuncoes = new Set((fluxo.funcoes ?? []).map((f) => f.id).filter(Boolean));
  const errosDasFuncoes = erros.filter((e) => e.bloco && idsDasFuncoes.has(e.bloco)).length;
  const errosGerais = erros.filter((e) => !e.bloco || (!acharLugar(fluxo, e.bloco) && !idsDasFuncoes.has(e.bloco)));
  const foraDeLaco = !inserindo || !inserindo.lista.some((p, i) => p === "corpo" && i > 0 && laco(fluxo, inserindo.lista.slice(0, i)));

  const irParaPendencia = () => {
    const primeiro = erros.find((e) => e.bloco && acharLugar(fluxo, e.bloco));
    setSelecionado(primeiro?.bloco ?? (errosDasFuncoes ? "funcoes" : "inicio"));
  };

  return (
    <ProvedorDeCampoAtivo>
     <ProvedorDeFuncoes value={fluxo.funcoes ?? []}>
      <AreaDeFluxo cheia={telaCheia.cheia} testId="editor-de-fluxo">
        <Cabecalho telaCheia={telaCheia} resumo={resumo} setResumo={setResumo} salvamento={salvamento} salvoEm={salvoEm} erros={erros} somenteLeitura={somenteLeitura}
          irParaPendencia={irParaPendencia} publicar={() => setPublicando(true)} desfazer={desfazer} refazer={refazer}
          podeDesfazer={historico.passado.length > 0} podeRefazer={historico.futuro.length > 0} tentarDeNovo={() => setSalvamento("pendente")}
          funcoes={fluxo.funcoes?.length ?? 0} errosDasFuncoes={errosDasFuncoes} abrirFuncoes={() => setSelecionado("funcoes")}
          executar={() => setExecutando(true)} />
        <div className={cn("grid min-h-0 flex-1", selecionado ? "grid-cols-[minmax(0,1fr)_minmax(360px,420px)]" : "grid-cols-1")}>
          <section className="relative min-h-0">
            {errosGerais.length > 0 && (
              <div className="absolute inset-x-0 top-0 z-10 border-b border-destructive/30 bg-destructive/5 px-4 py-1.5 text-sm text-destructive backdrop-blur" role="alert">
                {errosGerais.map((e, i) => <p key={i}>{e.mensagem}</p>)}
              </div>
            )}
            <Quadro ref={quadro} aoClicarNoFundo={() => setSelecionado(null)}>
              <TelaDoFluxo fluxo={fluxo} selecionado={selecionado} nomes={nomes} erros={errosPorBloco} somenteLeitura={somenteLeitura}
                selecionar={setSelecionado} inserirEm={setInserindo} agir={agir}
                soltar={(passo, lugar) => mudar((f) => moverPara(f, passo, lugar))} />
            </Quadro>
          </section>
          {selecionado && (
            <PainelDoPasso fluxo={fluxo} selecionado={selecionado} erros={erros} dados={dados} somenteLeitura={somenteLeitura} fluxoId={inicial.id}
              mudarPasso={(id, m) => mudar((f) => atualizar(f, id, m as (c: Comando) => Comando))} mudarFluxo={mudar} fechar={() => setSelecionado(null)} />
          )}
        </div>
      </AreaDeFluxo>
      <AdicionarPasso aberto={inserindo !== null} fechar={() => setInserindo(null)} escolher={escolherPasso} foraDeLaco={foraDeLaco} />
      <Publicar aberto={publicando} fechar={() => setPublicando(false)} fluxoId={inicial.id} salvando={salvamento !== "salvo"}
        aoPublicar={async (versao) => {
          setPublicando(false);
          toast({ title: `Versão ${versao} publicada`, description: "É ela que roda quando o fluxo for executado.", kind: "success" });
          setResumo((x) => ({ ...x, versao_publicada: versao, rascunho_mudou: false, publicada_em: new Date().toISOString() }));
          await recarregar();
        }}
        aoRecusar={(e) => setErros(e)} />
      {!somenteLeitura && <ExecutarFluxo fluxo={resumo} aberto={executando} fechar={() => setExecutando(false)} />}
     </ProvedorDeFuncoes>
    </ProvedorDeCampoAtivo>
  );
}

function laco(fluxo: Fluxo, caminho: (string | number)[]): boolean {
  let no: unknown = fluxo;
  for (const p of caminho) no = (no as Record<string | number, unknown>)?.[p];
  const tipo = (no as Comando | undefined)?.tipo;
  return tipo === "para_cada" || tipo === "repetir_vezes" || tipo === "enquanto";
}

function Cabecalho({ resumo, setResumo, salvamento, salvoEm, erros, somenteLeitura, irParaPendencia, publicar, desfazer, refazer, podeDesfazer, podeRefazer, tentarDeNovo,
  funcoes, errosDasFuncoes, abrirFuncoes, executar, telaCheia }: {
  telaCheia: { cheia: boolean; mudar: (v: boolean) => void };
  resumo: FluxoResumo; setResumo: (f: (x: FluxoResumo) => FluxoResumo) => void; salvamento: Salvamento; salvoEm: string; erros: ErroDoFluxo[];
  somenteLeitura: boolean; irParaPendencia: () => void; publicar: () => void; desfazer: () => void; refazer: () => void;
  podeDesfazer: boolean; podeRefazer: boolean; tentarDeNovo: () => void;
  funcoes: number; errosDasFuncoes: number; abrirFuncoes: () => void; executar: () => void;
}) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [editandoNome, setEditandoNome] = useState(false);
  const [nome, setNome] = useState(resumo.nome);
  const gravarNome = async () => {
    setEditandoNome(false);
    const novo = nome.trim();
    if (!novo || novo === resumo.nome) { setNome(resumo.nome); return; }
    try {
      await apiRequest(`/fluxos/${resumo.id}`, { token, method: "PUT", body: JSON.stringify({ nome: novo }) });
      setResumo((x) => ({ ...x, nome: novo }));
    } catch (err) {
      setNome(resumo.nome);
      toast({ title: "Não foi possível renomear", description: err instanceof Error ? err.message : undefined, kind: "error" });
    }
  };
  const situacao = resumo.situacao === "arquivado" ? "Arquivado"
    : resumo.versao_publicada ? `Versão ${resumo.versao_publicada} publicada${resumo.rascunho_mudou ? " · rascunho com mudanças" : ""}` : "Rascunho, nunca publicado";
  const acao = "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-2 sm:px-3">
      <Link href="/flows" aria-label="Voltar para Fluxos" title="Voltar para Fluxos"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {editandoNome ? (
          <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} onBlur={gravarNome} aria-label="Nome do fluxo"
            onKeyDown={(e) => { if (e.key === "Enter") void gravarNome(); if (e.key === "Escape") { setNome(resumo.nome); setEditandoNome(false); } }}
            className="h-8 w-72 rounded-md border border-input bg-background px-2 text-base font-semibold text-titulo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        ) : (
          <h1 className={cn("max-w-[28rem] shrink-0 truncate rounded-md px-1.5 py-0.5 text-base font-semibold text-titulo", !somenteLeitura && "cursor-text hover:bg-muted")}
            onClick={() => !somenteLeitura && setEditandoNome(true)} title={somenteLeitura ? resumo.nome : "Clique para renomear"}>{resumo.nome}</h1>
        )}
        <span className="hidden min-w-0 truncate rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground md:inline" data-testid="situacao-do-fluxo" title={situacao}>{situacao}</span>
        {erros.length > 0 ? (
          <button type="button" onClick={irParaPendencia} title="Ir para a primeira pendência"
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-destructive/30 bg-destructive/5 px-2 py-0.5 text-xs font-medium text-destructive hover:bg-destructive/10" data-testid="pendencias-do-fluxo">
            <AlertCircle className="h-3.5 w-3.5" /> {erros.length} {erros.length === 1 ? "pendência" : "pendências"}
          </button>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success" data-testid="pronto-para-publicar">
            <Check className="h-3.5 w-3.5" /> <span className="hidden lg:inline">Pronto para publicar</span><span className="lg:hidden">Pronto</span>
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {!somenteLeitura && (
          <>
            <span className="mr-1.5 hidden items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground xl:flex" data-testid="salvamento" data-estado={salvamento} aria-live="polite">
              {salvamento === "salvando" || salvamento === "pendente" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…</>
                : salvamento === "falhou" ? <button type="button" onClick={tentarDeNovo} className="flex items-center gap-1.5 text-destructive"><CloudOff className="h-3.5 w-3.5" /> Não salvou. Tentar de novo</button>
                : <><Check className="h-3.5 w-3.5" /> Salvo {haQuanto(salvoEm)}</>}
            </span>
            <button type="button" className={cn(acao, "w-8 justify-center px-0 disabled:opacity-40")} aria-label="Desfazer (Ctrl+Z)" title="Desfazer (Ctrl+Z)" disabled={!podeDesfazer} onClick={desfazer}><Undo2 className="h-4 w-4" /></button>
            <button type="button" className={cn(acao, "w-8 justify-center px-0 disabled:opacity-40")} aria-label="Refazer (Ctrl+Y)" title="Refazer (Ctrl+Y)" disabled={!podeRefazer} onClick={refazer}><Redo2 className="h-4 w-4" /></button>
            <Divisor />
          </>
        )}
        <button type="button" onClick={abrirFuncoes} className={cn(acao, errosDasFuncoes > 0 && "text-destructive")} data-testid="abrir-funcoes" aria-label="Funções" title="Funções do fluxo">
          <Calculator className="h-4 w-4" /> <span className="hidden xl:inline">Funções{funcoes ? ` (${funcoes})` : ""}</span>
        </button>
        <Link href={`/flows/${resumo.id}/execucoes`} className={acao} aria-label="Execuções" title="Execuções deste fluxo">
          <History className="h-4 w-4" /> <span className="hidden xl:inline">Execuções</span>
        </Link>
        {!somenteLeitura && resumo.versao_publicada && resumo.situacao === "ativo" && (
          <button type="button" onClick={executar} className={acao} aria-label="Executar" title="Executar a versão publicada">
            <Play className="h-4 w-4" /> <span className="hidden xl:inline">Executar</span>
          </button>
        )}
        <Divisor />
        <BotaoTelaCheia cheia={telaCheia.cheia} mudar={telaCheia.mudar} />
        {!somenteLeitura && (
          <Button size="sm" className="ml-1 h-8" onClick={publicar} disabled={erros.length > 0 || resumo.situacao !== "ativo"}>Publicar versão</Button>
        )}
        {somenteLeitura && <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Só leitura</span>}
      </div>
    </header>
  );
}

function Publicar({ aberto, fechar, fluxoId, salvando, aoPublicar, aoRecusar }: {
  aberto: boolean; fechar: () => void; fluxoId: string; salvando: boolean; aoPublicar: (versao: number) => Promise<void>; aoRecusar: (e: ErroDoFluxo[]) => void;
}) {
  const { token } = useAuth();
  const [notas, setNotas] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const publicar = async () => {
    setOcupado(true);
    setFalha(null);
    try {
      const v = await apiRequest<{ numero: number }>(`/fluxos/${fluxoId}/publicar`, { token, method: "POST", body: JSON.stringify({ notas: notas.trim() || null }) });
      setNotas("");
      await aoPublicar(v.numero);
    } catch (err) {
      type Corpo = { error?: { details?: { erros?: ErroDoFluxo[] } }; detail?: { error?: { details?: { erros?: ErroDoFluxo[] } } } };
      const corpo = err instanceof ErroDaApi ? (err.dados as Corpo | null) : null;
      const detalhes = (corpo?.error ?? corpo?.detail?.error)?.details?.erros;
      if (detalhes?.length) aoRecusar(detalhes);
      setFalha(err instanceof Error ? err.message : "Não foi possível publicar.");
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Modal open={aberto} onClose={fechar} title="Publicar versão" description="A versão publicada é a que roda. O rascunho continua aberto para novas mudanças."
      footer={<><Button variant="ghost" onClick={fechar}>Cancelar</Button><Button onClick={publicar} disabled={ocupado || salvando}>{salvando ? "Salvando o rascunho…" : ocupado ? "Publicando…" : "Publicar"}</Button></>}>
      <div className="space-y-2">
        <label className="text-sm font-semibold text-titulo" htmlFor="notas-da-versao">O que mudou (opcional)</label>
        <Textarea id="notas-da-versao" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ex.: divide a Planet em 5 máquinas e tenta de novo os arquivos com erro." />
        {falha && <p className="text-sm text-destructive" role="alert">{falha}</p>}
      </div>
    </Modal>
  );
}
