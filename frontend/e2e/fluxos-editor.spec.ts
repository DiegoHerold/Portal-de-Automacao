import { readFileSync } from "node:fs";

import { expect, test, type Page, type Request } from "@playwright/test";

import { API_DE_TESTE } from "../playwright.config";

/*
 * Fluxos, Fase 6: lista e editor em cartões. A API é simulada só aqui; o rascunho inicial é o exemplo
 * oficial do contrato (Planet em 5 máquinas).
 */

const TELAS = "test-results/telas/fluxos";
const PLANET = JSON.parse(readFileSync("../contracts/flows/v1/examples/planet-em-5-maquinas.json", "utf-8"));
type Pedido = { metodo: string; caminho: string; corpo: unknown };
type No = { id?: string; tipo?: string; [k: string]: unknown };

function todos(lista: No[]): No[] {
  return lista.flatMap((c) => [c, ...["corpo", "senao", "se_falhar"].flatMap((k) => (Array.isArray(c[k]) ? todos(c[k] as No[]) : [])),
    ...["casos", "opcoes"].flatMap((k) => ((c[k] as { corpo?: No[] }[] | undefined) ?? []).flatMap((r) => todos(r.corpo ?? [])))]);
}

/** Pendências parecidas com as do Portal, só para a tela ter o que mostrar. */
function validar(ast: { corpo: No[] }) {
  return todos(ast.corpo).filter((c) => (c.tipo === "executar_automacao" || c.tipo === "dividir_automacao") && !c.automacao)
    .map((c) => ({ bloco: c.id, campo: "automacao", mensagem: "Escolha a automação." }));
}

async function preparar(page: Page, { leitura = false } = {}) {
  const erros: string[] = [];
  const pedidos: Pedido[] = [];
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  page.on("pageerror", (e) => erros.push(String(e)));
  await page.addInitScript(() => {
    window.localStorage.setItem("portal_token", "token-de-teste");
    window.localStorage.setItem("portal_theme", "light");
  });
  await page.routeWebSocket(/api\.teste\.invalid/, (ws) => ws.close());
  const agora = new Date(Date.now() - 3600_000).toISOString();
  let rascunho = structuredClone(PLANET);
  const resumo = (id: string, nome: string, versao: number | null) => ({
    id, nome, descricao: "Divide os TXT entre as máquinas e tenta de novo os que falharem.", situacao: "ativo",
    versao_publicada: versao, publicada_em: versao ? agora : null, rascunho_mudou: true, rascunho_atualizado_em: agora, criado_em: agora,
  });
  await page.route(`${API_DE_TESTE}/**`, async (route) => {
    const r: Request = route.request();
    const caminho = new URL(r.url()).pathname.replace("/api/v1", "");
    const corpo = r.postData() ? JSON.parse(r.postData() as string) : null;
    const json = (b: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (r.method() !== "GET") pedidos.push({ metodo: r.method(), caminho, corpo });
    if (caminho === "/auth/me") {
      return json({ id: 1, email: "ti@teste.invalid", name: "TI Biason", role: leitura ? "viewer" : "admin", permissions: [],
                    rbac_permissions: leitura ? ["fluxos.ver"] : [] });
    }
    if (caminho.endsWith("/avisos")) return route.fulfill({ status: 200, contentType: "text/event-stream", body: "event: pronto\ndata: {}\n\n" });
    if (caminho === "/notificacoes") return json({ avisos: [], nao_lidas: 0 });
    if (caminho === "/automations") {
      return json([{ id: 7, key: "integracao_contabil", name: "Integração Contábil", slug: "integracao-contabil", category_id: 1, executor_type: "python",
                     default_priority: "normal", timeout_seconds: 3600, max_retries: 0, is_active: true, status: "active" }]);
    }
    if (caminho === "/teams") return json([{ id: 3, name: "Contábil" }]);
    if (caminho === "/fluxos" && r.method() === "GET") return json({ fluxos: [resumo("flx_1", "Planet em 5 máquinas", 2), resumo("flx_2", "Empresas do mês", null)] });
    if (caminho === "/fluxos" && r.method() === "POST") {
      rascunho = { contrato: "fluxo/v1", entradas: [], variaveis: [], funcoes: [], corpo: [] };
      return json({ ...resumo("flx_1", corpo.nome, null), rascunho, erros: [], versoes: [] }, 201);
    }
    if (caminho === "/fluxos/flx_1" && r.method() === "GET") return json({ ...resumo("flx_1", "Planet em 5 máquinas", 2), rascunho, erros: validar(rascunho), versoes: [] });
    if (caminho === "/fluxos/flx_1/rascunho") { rascunho = corpo; return json({ erros: validar(corpo) }); }
    if (caminho === "/fluxos/flx_1/publicar") return json({ numero: 3, publicada_em: new Date().toISOString(), publicada_por: "TI Biason", notas: corpo?.notas ?? null }, 201);
    return json([]);
  });
  const ultimoRascunho = () => [...pedidos].reverse().find((p) => p.caminho === "/fluxos/flx_1/rascunho")?.corpo as { corpo: No[]; variaveis: No[] } | undefined;
  return { erros, pedidos, ultimoRascunho };
}

async function abrir(page: Page, rota: string) {
  await page.goto(rota);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

test("lista: mostra os fluxos e “Novo fluxo” cria e abre o editor", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { erros, pedidos } = await preparar(page);
  await abrir(page, "/flows");
  const lista = page.getByTestId("lista-de-fluxos");
  await expect(lista).toContainText("Planet em 5 máquinas");
  await expect(lista).toContainText("Versão 2 publicada");
  await expect(lista).toContainText("Rascunho, nunca publicado");
  await page.screenshot({ path: `${TELAS}/lista.png`, animations: "disabled" });
  await page.getByRole("button", { name: "Novo fluxo" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Fechamento do mês");
  await page.getByRole("button", { name: "Criar e abrir" }).click();
  await expect.poll(() => pedidos.find((p) => p.caminho === "/fluxos")?.corpo).toEqual({ nome: "Fechamento do mês", descricao: null });
  await expect(page).toHaveURL(/\/flows\/flx_1$/);
  await expect(page.getByTestId("editor-de-fluxo")).toContainText("Clique no + para adicionar o primeiro passo.");
  expect(erros).toEqual([]);
});

test("editor: cartões em ramos, painel do passo e pendência por bloco", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const { erros } = await preparar(page);
  await abrir(page, "/flows/flx_1");
  const tela = page.getByTestId("tela-do-fluxo");
  await expect(tela.locator('[data-cartao="b1"]')).toContainText("Integração Contábil");
  await expect(tela.locator('[data-cartao="b1"]')).toContainText("5 partes");
  await expect(tela.locator('[data-ramo="Se responder “tentar de novo”"]')).toBeVisible();
  await expect(page.getByTestId("pronto-para-publicar")).toBeVisible();
  await page.screenshot({ path: `${TELAS}/editor.png`, animations: "disabled" });

  await tela.locator('[data-cartao="b1"] > div > button').first().click();
  const painel = page.getByTestId("painel");
  await expect(painel).toContainText("Dividir automação entre máquinas");
  await expect(painel.getByRole("radio", { name: "Por partes do trabalho" })).toHaveAttribute("aria-checked", "true");
  await expect(painel.getByLabel("Automação")).toHaveValue("integracao_contabil");
  await page.screenshot({ path: `${TELAS}/editor-painel.png`, animations: "disabled" });

  await painel.getByLabel("Automação").selectOption("");
  await expect(page.getByTestId("pendencias-do-fluxo")).toContainText("1 pendência");
  await expect(painel.getByRole("alert")).toContainText("Escolha a automação.");
  await expect(page.getByRole("button", { name: "Publicar versão" })).toBeDisabled();
  expect(erros).toEqual([]);
});

test("editor: adicionar passo, valor dinâmico, desfazer, arrastar e publicar", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const { erros, pedidos, ultimoRascunho } = await preparar(page);
  await abrir(page, "/flows/flx_1");
  const tela = page.getByTestId("tela-do-fluxo");
  await expect(tela.locator('[data-cartao="b11"]')).toBeVisible();

  // "+" depois do último passo da raiz -> Avisar.
  await tela.locator('[data-inserir="corpo:5"]').click();
  const janela = page.getByRole("dialog");
  await janela.getByLabel("Buscar ação").fill("avisar");
  await expect(janela.locator("[data-passo]")).toHaveCount(1);
  await page.screenshot({ path: `${TELAS}/adicionar-passo.png`, animations: "disabled" });
  await janela.locator('[data-passo="avisar"]').click();
  const painel = page.getByTestId("painel");
  await expect(painel).toContainText("Avisar");

  // Clicar no campo e depois numa ficha de valor dinâmico.
  await painel.getByPlaceholder("Digite ou clique num valor dinâmico").click();
  await painel.locator('[data-ficha="r:resultado:total_ok"]').click();
  await expect.poll(() => ultimoRascunho()?.corpo.at(-1)).toMatchObject({
    tipo: "avisar", para: { tipo: "quem_executou" }, texto: { tipo: "campo", de: { tipo: "var", nome: "resultado" }, campo: "total_ok" },
  });
  await expect(page.getByTestId("salvamento")).toHaveAttribute("data-estado", "salvo");

  // Desfazer tira o valor; desfazer de novo tira o passo.
  await page.getByRole("button", { name: "Desfazer (Ctrl+Z)" }).click();
  await page.getByRole("button", { name: "Desfazer (Ctrl+Z)" }).click();
  await expect.poll(() => ultimoRascunho()?.corpo.length).toBe(5);

  // Desfazer tirou o passo aberto: o painel fecha. Arrastar "Guardar um valor" (b2) para o começo.
  await expect(page.getByTestId("painel")).toHaveCount(0);
  await page.getByRole("button", { name: "Ajustar à tela (Shift 1)" }).click();
  await tela.locator('[data-cartao="b2"]').dragTo(tela.locator('[data-inserir="corpo:0"]'));
  await expect.poll(() => ultimoRascunho()?.corpo.map((c) => c.id)).toEqual(["b2", "b1", "b3", "b6", "b11"]);
  await expect(page.getByTestId("salvamento")).toHaveAttribute("data-estado", "salvo");

  await page.getByRole("button", { name: "Publicar versão" }).click();
  await page.getByLabel("O que mudou (opcional)").fill("Zera as tentativas antes de dividir.");
  await page.getByRole("dialog").getByRole("button", { name: "Publicar", exact: true }).click();
  await expect.poll(() => pedidos.find((p) => p.caminho === "/fluxos/flx_1/publicar")?.corpo).toEqual({ notas: "Zera as tentativas antes de dividir." });
  await expect(page.getByTestId("situacao-do-fluxo")).toHaveText("Versão 3 publicada");
  expect(erros).toEqual([]);
});

test("só leitura: sem “+”, sem arrastar e sem publicar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { erros, pedidos } = await preparar(page, { leitura: true });
  await abrir(page, "/flows/flx_1");
  const tela = page.getByTestId("tela-do-fluxo");
  await expect(tela.locator('[data-cartao="b1"]')).toBeVisible();
  await expect(tela.locator("[data-inserir]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publicar versão" })).toHaveCount(0);
  await tela.locator('[data-cartao="b1"] > div > button').first().click();
  await expect(page.getByTestId("painel").getByLabel("Automação")).toBeDisabled();
  await expect(page.getByTestId("valores-dinamicos")).toHaveCount(0);
  expect(pedidos).toEqual([]);
  expect(erros).toEqual([]);
});

test("quadro: Ctrl + rolar dá zoom, mão move sem selecionar, fundo arrasta e tela cheia", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const { erros } = await preparar(page);
  await abrir(page, "/flows/flx_1");
  const quadro = page.getByTestId("quadro");
  const tela = page.getByTestId("tela-do-fluxo");
  await expect(tela.locator('[data-cartao="b1"]')).toBeVisible();
  await expect(page.getByTestId("botao-voltar")).toHaveCount(0);

  // Ctrl + rolar: zoom no ponto do mouse; rolar sem Ctrl só anda.
  const caixa = (await quadro.boundingBox())!;
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + 200);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -400);
  await page.keyboard.up("Control");
  await expect.poll(async () => Number(await quadro.getAttribute("data-zoom"))).toBeGreaterThan(100);
  await page.getByRole("button", { name: "Voltar a 100%" }).click();
  await expect(quadro).toHaveAttribute("data-zoom", "100");

  // Arrastar o fundo move a tela (na Seleção também). Mede depois da animação do zoom assentar.
  const posicao = async () => JSON.stringify(await tela.locator('[data-cartao="b1"]').boundingBox());
  let anterior = "";
  await expect.poll(async () => { const agora = await posicao(); const parado = agora === anterior; anterior = agora; return parado; }).toBe(true);
  const antes = (await tela.locator('[data-cartao="b1"]').boundingBox())!;
  await page.mouse.move(caixa.x + 60, caixa.y + 300);
  await page.mouse.down();
  await page.mouse.move(caixa.x + 160, caixa.y + 380, { steps: 5 });
  await page.mouse.up();
  const depois = (await tela.locator('[data-cartao="b1"]').boundingBox())!;
  expect(Math.round(depois.x - antes.x)).toBe(100);
  expect(Math.round(depois.y - antes.y)).toBe(80);

  // Mão (H): clicar num cartão não seleciona; V volta para a Seleção.
  await page.keyboard.press("h");
  await expect(quadro).toHaveAttribute("data-ferramenta", "mao");
  await tela.locator('[data-cartao="b2"]').click({ force: true });
  await expect(page.getByTestId("painel")).toHaveCount(0);
  await page.keyboard.press("v");
  await tela.locator('[data-cartao="b2"] > div > button').first().click();
  await expect(page.getByTestId("painel")).toBeVisible();

  // Tela cheia esconde o menu e o topo do Portal; Esc tira a seleção e depois sai.
  await page.getByRole("button", { name: "Tela cheia" }).click();
  await expect(page.getByTestId("editor-de-fluxo")).toHaveAttribute("data-tela-cheia", "true");
  await page.screenshot({ path: `${TELAS}/editor-tela-cheia.png`, animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("painel")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("editor-de-fluxo")).not.toHaveAttribute("data-tela-cheia", "true");
  expect(erros).toEqual([]);
});
