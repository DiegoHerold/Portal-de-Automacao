import type { Marca } from "@/components/fluxos/editor/cartoes";

/** Execuções de fluxo (Fase 7): o que `GET /fluxos/execucoes/{id}` e `GET /fluxos/{id}/execucoes` devolvem. */

export type SituacaoDaExecucao = "rodando" | "esperando" | "pausada" | "concluida" | "falhou" | "cancelada";

export type ExecucaoResumo = {
  id: string; fluxo_id: string; versao: number; execucao_pai_id: string | null; situacao: SituacaoDaExecucao; bloco_atual: string | null;
  passos_dados: number; acordar_em: string | null; resultado: unknown; motivo: string | null; origem: string; disparado_por: string | null;
  disparado_por_nome?: string | null; criado_em: string; terminado_em: string | null;
};

export type JobAoVivo = {
  job: string; parte: number | null; itens: string[]; fatias: number; situacao: string | null; maquina: string | null;
  execucao: string | null; comecou_em: string | null; terminou_em: string | null;
};

export type Agora =
  | { tipo: "automacao"; bloco: string | null; automacao: string | null; modo: string | null; tentativa: number; nova_tentativa_em: string | null; jobs: JobAoVivo[] }
  | { tipo: "decisao"; bloco: string | null; decisao: string; pergunta: string | null; opcoes: string[]; desde: string | null }
  | { tipo: "subfluxo"; bloco: string | null; execucao: string; fluxo_nome: string | null; situacao: string | null; bloco_atual: string | null };

export type PassoDaLinha = { numero: number; bloco: string | null; tipo: string; resumo: string; nivel: "info" | "aviso" | "erro"; quando: string };

export type ExecucaoDetalhe = ExecucaoResumo & {
  fluxo_nome: string | null; entradas: Record<string, unknown>; variaveis: Record<string, unknown>; agora: Agora | null;
  mae: { id: string; fluxo_id: string; fluxo_nome: string; bloco: string | null } | null;
  filhas: { id: string; fluxo_id: string; fluxo_nome: string; bloco: string | null; situacao: SituacaoDaExecucao; criado_em: string; terminado_em: string | null }[];
  passos: PassoDaLinha[];
};

export const TERMINAIS = new Set<string>(["concluida", "falhou", "cancelada"]);

export const SITUACAO: Record<string, { rotulo: string; cor: string }> = {
  rodando: { rotulo: "Rodando", cor: "border-info/30 bg-info/10 text-info" },
  esperando: { rotulo: "Esperando", cor: "border-warning/30 bg-warning/10 text-warning" },
  pausada: { rotulo: "Pausada", cor: "border-border bg-muted text-muted-foreground" },
  concluida: { rotulo: "Concluída", cor: "border-success/30 bg-success/10 text-success" },
  falhou: { rotulo: "Falhou", cor: "border-destructive/30 bg-destructive/10 text-destructive" },
  cancelada: { rotulo: "Cancelada", cor: "border-border bg-muted text-muted-foreground" },
};

/** Por onde passou (o último registro de cada bloco vale) e onde está agora. */
export function marcasDaExecucao(e: Pick<ExecucaoDetalhe, "passos" | "situacao" | "bloco_atual">): Map<string, Marca> {
  const marcas = new Map<string, Marca>([["inicio", "feito"]]);
  for (const p of e.passos) {
    if (!p.bloco) continue;
    marcas.set(p.bloco, p.tipo === "falha" || p.tipo === "falhar" || p.nivel === "erro" ? "erro" : "feito");
  }
  if (e.bloco_atual) {
    if (e.situacao === "rodando") marcas.set(e.bloco_atual, "atual");
    else if (e.situacao === "esperando" || e.situacao === "pausada") marcas.set(e.bloco_atual, "esperando");
    else if (e.situacao === "falhou") marcas.set(e.bloco_atual, "erro");
  }
  return marcas;
}

export function duracao(inicio: string, fim?: string | null, agora: Date = new Date()): string {
  const s = Math.max(0, Math.round(((fim ? new Date(fim) : agora).getTime() - new Date(inicio).getTime()) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60 ? `${s % 60} s` : ""}`.trim();
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60 ? `${m % 60} min` : ""}`.trim();
}

/** Um valor de variável ou entrada como texto curto (listas viram "a, b e mais 3"). */
export function textoDoValor(v: unknown): string {
  if (v === null || v === undefined) return "vazio";
  if (typeof v === "boolean") return v ? "verdadeiro" : "falso";
  if (Array.isArray(v)) {
    if (!v.length) return "lista vazia";
    const primeiros = v.slice(0, 5).map(textoDoValor).join(", ");
    return v.length > 5 ? `${primeiros} e mais ${v.length - 5}` : primeiros;
  }
  if (typeof v === "object") {
    const r = v as Record<string, unknown>;
    if ("situacao" in r && "total_ok" in r) return `resultado: ${r.situacao} (${r.total_ok} ok, ${r.total_com_erro ?? 0} com erro)`;
    return JSON.stringify(v).slice(0, 160);
  }
  return String(v);
}
