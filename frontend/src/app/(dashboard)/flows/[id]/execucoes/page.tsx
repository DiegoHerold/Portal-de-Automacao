import type { Metadata } from "next";

import { ExecucoesDoFluxo } from "@/components/fluxos/execucoes-do-fluxo";

export const metadata: Metadata = { title: "Execuções do fluxo" };

export default async function ExecucoesDoFluxoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExecucoesDoFluxo id={id} />;
}
