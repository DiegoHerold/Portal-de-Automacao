import type { Metadata } from "next";

import { ExecucaoAoVivo } from "@/components/fluxos/execucao-ao-vivo";

export const metadata: Metadata = { title: "Execução de fluxo" };

export default async function ExecucaoDeFluxoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExecucaoAoVivo id={id} />;
}
