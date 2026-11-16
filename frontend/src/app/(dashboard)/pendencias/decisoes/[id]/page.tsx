import type { Metadata } from "next";

import { PaginaDaDecisao } from "@/components/pendencias/decisoes-de-fluxo";

export const metadata: Metadata = { title: "Decisão de fluxo" };

/** O botão do e-mail da decisão leva aqui (com login), com ?opcao=N já marcada para confirmar. */
export default async function DecisaoRoutePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ opcao?: string }>;
}) {
  const { id } = await params;
  const { opcao } = await searchParams;
  const numero = opcao !== undefined && /^\d+$/.test(opcao) ? Number(opcao) : null;
  return <PaginaDaDecisao decisaoId={id} opcao={numero} />;
}
