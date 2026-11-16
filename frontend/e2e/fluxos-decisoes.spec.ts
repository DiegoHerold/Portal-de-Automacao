import { expect, test, type Page, type Request } from "@playwright/test";

import { API_DE_TESTE } from "../playwright.config";

/*
 * Fluxos, Fase 5: o bloco "Perguntar a uma pessoa" aparece em Pendências ("Decisões de fluxo") e o
 * botão do e-mail abre a página da decisão com a opção marcada. A API é simulada só aqui.
 */

const TELAS = "test-results/telas/fluxos";
type Pedido = { metodo: string; caminho: string; corpo: unknown };

async function preparar(page: Page) {
  const erros: string[] = [];
  const pedidos: Pedido[] = [];
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  page.on("pageerror", (e) => erros.push(String(e)));
  await page.addInitScript(() => {
    window.localStorage.setItem("portal_token", "token-de-teste");
    window.localStorage.setItem("portal_theme", "light");
  });
  await page.routeWebSocket(/api\.teste\.invalid/, (ws) => ws.close());
  const agora = Date.now();
  const em = (s: number) => new Date(agora + s * 1000).toISOString();
  let respondida: number | null = null;
  const decisao = () => ({
    id: "dec_1", fluxo: { id: "flx_1", nome: "Planet em 5 máquinas" }, execucao_id: "fle_1",
    pergunta: "Sobraram arquivos com erro. O que fazer?", opcoes: ["tentar de novo", "encerrar"], desde: em(-1800),
    pode_responder: respondida === null, situacao: respondida === null ? "aguardando" : "respondida",
    resposta: respondida === null ? null : ["tentar de novo", "encerrar"][respondida], respondida_por: respondida === null ? null : "TI Biason",
    respondida_em: respondida === null ? null : em(0), respondida_via: respondida === null ? null : "email",
  });
  await page.route(`${API_DE_TESTE}/**`, async (route) => {
    const r: Request = route.request();
    const caminho = new URL(r.url()).pathname.replace("/api/v1", "");
    const json = (b: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (r.method() !== "GET") pedidos.push({ metodo: r.method(), caminho, corpo: r.postData() ? JSON.parse(r.postData() as string) : null });
    if (caminho === "/auth/me") return json({ id: 1, email: "ti@teste.invalid", name: "TI Biason", role: "admin", permissions: [], rbac_permissions: [] });
    if (caminho.endsWith("/avisos")) return route.fulfill({ status: 200, contentType: "text/event-stream", body: "event: pronto\ndata: {}\n\n" });
    if (caminho === "/pendencias") return json({ execucoes: [] });
    if (caminho === "/fluxos/decisoes") return json({ decisoes: respondida === null ? [decisao()] : [] });
    if (caminho === "/fluxos/decisoes/dec_1") return json(decisao());
    if (caminho === "/fluxos/decisoes/dec_1/responder") {
      respondida = (JSON.parse(r.postData() as string) as { opcao: number }).opcao;
      return json(decisao());
    }
    if (caminho === "/notificacoes") return json({ avisos: [], nao_lidas: 0 });
    return json([]);
  });
  return { erros, pedidos };
}

async function abrir(page: Page, rota: string) {
  await page.goto(rota);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

test("pendências: a decisão de fluxo aparece com um botão por resposta e some depois de responder", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { erros, pedidos } = await preparar(page);
  await abrir(page, "/pendencias");
  const secao = page.getByTestId("decisoes-de-fluxo");
  await expect(secao).toContainText("Sobraram arquivos com erro. O que fazer?");
  await expect(secao).toContainText("Planet em 5 máquinas");
  await page.screenshot({ path: `${TELAS}/pendencias-decisao.png`, fullPage: true, animations: "disabled" });
  await secao.getByRole("button", { name: "encerrar" }).click();
  await expect.poll(() => pedidos.find((p) => p.caminho === "/fluxos/decisoes/dec_1/responder")?.corpo).toEqual({ opcao: 1, via: "portal" });
  await expect(page.getByTestId("decisoes-de-fluxo")).toHaveCount(0);
  expect(erros).toEqual([]);
});

test("e-mail: o botão abre a decisão com a opção marcada; depois de responder mostra quem respondeu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { erros, pedidos } = await preparar(page);
  await abrir(page, "/pendencias/decisoes/dec_1?opcao=0");
  await expect(page.getByText("Você escolheu “tentar de novo” no e-mail. Confirme abaixo.")).toBeVisible();
  await page.screenshot({ path: `${TELAS}/decisao-do-email.png`, animations: "disabled" });
  await page.getByTestId("opcoes-da-decisao").getByRole("button", { name: "tentar de novo" }).click();
  await expect.poll(() => pedidos.find((p) => p.caminho === "/fluxos/decisoes/dec_1/responder")?.corpo).toEqual({ opcao: 0, via: "email" });
  await expect(page.getByTestId("ja-respondida")).toContainText("“tentar de novo”");
  expect(erros).toEqual([]);
});
