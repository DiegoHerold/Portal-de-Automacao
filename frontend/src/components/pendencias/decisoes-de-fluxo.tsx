"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, MessageCircleQuestion } from "lucide-react";

import { ErrorState } from "@/components/shared/error-state";
import { PageTitle } from "@/components/shared/page-title";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import { haQuanto } from "@/lib/tempo";
import { cn } from "@/lib/utils";

/*
 * Decisões de fluxo (Fase 5 dos Fluxos): o bloco "Perguntar a uma pessoa" parou o fluxo esperando uma
 * resposta. Vale a primeira resposta; quem chegar depois vê quem respondeu, quando e por onde.
 */

export type Decisao = {
  id: string; fluxo: { id: string; nome: string | null }; execucao_id: string; pergunta: string; opcoes: string[];
  desde: string; pode_responder: boolean; situacao: "aguardando" | "respondida" | "cancelada" | string;
  resposta: string | null; respondida_por: string | null; respondida_em: string | null; respondida_via: string | null;
};

function textoDaResposta(d: Pick<Decisao, "situacao" | "resposta" | "respondida_por" | "respondida_em" | "respondida_via">): string {
  if (d.situacao === "cancelada") return "O fluxo foi cancelado: esta pergunta não vale mais.";
  const quem = d.respondida_por ? ` por ${d.respondida_por}` : "";
  const via = d.respondida_via === "email" ? " pelo botão do e-mail" : " pelo Portal";
  return `Respondida ${haQuanto(d.respondida_em)}${quem}${via}: “${d.resposta}”.`;
}

function useResponder(aoTerminar: () => Promise<unknown>) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function responder(decisao: Decisao, opcao: number, via: "portal" | "email" = "portal") {
    setOcupado(`${decisao.id}:${opcao}`);
    try {
      await apiRequest(`/fluxos/decisoes/${decisao.id}/responder`, { token, method: "POST", body: JSON.stringify({ opcao, via }) });
      toast({ title: `Resposta registrada: ${decisao.opcoes[opcao]}`, description: "O fluxo segue pelo caminho escolhido.", kind: "success" });
    } catch (err) {
      toast({ title: "Não foi possível responder", description: err instanceof Error ? err.message : undefined, kind: "error" });
    } finally {
      setOcupado(null);
      await aoTerminar();
    }
  }
  return { responder, ocupado };
}

function CartaoDaDecisao({ decisao, ocupado, aoResponder, marcada }: {
  decisao: Decisao; ocupado: string | null; aoResponder: (opcao: number) => void; marcada?: number | null;
}) {
  return (
    <article className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm" data-decisao={decisao.id}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-warning text-white">
          <MessageCircleQuestion className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">
            Fluxo <b className="text-titulo">{decisao.fluxo.nome ?? "sem nome"}</b> · perguntou {haQuanto(decisao.desde)}
          </p>
          <p className="mt-1 text-lg font-semibold text-titulo">{decisao.pergunta}</p>
        </div>
      </div>
      {decisao.pode_responder ? (
        <div className="flex flex-wrap gap-2" data-testid="opcoes-da-decisao">
          {decisao.opcoes.map((opcao, i) => (
            <Button key={opcao} size="lg" variant={marcada == null ? (i === 0 ? "primary" : "outline") : i === marcada ? "primary" : "outline"}
              disabled={ocupado !== null} onClick={() => aoResponder(i)}
              className={cn(marcada != null && i !== marcada && "opacity-70")}>
              {ocupado === `${decisao.id}:${i}` ? "Respondendo..." : opcao}
            </Button>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-lg bg-muted/40 px-4 py-3 text-sm" data-testid="ja-respondida">
          <CheckCircle2 className="h-5 w-5 text-success" /> {textoDaResposta(decisao)}
        </p>
      )}
    </article>
  );
}

/** Na página Pendências: as perguntas de fluxo esperando a pessoa (não aparece se não houver). */
export function DecisoesDeFluxo() {
  const dados = useApi<{ decisoes: Decisao[] }>("/fluxos/decisoes");
  const { responder, ocupado } = useResponder(dados.refetch);
  const lista = Array.isArray(dados.data?.decisoes) ? dados.data.decisoes : [];
  if (dados.error || lista.length === 0) return null;
  return (
    <section className="space-y-3" data-testid="decisoes-de-fluxo">
      <h2 className="titulo-condensado text-2xl">Decisões de fluxo</h2>
      <p className="text-muted-foreground">Um fluxo parou esperando a sua resposta. Vale a primeira resposta.</p>
      <div className="space-y-3">
        {lista.map((d) => <CartaoDaDecisao key={d.id} decisao={d} ocupado={ocupado} aoResponder={(i) => void responder(d, i)} />)}
      </div>
    </section>
  );
}

/** Onde os botões do e-mail levam (com login): a opção já vem marcada, a pessoa confirma. */
export function PaginaDaDecisao({ decisaoId, opcao }: { decisaoId: string; opcao: number | null }) {
  const dados = useApi<Decisao>(`/fluxos/decisoes/${decisaoId}`);
  const { responder, ocupado } = useResponder(dados.refetch);
  const d = dados.data;
  const marcada = d && opcao != null && opcao >= 0 && opcao < d.opcoes.length ? opcao : null;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle eyebrow="Decisão de fluxo" title={d ? `${d.fluxo.nome ?? "O fluxo"} precisa da sua decisão` : "Decisão de fluxo"}
        description={marcada != null && d?.pode_responder ? `Você escolheu “${d.opcoes[marcada]}” no e-mail. Confirme abaixo.` : undefined} />
      {dados.error ? <ErrorState message={dados.error} onRetry={dados.refetch} /> : !d ? <div className="skeleton h-48 rounded-xl" /> : (
        <>
          <CartaoDaDecisao decisao={d} ocupado={ocupado} marcada={marcada}
            aoResponder={(i) => void responder(d, i, marcada != null ? "email" : "portal")} />
          <p className="text-sm text-muted-foreground">
            <Link href="/pendencias" className="text-primary hover:underline">Ver todas as pendências</Link>
          </p>
        </>
      )}
    </div>
  );
}
