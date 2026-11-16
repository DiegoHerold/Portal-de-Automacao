import type { Metadata } from "next";

import { EditorDeFluxo } from "@/components/fluxos/editor/editor-de-fluxo";

export const metadata: Metadata = { title: "Editor de fluxo" };

export default async function FluxoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorDeFluxo id={id} />;
}
