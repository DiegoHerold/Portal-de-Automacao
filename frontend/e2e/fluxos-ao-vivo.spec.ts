import { readFileSync } from "node:fs";

import { expect, test, type Page, type Request } from "@playwright/test";

import { API_DE_TESTE } from "../playwright.config";

/*
 * Fluxos, Fase 7: funções do fluxo e o botão Calcular, executar com o formulário das entradas, tela ao
 * vivo (passo atual, partes com a máquina, pergunta em aberto, cancelar) e histórico. API simulada aqui.
 */

const TELAS = "test-results/telas/fluxos";
const PLANET = JSON.parse(readFileSync("../contracts/flows/v1/examples/planet-em-5-maquinas.json", "utf-8"));
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
  let rascunho = structuredClone(PLANET);
  let cancelada = false;
  const resumo = { id: "flx_1", nome: "Planet em 5 máquinas", descricao: null, situacao: "ativo", versao_publicada: 2, publicada_em: em(-7200),
                   rascunho_mudou: false, rascunho_atualizado_em: em(-7200), criado_em: em(-86400) };
  const job = (parte: number, situacao: string, maquina: string | null) => ({
    job: `tsk_${parte}`, parte, itens: ["PLANET"], fatias: 10, situacao, maquina, execucao: `exe_${parte}`,
    comecou_em: maquina ? em(-600) : null, terminou_em: situacao === "succeeded" ? em(-60) : null });
  const base = {
    fluxo_id: "flx_1", versao: 2, execucao_pai_id: null, passos_dados: 3, resultado: null, motivo: null, origem: "manual",
    disparado_por: "1", disparado_por_nome: "TI Biason", criado_em: em(-900), terminado_em: null, fluxo_nome: "Planet em 5 máquinas",
    entradas: { empresa: "PLANET", arquivos: ["a.txt", "b.txt"] }, mae: null, filhas: [],
  };
  const execucoes: Record<string, () => unknown> = {
    fle_1: () => ({
      ...base, id: "fle_1", situacao: cancelada ? "cancelada" : "esperando", bloco_atual: "b1", acordar_em: em(5),
      motivo: cancelada ? "Cancelada por uma pessoa." : null, terminado_em: cancelada ? em(0) : null,
      variaveis: { resultado: null, tentativas: null },
      agora: cancelada ? null : { tipo: "automacao", bloco: "b1", automacao: "integracao_contabil", modo: "fatias", tentativa: 1, nova_tentativa_em: null,
               jobs: [job(1, "succeeded", "PC-01"), job(2, "running", "PC-02"), job(3, "running", "PC-03"), job(4, "running", "PC-04"), job(5, "queued", null)] },
      passos: [
        { numero: 1, bloco: "b1", tipo: "dividir_automacao", resumo: "integracao_contabil na fila (5 jobs); esperando terminar", nivel: "info", quando: em(-890) },
        ...(cancelada ? [{ numero: 2, bloco: null, tipo: "cancelar", resumo: "Cancelada por uma pessoa.", nivel: "aviso", quando: em(0) }] : []),
      ],
    }),
    fle_2: () => ({
      ...base, id: "fle_2", situacao: "esperando", bloco_atual: "b7", acordar_em: em(60),
      variaveis: { resultado: { situacao: "parcial", total_ok: 48, total_com_erro: 2 }, tentativas: 2 },
      agora: { tipo: "decisao", bloco: "b7", decisao: "dec_1", pergunta: "Sobraram arquivos com erro. O que fazer?", opcoes: ["tentar de novo", "encerrar"], desde: em(-300) },
      passos: [
        { numero: 1, bloco: "b1", tipo: "dividir_automacao", resumo: "Terminou: parcial (48 ok, 2 com erro)", nivel: "aviso", quando: em(-800) },
        { numero: 2, bloco: "b2", tipo: "definir", resumo: "tentativas = 0", nivel: "info", quando: em(-799) },
        { numero: 3, bloco: "b3", tipo: "enquanto", resumo: "Entrou no laço", nivel: "info", quando: em(-799) },
        { numero: 4, bloco: "b6", tipo: "se", resumo: "Condição 1 verdadeira", nivel: "info", quando: em(-310) },
        { numero: 5, bloco: "b7", tipo: "perguntar", resumo: "Perguntou: Sobraram arquivos com erro. O que fazer? (esperando a resposta)", nivel: "info", quando: em(-300) },
      ],
    }),
  };
  await page.route(`${API_DE_TESTE}/**`, async (route) => {
    const r: Request = route.request();
    const caminho = new URL(r.url()).pathname.replace("/api/v1", "");
    const corpo = r.postData() ? JSON.parse(r.postData() as string) : null;
    const json = (b: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (r.method() !== "GET") pedidos.push({ metodo: r.method(), caminho, corpo });
    if (caminho === "/auth/me") return json({ id: 1, email: "ti@teste.invalid", name: "TI Biason", role: "admin", permissions: [], rbac_permissions: [] });
    if (caminho.endsWith("/avisos")) return route.fulfill({ status: 200, contentType: "text/event-stream", body: "event: pronto\ndata: {}\n\n" });
    if (caminho === "/notificacoes") return json({ avisos: [], nao_lidas: 0 });
    if (caminho === "/automations") return json([{ id: 7, key: "integracao_contabil", name: "Integração Contábil", status: "active" }]);
    if (caminho === "/teams") return json([]);
    if (caminho === "/fluxos") return json({ fluxos: [resumo] });
    if (caminho === "/fluxos/flx_1") return json({ ...resumo, rascunho, erros: [], versoes: [] });
    if (caminho === "/fluxos/flx_1/rascunho") { rascunho = corpo; return json({ erros: [] }); }
    if (caminho === "/fluxos/flx_1/versoes/2") return json({ numero: 2, publicada_em: em(-7200), publicada_por: "1", notas: null, ast: PLANET });
    if (caminho === "/fluxos/flx_1/executar") return json(execucoes.fle_1(), 201);
    if (caminho === "/fluxos/flx_1/execucoes") {
      return json({ execucoes: [{ ...base, id: "fle_2", situacao: "esperando", bloco_atual: "b7", acordar_em: null },
                                { ...base, id: "fle_0", situacao: "falhou", bloco_atual: "b1", acordar_em: null, motivo: "Quem disparou o fluxo não pode executar a automação.",
                                  terminado_em: em(-3500), criado_em: em(-3600) }] });
    }
    if (caminho === "/fluxos/execucoes/fle_1/cancelar") { cancelada = true; return json(execucoes.fle_1()); }
    const ex = caminho.match(/^\/fluxos\/execucoes\/(fle_\d)$/);
    if (ex && execucoes[ex[1]]) return json(execucoes[ex[1]]());
    return json([]);
  });
  const ultimoRascunho = () => [...pedidos].reverse().find((p) => p.caminho === "/fluxos/flx_1/rascunho")?.corpo as typeof PLANET | undefined;
  return { erros, pedidos, ultimoRascunho };
}

async function abrir(page: Page, rota: string) {
  await page.goto(rota);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

test("funções do fluxo e o botão Calcular em qualquer campo", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const { erros, ultimoRascunho } = await preparar(page);
  await abrir(page, "/flows/flx_1");
  await page.getByTestId("abrir-funcoes").click();
  const painel = page.getByTestId("painel");
  await painel.getByRole("button", { name: "Nova função" }).click();
  await painel.getByLabel("Nome da função").fill("tem_erro");
  await expect.poll(() => ultimoRascunho()?.funcoes?.[0]?.nome).toBe("tem_erro");
  await page.screenshot({ path: `${TELAS}/funcoes.png`, animations: "disabled" });

  // No passo "Concluir", o resultado vira "juntar textos" e depois a função do fluxo dentro dele.
  await page.getByTestId("tela-do-fluxo").locator('[data-cartao="b11"] > div > button').first().click();
  await painel.getByRole("button", { name: "Tirar o valor dinâmico" }).click();
  await painel.getByRole("button", { name: "Calcular" }).first().click();
  await page.getByTestId("menu-calcular").locator('[data-funcao="juntar_texto"]').click();
  await expect(painel.locator('[data-composto="fn"]')).toContainText("Juntar textos");
  await painel.locator('[data-composto="fn"]').getByRole("button", { name: "Calcular" }).click();
  await page.getByTestId("menu-calcular").getByRole("menuitem", { name: "tem_erro" }).click();
  await expect.poll(() => ultimoRascunho()?.corpo.at(-1)?.valor).toEqual({
    tipo: "fn", nome: "juntar_texto", args: [{ tipo: "chamar", funcao: "tem_erro", args: [{ tipo: "texto", valor: "" }] }] });
  await expect(page.getByTestId("tela-do-fluxo").locator('[data-cartao="b11"]')).toContainText("juntar textos de");
  expect(erros).toEqual([]);
});

test("executar com o formulário das entradas abre a tela ao vivo", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const { erros, pedidos } = await preparar(page);
  await abrir(page, "/flows/flx_1");
  await page.getByRole("button", { name: "Executar" }).click();
  const janela = page.getByRole("dialog");
  await expect(janela.getByTestId("entradas-do-fluxo")).toBeVisible();
  await expect(janela.getByRole("button", { name: "Executar agora" })).toBeDisabled();
  await janela.getByLabel("Empresa *").fill("PLANET");
  await janela.getByLabel("Arquivos TXT *").fill("a.txt\nb.txt\n");
  await page.screenshot({ path: `${TELAS}/executar.png`, animations: "disabled" });
  await janela.getByRole("button", { name: "Executar agora" }).click();
  await expect.poll(() => pedidos.find((p) => p.caminho === "/fluxos/flx_1/executar")?.corpo).toEqual({ entradas: { empresa: "PLANET", arquivos: ["a.txt", "b.txt"] } });
  await expect(page).toHaveURL(/\/flows\/execucoes\/fle_1$/);

  const ao = page.getByTestId("execucao-ao-vivo");
  await expect(ao.getByTestId("situacao-da-execucao")).toHaveText("Esperando");
  await expect(ao.locator('[data-cartao="b1"]')).toHaveAttribute("data-marca", "esperando");
  const partes = ao.getByTestId("partes-ao-vivo");
  await expect(partes.locator("li")).toHaveCount(5);
  await expect(partes.locator('[data-parte="2"]')).toContainText("PC-02");
  await expect(partes.locator('[data-parte="5"]')).toContainText("Aguardando máquina");
  await page.screenshot({ path: `${TELAS}/ao-vivo-partes.png`, animations: "disabled" });

  await ao.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar a execução" }).click();
  await expect.poll(() => pedidos.some((p) => p.caminho === "/fluxos/execucoes/fle_1/cancelar")).toBe(true);
  await expect(ao.getByTestId("situacao-da-execucao")).toHaveText("Cancelada");
  await expect(ao.getByTestId("motivo-da-execucao")).toHaveText("Cancelada por uma pessoa.");
  expect(erros).toEqual([]);
});

test("ao vivo: pergunta em aberto em destaque, caminho percorrido e linha do tempo por passo", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const { erros } = await preparar(page);
  await abrir(page, "/flows/execucoes/fle_2");
  const ao = page.getByTestId("execucao-ao-vivo");
  const pendencia = ao.getByTestId("pendencia-da-execucao");
  await expect(pendencia).toContainText("Sobraram arquivos com erro. O que fazer?");
  await expect(pendencia.getByRole("link", { name: "Responder" })).toHaveAttribute("href", "/pendencias/decisoes/dec_1");
  await expect(ao.locator('[data-cartao="b2"]')).toHaveAttribute("data-marca", "feito");
  await expect(ao.locator('[data-cartao="b7"]')).toHaveAttribute("data-marca", "esperando");
  await expect(ao.getByTestId("valores-variáveis")).toContainText("resultado: parcial (48 ok, 2 com erro)");
  await page.screenshot({ path: `${TELAS}/ao-vivo-pergunta.png`, animations: "disabled" });

  // A tela abre no passo atual (b7); "Ajustar à tela" mostra o fluxo inteiro.
  await ao.getByRole("button", { name: "Ajustar à tela (Shift 1)" }).click();
  await ao.locator('[data-cartao="b2"] > div > button').first().click();
  await expect(ao.getByTestId("linha-do-tempo").locator("li")).toHaveCount(1);
  await expect(ao.getByTestId("linha-do-tempo")).toContainText("tentativas = 0");
  await ao.getByRole("button", { name: "Mostrando só um passo. Ver todos" }).click();
  await expect(ao.getByTestId("linha-do-tempo").locator("li")).toHaveCount(5);
  expect(erros).toEqual([]);
});

test("histórico: as execuções do fluxo com situação, quem e motivo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { erros } = await preparar(page);
  await abrir(page, "/flows/flx_1/execucoes");
  const tabela = page.getByTestId("execucoes-do-fluxo");
  await expect(tabela.locator("tbody tr")).toHaveCount(2);
  await expect(tabela).toContainText("Esperando");
  await expect(tabela).toContainText("Quem disparou o fluxo não pode executar a automação.");
  await expect(tabela).toContainText("TI Biason");
  await page.screenshot({ path: `${TELAS}/historico.png`, animations: "disabled" });
  await tabela.getByRole("link", { name: "Esperando" }).click();
  await expect(page).toHaveURL(/\/flows\/execucoes\/fle_2$/);
  expect(erros).toEqual([]);
});
