"use client";

import type { ReactNode } from "react";
import { Calculator, Plus, Trash2, X } from "lucide-react";

import {
  Campo, CampoDeCondicao, CampoDeValor, Contador, Segmentos, SeletorDeDestino, SeletorDeVariavel, useCampoAtivo,
} from "@/components/fluxos/editor/campos";
import { useApi } from "@/hooks/use-api";
import { Ficha } from "@/components/fluxos/frases";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { variaveisDoLaco } from "@/lib/fluxos/arvore";
import { INICIO, PASSO_POR_TIPO } from "@/lib/fluxos/catalogo";
import {
  CAMPOS_DO_RESULTADO, type Comando, type Declaracao, type Destino, type Entrada, type ErroDoFluxo, type Expr, type Fluxo,
  type Funcao, type TipoDeValor,
} from "@/lib/fluxos/tipos";
import { cn } from "@/lib/utils";

/*
 * Painel da direita: o formulário do passo escolhido (ou do início, com entradas e variáveis) e, no
 * rodapé, os valores dinâmicos que preenchem o campo em foco.
 */

export type DadosDoPortal = {
  automacoes: { chave: string; nome: string }[];
  fluxos: { id: string; nome: string; versao: number | null }[];
  times: { id: number; name: string }[];
};

type Props = {
  fluxo: Fluxo; selecionado: string; erros: ErroDoFluxo[]; dados: DadosDoPortal; somenteLeitura: boolean; fluxoId: string;
  mudarPasso: (id: string, mudar: (c: Comando) => Comando) => void;
  mudarFluxo: (mudar: (f: Fluxo) => Fluxo) => void;
  fechar: () => void;
};

const TIPOS: { valor: string; rotulo: string }[] = [
  { valor: "texto", rotulo: "Texto" }, { valor: "numero", rotulo: "Número" }, { valor: "booleano", rotulo: "Sim/não" },
  { valor: "data", rotulo: "Data" }, { valor: "lista:texto", rotulo: "Lista de textos" }, { valor: "lista:numero", rotulo: "Lista de números" },
  { valor: "resultado", rotulo: "Resultado de automação" }, { valor: "objeto", rotulo: "Objeto" }, { valor: "qualquer", rotulo: "Qualquer" },
];
const tipoParaTexto = (t: TipoDeValor): string => (typeof t === "object" ? `lista:${typeof t.lista === "string" ? t.lista : "qualquer"}` : t);
const textoParaTipo = (s: string): TipoDeValor => (s.startsWith("lista:") ? { lista: s.slice(6) as TipoDeValor } : (s as TipoDeValor));
const paraNome = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9_]+/g, "_");

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-b border-border px-5 py-5 last:border-b-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {children}
    </section>
  );
}

export function PainelDoPasso(p: Props) {
  const { fluxo, selecionado } = p;
  const passo = selecionado === "inicio" || selecionado === "funcoes" ? null : achar(fluxo.corpo, selecionado);
  const meta = passo ? PASSO_POR_TIPO[passo.tipo] : selecionado === "funcoes" ? FUNCOES : INICIO;
  const Icone = meta.icone;
  const idsDasFuncoes = new Set((fluxo.funcoes ?? []).map((f) => f.id).filter(Boolean));
  const erros = p.erros.filter((e) => (passo ? e.bloco === passo.id : selecionado === "funcoes" ? Boolean(e.bloco && idsDasFuncoes.has(e.bloco)) : e.bloco === null));
  const variaveis = fluxo.variaveis ?? [];
  const criarVariavel = (nome: string, tipo: TipoDeValor) =>
    p.mudarFluxo((f) => (f.variaveis ?? []).some((v) => v.nome === nome) ? f : { ...f, variaveis: [...(f.variaveis ?? []), { nome, tipo }] });

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-card" data-testid="painel" aria-label="Configurar o passo">
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg", meta.cor)}><Icone className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-titulo">{meta.nome}</p>
          <p className="text-sm text-muted-foreground">{meta.frase}</p>
        </div>
        <Button size="icon" variant="ghost" aria-label="Fechar o painel" onClick={p.fechar}><X className="h-5 w-5" /></Button>
      </header>
      {erros.length > 0 && (
        <div className="border-b border-destructive/30 bg-destructive/5 px-5 py-3 text-sm text-destructive" role="alert">
          {erros.map((e, i) => <p key={i}>{e.mensagem}</p>)}
        </div>
      )}
      <fieldset disabled={p.somenteLeitura} className="min-h-0 flex-1 overflow-y-auto">
        {passo ? (
          <FormDoPasso c={passo} {...p} variaveis={variaveis} criarVariavel={criarVariavel}
            mudar={(m) => p.mudarPasso(passo.id, m)} />
        ) : selecionado === "funcoes" ? (
          <FormDasFuncoes fluxo={fluxo} mudarFluxo={p.mudarFluxo} />
        ) : (
          <FormDoInicio fluxo={fluxo} mudarFluxo={p.mudarFluxo} />
        )}
      </fieldset>
      {passo && !p.somenteLeitura && <ValoresDinamicos fluxo={fluxo} passoId={passo.id} />}
    </aside>
  );
}

const FUNCOES = { nome: "Funções do fluxo", frase: "Cálculos e comparações com nome, para reaproveitar em qualquer campo pelo botão Calcular.",
                  icone: Calculator, cor: "bg-muted-foreground text-background" };

function achar(lista: Comando[], id: string): Comando | null {
  for (const c of lista) {
    if (c.id === id) return c;
    for (const chave of ["corpo", "senao", "se_falhar"]) {
      const dentro = c[chave];
      if (Array.isArray(dentro)) { const a = achar(dentro as Comando[], id); if (a) return a; }
    }
    for (const chave of ["casos", "opcoes"]) {
      for (const r of (c[chave] as { corpo?: Comando[] }[] | undefined) ?? []) { const a = achar(r.corpo ?? [], id); if (a) return a; }
    }
  }
  return null;
}

// -- formulários por tipo -------------------------------------------------------------------------

type FormProps = Props & { c: Comando; variaveis: Declaracao[]; criarVariavel: (n: string, t: TipoDeValor) => void; mudar: (m: (c: Comando) => Comando) => void };

function FormDoPasso(props: FormProps) {
  const { c, mudar, variaveis, criarVariavel, dados } = props;
  const pega = (k: string) => c[k] as Expr | undefined;
  const poe = (k: string) => (v: unknown) => mudar((x) => {
    const novo = { ...x, [k]: v };
    if (v === undefined) delete novo[k];
    return novo;
  });
  const variavel = (k: string, tipo?: TipoDeValor, permitirNenhuma?: boolean) => (
    <SeletorDeVariavel valor={c[k] as string | undefined} onChange={poe(k)} variaveis={variaveis} tipo={tipo} criar={criarVariavel} permitirNenhuma={permitirNenhuma} />
  );
  const tipoDaVariavel = (nome: unknown) => variaveis.find((v) => v.nome === nome)?.tipo;
  const espera = (t: TipoDeValor | undefined) => (typeof t === "object" ? "lista" : t === "numero" ? "numero" : t === "booleano" ? "booleano" : t === "data" ? "data" : t === "texto" ? "texto" : "qualquer");

  let corpo: ReactNode = null;
  switch (c.tipo) {
    case "executar_automacao":
      corpo = (
        <>
          <Secao titulo="O que rodar">
            <Campo rotulo="Automação"><SeletorDeAutomacao valor={c.automacao as string} onChange={poe("automacao")} dados={dados} /></Campo>
            <Campo rotulo="Itens" ajuda="Opcional. As empresas, arquivos ou códigos que a automação vai processar.">
              <CampoDeValor valor={pega("itens")} espera="lista" onChange={poe("itens")} />
            </Campo>
            <Parametros valor={c.parametros as Record<string, Expr> | undefined} onChange={poe("parametros")} />
          </Secao>
          <Secao titulo="Depois de rodar">
            <Campo rotulo="Guardar o resultado em" ajuda="Guardando, o fluxo segue mesmo com erro e você decide no próximo passo. Sem guardar, um erro para o fluxo.">
              {variavel("guardar_em", "resultado", true)}
            </Campo>
            <NovasTentativas valor={c.novas_tentativas as { ate: number; esperar_segundos?: number } | undefined} onChange={poe("novas_tentativas")} />
          </Secao>
        </>
      );
      break;
    case "dividir_automacao": {
      const modo = (c.modo as "itens" | "fatias") ?? "itens";
      const contagem = c.itens_por_parte !== undefined ? "por_parte" : "partes";
      corpo = (
        <>
          <Secao titulo="O que rodar">
            <Campo rotulo="Automação"><SeletorDeAutomacao valor={c.automacao as string} onChange={poe("automacao")} dados={dados} /></Campo>
            <Campo rotulo="Como dividir" ajuda={modo === "itens" ? "Cada máquina recebe uma parte da lista de itens."
              : "Um único item com muito trabalho (ex.: 50 arquivos de uma empresa): cada máquina faz uma parte. A automação precisa aceitar partes."}>
              <Segmentos valor={modo} onChange={(m) => mudar((x) => ({ ...x, modo: m }))}
                opcoes={[{ valor: "itens", rotulo: "Por itens" }, { valor: "fatias", rotulo: "Por partes do trabalho" }]} />
            </Campo>
            {modo === "itens" ? (
              <Campo rotulo="Itens"><CampoDeValor valor={pega("itens")} espera="lista" onChange={poe("itens")} /></Campo>
            ) : (
              <>
                <Campo rotulo="Item"><CampoDeValor valor={pega("item")} espera="texto" onChange={poe("item")} /></Campo>
                <Campo rotulo="Trabalho a repartir" ajuda="A lista que será dividida entre as máquinas (ex.: os arquivos).">
                  <CampoDeValor valor={pega("fatias")} espera="lista" onChange={poe("fatias")} />
                </Campo>
              </>
            )}
            <Campo rotulo="Quantas partes">
              <Segmentos valor={contagem} onChange={(k) => mudar((x) => {
                const { partes: _p, itens_por_parte: _i, ...resto } = x;
                return (k === "partes" ? { ...resto, partes: 5 } : { ...resto, itens_por_parte: 10 }) as Comando;
              })} opcoes={[{ valor: "partes", rotulo: "Número de partes" }, { valor: "por_parte", rotulo: "Itens por parte" }]} />
              {contagem === "partes"
                ? <Contador rotulo="Partes" valor={Number(c.partes ?? 5)} minimo={2} maximo={50} onChange={poe("partes")} />
                : <Contador rotulo="Itens por parte" valor={Number(c.itens_por_parte ?? 10)} minimo={1} onChange={poe("itens_por_parte")} />}
            </Campo>
            <Parametros valor={c.parametros as Record<string, Expr> | undefined} onChange={poe("parametros")} />
          </Secao>
          <Secao titulo="Depois de rodar">
            <Campo rotulo="Guardar o resultado em" ajuda="O resultado junta todas as partes: o que deu certo, o que falhou e as partes com erro.">
              {variavel("guardar_em", "resultado", true)}
            </Campo>
          </Secao>
        </>
      );
      break;
    }
    case "se": {
      const casos = (c.casos as { condicao: Expr; corpo: Comando[] }[]) ?? [];
      corpo = (
        <Secao titulo="Condições">
          {casos.map((caso, i) => (
            <Campo key={i} rotulo={i === 0 ? "Segue pelo “Sim” quando" : `Senão, segue pela condição ${i + 1} quando`}>
              <CampoDeCondicao valor={caso.condicao} onChange={(v) => mudar((x) => ({ ...x, casos: casos.map((k, n) => (n === i ? { ...k, condicao: v } : k)) }))} />
              {i > 0 && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => mudar((x) => ({ ...x, casos: casos.filter((_, n) => n !== i) }))}>
                  <Trash2 className="h-4 w-4" /> Tirar este caminho
                </Button>
              )}
            </Campo>
          ))}
          <Button size="sm" variant="outline" onClick={() => mudar((x) => ({ ...x, casos: [...casos, { condicao: { tipo: "booleano", valor: true }, corpo: [] }] }))}>
            <Plus className="h-4 w-4" /> Outro caminho (senão se)
          </Button>
        </Secao>
      );
      break;
    }
    case "enquanto":
      corpo = (
        <Secao titulo="Repetir">
          <Segmentos valor={(c.modo as "enquanto" | "ate") ?? "enquanto"} onChange={poe("modo")}
            opcoes={[{ valor: "enquanto", rotulo: "Enquanto for verdade" }, { valor: "ate", rotulo: "Até que seja verdade" }]} />
          <Campo rotulo="Condição" ajuda="O Portal para a repetição no limite de voltas (Governança > Limites).">
            <CampoDeCondicao valor={pega("condicao")} onChange={poe("condicao")} />
          </Campo>
        </Secao>
      );
      break;
    case "repetir_vezes":
      corpo = <Secao titulo="Repetir"><Campo rotulo="Quantas vezes"><CampoDeValor valor={pega("vezes")} espera="numero" onChange={poe("vezes")} /></Campo></Secao>;
      break;
    case "para_cada":
      corpo = (
        <Secao titulo="Repetir">
          <Campo rotulo="Lista" ajuda="Ex.: as empresas da entrada, ou os itens com erro de um resultado.">
            <CampoDeValor valor={pega("lista")} espera="lista" onChange={poe("lista")} />
          </Campo>
          <Campo rotulo="Nome de cada item" ajuda="Dentro da repetição, este nome vale o item da volta atual.">
            <Input value={String(c.variavel ?? "")} onChange={(e) => poe("variavel")(paraNome(e.target.value))} aria-label="Nome de cada item" />
          </Campo>
        </Secao>
      );
      break;
    case "parar_laco": case "proximo":
      corpo = <Secao titulo="Sem configuração"><p className="text-sm text-muted-foreground">Este passo só funciona dentro de uma repetição.</p></Secao>;
      break;
    case "perguntar": {
      const opcoes = (c.opcoes as { rotulo: string; corpo: Comando[] }[]) ?? [];
      corpo = (
        <>
          <Secao titulo="A pergunta">
            <Campo rotulo="Para quem"><SeletorDeDestino valor={c.para as Destino} onChange={poe("para")} times={dados.times} /></Campo>
            <Campo rotulo="Pergunta" ajuda="Aparece em Pendências e no e-mail, com um botão por resposta.">
              <CampoDeValor valor={pega("pergunta")} espera="texto" onChange={poe("pergunta")} />
            </Campo>
          </Secao>
          <Secao titulo="Respostas (cada uma é um caminho)">
            {opcoes.map((o, i) => (
              <div key={i} className="flex gap-2">
                <Input value={o.rotulo} aria-label={`Resposta ${i + 1}`} onChange={(e) => mudar((x) => ({ ...x, opcoes: opcoes.map((k, n) => (n === i ? { ...k, rotulo: e.target.value } : k)) }))} />
                <Button size="icon" variant="ghost" aria-label="Tirar a resposta" disabled={opcoes.length <= 2}
                  onClick={() => mudar((x) => ({ ...x, opcoes: opcoes.filter((_, n) => n !== i) }))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {opcoes.length < 6 && (
              <Button size="sm" variant="outline" onClick={() => mudar((x) => ({ ...x, opcoes: [...opcoes, { rotulo: `Opção ${opcoes.length + 1}`, corpo: [] }] }))}>
                <Plus className="h-4 w-4" /> Outra resposta
              </Button>
            )}
            <Campo rotulo="Guardar a resposta em" ajuda="Opcional: o texto da resposta escolhida.">{variavel("guardar_em", "texto", true)}</Campo>
          </Secao>
        </>
      );
      break;
    }
    case "avisar":
      corpo = (
        <Secao titulo="O aviso">
          <Campo rotulo="Para quem"><SeletorDeDestino valor={c.para as Destino} onChange={poe("para")} times={dados.times} /></Campo>
          <Campo rotulo="Texto"><CampoDeValor valor={pega("texto")} espera="texto" onChange={poe("texto")} /></Campo>
        </Secao>
      );
      break;
    case "definir":
      corpo = (
        <Secao titulo="Guardar">
          <Campo rotulo="Variável">{variavel("variavel")}</Campo>
          <Campo rotulo="Valor"><CampoDeValor valor={pega("valor")} espera={espera(tipoDaVariavel(c.variavel))} onChange={poe("valor")} /></Campo>
        </Secao>
      );
      break;
    case "alterar":
      corpo = (
        <Secao titulo="Somar">
          <Campo rotulo="Variável">{variavel("variavel", "numero")}</Campo>
          <Campo rotulo="Somar" ajuda="Use um número negativo para diminuir."><CampoDeValor valor={pega("por")} espera="numero" onChange={poe("por")} /></Campo>
        </Secao>
      );
      break;
    case "adicionar":
      corpo = (
        <Secao titulo="Adicionar">
          <Campo rotulo="Lista">
            <SeletorDeVariavel valor={c.lista as string | undefined} onChange={poe("lista")} variaveis={variaveis} tipo={{ lista: "qualquer" }}
              criar={(n) => criarVariavel(n, { lista: "texto" })} />
          </Campo>
          <Campo rotulo="Valor"><CampoDeValor valor={pega("valor")} espera="qualquer" onChange={poe("valor")} /></Campo>
        </Secao>
      );
      break;
    case "esperar":
      corpo = <Secao titulo="Esperar"><FormDeEspera c={c} mudar={mudar} /></Secao>;
      break;
    case "registrar":
      corpo = (
        <Secao titulo="Anotação">
          <Campo rotulo="Texto"><CampoDeValor valor={pega("texto")} espera="texto" onChange={poe("texto")} /></Campo>
          <Campo rotulo="Tipo">
            <Segmentos valor={(c.nivel as "info" | "aviso" | "erro") ?? "info"} onChange={poe("nivel")}
              opcoes={[{ valor: "info", rotulo: "Informação" }, { valor: "aviso", rotulo: "Atenção" }, { valor: "erro", rotulo: "Erro" }]} />
          </Campo>
        </Secao>
      );
      break;
    case "tentar":
      corpo = (
        <Secao titulo="Tratar erro">
          <p className="text-sm text-muted-foreground">Coloque os passos em “Tentar”. Se um deles falhar, o fluxo segue por “Se falhar” em vez de parar.</p>
          <Campo rotulo="Guardar o motivo da falha em" ajuda="Opcional.">{variavel("motivo_em", "texto", true)}</Campo>
        </Secao>
      );
      break;
    case "chamar_subfluxo":
      corpo = (
        <Secao titulo="Outro fluxo">
          <Campo rotulo="Fluxo" ajuda="Roda a última versão publicada dele, com as mesmas permissões de quem executou este. Este fluxo espera ele terminar.">
            <Select value={String(c.fluxo ?? "")} onChange={(e) => poe("fluxo")(e.target.value)} aria-label="Fluxo">
              <option value="">Escolha o fluxo</option>
              {dados.fluxos.filter((f) => f.id !== props.fluxoId).map((f) => <option key={f.id} value={f.id} disabled={!f.versao}>{f.nome}{f.versao ? "" : " (nunca publicado)"}</option>)}
            </Select>
          </Campo>
          <EntradasDoSubfluxo alvo={dados.fluxos.find((f) => f.id === c.fluxo)} valor={c.entradas as Record<string, Expr> | undefined} onChange={poe("entradas")} />
          <Campo rotulo="Guardar o resultado em" ajuda="O que o outro fluxo devolve no passo Concluir.">{variavel("guardar_em", "qualquer", true)}</Campo>
        </Secao>
      );
      break;
    case "concluir":
      corpo = (
        <Secao titulo="Concluir">
          <Campo rotulo="Resultado do fluxo" ajuda="Opcional: o que o fluxo devolve (aparece no histórico e para quem chamou).">
            {c.valor ? <CampoDeValor valor={pega("valor")} espera="qualquer" onChange={poe("valor")} />
              : <Button size="sm" variant="outline" onClick={() => poe("valor")({ tipo: "texto", valor: "" })}><Plus className="h-4 w-4" /> Informar um resultado</Button>}
          </Campo>
          {Boolean(c.valor) && <Button size="sm" variant="ghost" onClick={() => poe("valor")(undefined)}>Sem resultado</Button>}
        </Secao>
      );
      break;
    case "falhar":
      corpo = <Secao titulo="Falhar"><Campo rotulo="Motivo"><CampoDeValor valor={pega("motivo")} espera="texto" onChange={poe("motivo")} /></Campo></Secao>;
      break;
  }
  return (
    <>
      {corpo}
      <Secao titulo="Anotação no cartão">
        <Textarea rows={2} value={String(c.comentario ?? "")} placeholder="Opcional: explique para quem ler o fluxo depois."
          onChange={(e) => poe("comentario")(e.target.value || undefined)} aria-label="Anotação" />
      </Secao>
    </>
  );
}

/** As entradas do fluxo chamado (da versão publicada), cada uma com o seu campo. */
function EntradasDoSubfluxo({ alvo, valor, onChange }: { alvo: { id: string; versao: number | null } | undefined; valor: Record<string, Expr> | undefined;
  onChange: (v: Record<string, Expr> | undefined) => void }) {
  const versao = useApi<{ ast: Fluxo }>(alvo?.versao ? `/fluxos/${alvo.id}/versoes/${alvo.versao}` : null);
  const entradas = versao.data?.ast.entradas ?? [];
  if (!alvo) return null;
  if (versao.loading && !versao.data) return <p className="text-sm text-muted-foreground">Lendo as entradas do fluxo…</p>;
  if (!entradas.length) return <p className="text-sm text-muted-foreground">O fluxo escolhido não pede entradas.</p>;
  const atual = valor ?? {};
  const mudar = (nome: string, v: Expr) => onChange({ ...atual, [nome]: v });
  return (
    <>
      {entradas.map((e) => (
        <Campo key={e.nome} rotulo={`${e.rotulo || e.nome}${e.obrigatoria ? " *" : ""}`} ajuda={e.descricao}>
          <CampoDeValor valor={atual[e.nome]} espera={typeof e.tipo === "object" ? "lista" : e.tipo === "numero" ? "numero" : e.tipo === "booleano" ? "booleano" : e.tipo === "data" ? "data" : "texto"}
            onChange={(v) => mudar(e.nome, v)} />
        </Campo>
      ))}
    </>
  );
}

function SeletorDeAutomacao({ valor, onChange, dados }: { valor: string | undefined; onChange: (v: string) => void; dados: DadosDoPortal }) {
  const conhecida = !valor || dados.automacoes.some((a) => a.chave === valor);
  return (
    <Select value={valor ?? ""} onChange={(e) => onChange(e.target.value)} aria-label="Automação">
      <option value="">Escolha a automação</option>
      {!conhecida && <option value={valor}>{valor} (não encontrada)</option>}
      {dados.automacoes.map((a) => <option key={a.chave} value={a.chave}>{a.nome}</option>)}
    </Select>
  );
}

function Parametros({ valor, onChange, rotulo = "Parâmetros" }: { valor: Record<string, Expr> | undefined; onChange: (v: Record<string, Expr> | undefined) => void; rotulo?: string }) {
  const pares = Object.entries(valor ?? {});
  const gravar = (novos: [string, Expr][]) => onChange(novos.length ? Object.fromEntries(novos) : undefined);
  return (
    <Campo rotulo={rotulo} ajuda={pares.length ? undefined : "Opcional. Ex.: competência, pasta de saída."}>
      {pares.map(([nome, v], i) => (
        <div key={i} className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
          <div className="flex gap-2">
            <Input value={nome} aria-label="Nome do parâmetro" placeholder="nome"
              onChange={(e) => gravar(pares.map((par, n) => (n === i ? [paraNome(e.target.value), par[1]] : par)))} />
            <Button size="icon" variant="ghost" aria-label="Tirar o parâmetro" onClick={() => gravar(pares.filter((_, n) => n !== i))}><X className="h-4 w-4" /></Button>
          </div>
          <CampoDeValor valor={v} espera="qualquer" onChange={(novo) => gravar(pares.map((par, n) => (n === i ? [par[0], novo] : par)))} />
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => gravar([...pares, [`parametro_${pares.length + 1}`, { tipo: "texto", valor: "" }]])}>
        <Plus className="h-4 w-4" /> Parâmetro
      </Button>
    </Campo>
  );
}

function NovasTentativas({ valor, onChange }: { valor: { ate: number; esperar_segundos?: number } | undefined; onChange: (v: unknown) => void }) {
  return (
    <Campo rotulo="Se falhar" ajuda={valor ? "Roda de novo só o que falhou, até o número de vezes escolhido." : undefined}>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-primary" checked={Boolean(valor)}
          onChange={(e) => onChange(e.target.checked ? { ate: 2, esperar_segundos: 300 } : undefined)} />
        Tentar de novo automaticamente
      </label>
      {valor && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Contador rotulo="Novas tentativas" valor={valor.ate} minimo={1} maximo={10} onChange={(ate) => onChange({ ...valor, ate })} />
          <span>vezes, esperando</span>
          <Contador rotulo="Minutos entre tentativas" valor={Math.round((valor.esperar_segundos ?? 0) / 60)} minimo={0} maximo={1440}
            onChange={(m) => onChange({ ...valor, esperar_segundos: m * 60 })} />
          <span>minutos</span>
        </div>
      )}
    </Campo>
  );
}

const UNIDADES = [{ valor: 1, rotulo: "segundos" }, { valor: 60, rotulo: "minutos" }, { valor: 3600, rotulo: "horas" }];

function FormDeEspera({ c, mudar }: { c: Comando; mudar: (m: (c: Comando) => Comando) => void }) {
  const porTempo = c.ate === undefined;
  const s = c.segundos as Expr | undefined;
  const fixo = s?.tipo === "numero" ? s.valor : null;
  const unidade = fixo !== null && fixo > 0 ? ([...UNIDADES].reverse().find((u) => fixo % u.valor === 0) ?? UNIDADES[0]).valor : 60;
  return (
    <>
      <Segmentos valor={porTempo ? "tempo" : "ate"} onChange={(m) => mudar((x) => {
        const { segundos: _s, ate: _a, ...resto } = x;
        return (m === "tempo" ? { ...resto, segundos: { tipo: "numero", valor: 300 } } : { ...resto, ate: { tipo: "texto", valor: "" } }) as Comando;
      })} opcoes={[{ valor: "tempo", rotulo: "Por um tempo" }, { valor: "ate", rotulo: "Até uma data" }]} />
      {porTempo ? (
        fixo !== null ? (
          <div className="flex gap-2">
            <Input type="number" min={0} aria-label="Quanto tempo" value={fixo / unidade}
              onChange={(e) => mudar((x) => ({ ...x, segundos: { tipo: "numero", valor: Math.max(0, Number(e.target.value)) * unidade } }))} />
            <Select aria-label="Unidade" value={unidade} onChange={(e) => mudar((x) => ({ ...x, segundos: { tipo: "numero", valor: (fixo / unidade) * Number(e.target.value) } }))}>
              {UNIDADES.map((u) => <option key={u.valor} value={u.valor}>{u.rotulo}</option>)}
            </Select>
          </div>
        ) : <Campo rotulo="Segundos"><CampoDeValor valor={s} espera="numero" onChange={(v) => mudar((x) => ({ ...x, segundos: v }))} /></Campo>
      ) : (
        <Campo rotulo="Data" ajuda="O fluxo fica parado (sem ocupar máquina) até lá.">
          <CampoDeValor valor={c.ate as Expr} espera="data" onChange={(v) => mudar((x) => ({ ...x, ate: v }))} />
        </Campo>
      )}
    </>
  );
}

// -- início: entradas e variáveis -----------------------------------------------------------------

function FormDoInicio({ fluxo, mudarFluxo }: { fluxo: Fluxo; mudarFluxo: Props["mudarFluxo"] }) {
  const entradas = fluxo.entradas ?? [];
  const variaveis = fluxo.variaveis ?? [];
  const mudarEntrada = (i: number, m: Partial<Entrada>) => mudarFluxo((f) => ({ ...f, entradas: (f.entradas ?? []).map((e, n) => (n === i ? { ...e, ...m } : e)) }));
  const mudarVariavel = (i: number, m: Partial<Declaracao>) => mudarFluxo((f) => ({ ...f, variaveis: (f.variaveis ?? []).map((v, n) => (n === i ? { ...v, ...m } : v)) }));
  return (
    <>
      <Secao titulo="Entradas (o que a pessoa preenche ao executar)">
        {entradas.map((e, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border p-3" data-entrada={e.nome}>
            <div className="flex gap-2">
              <Input value={e.rotulo ?? ""} placeholder="Como aparece (ex.: Empresas)" aria-label="Rótulo da entrada"
                onChange={(ev) => mudarEntrada(i, { rotulo: ev.target.value, ...(e.nome.startsWith("entrada_") || !e.nome ? { nome: paraNome(ev.target.value) } : {}) })} />
              <Button size="icon" variant="ghost" aria-label="Tirar a entrada" onClick={() => mudarFluxo((f) => ({ ...f, entradas: (f.entradas ?? []).filter((_, n) => n !== i) }))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input value={e.nome} aria-label="Nome da entrada" onChange={(ev) => mudarEntrada(i, { nome: paraNome(ev.target.value) })} />
              <Select value={tipoParaTexto(e.tipo)} aria-label="Tipo da entrada" onChange={(ev) => mudarEntrada(i, { tipo: textoParaTipo(ev.target.value) })}>
                {TIPOS.filter((t) => t.valor !== "resultado").map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={Boolean(e.obrigatoria)} onChange={(ev) => mudarEntrada(i, { obrigatoria: ev.target.checked })} />
              Obrigatória
            </label>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => mudarFluxo((f) => ({ ...f, entradas: [...(f.entradas ?? []), { nome: `entrada_${entradas.length + 1}`, tipo: "texto", obrigatoria: true }] }))}>
          <Plus className="h-4 w-4" /> Entrada
        </Button>
      </Secao>
      <Secao titulo="Variáveis (valores que o fluxo guarda)">
        {variaveis.map((v, i) => (
          <div key={i} className="flex gap-2" data-variavel={v.nome}>
            <Input value={v.nome} aria-label="Nome da variável" onChange={(ev) => mudarVariavel(i, { nome: paraNome(ev.target.value) })} />
            <Select value={tipoParaTexto(v.tipo)} aria-label="Tipo da variável" onChange={(ev) => mudarVariavel(i, { tipo: textoParaTipo(ev.target.value) })}>
              {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
            </Select>
            <Button size="icon" variant="ghost" aria-label="Tirar a variável" onClick={() => mudarFluxo((f) => ({ ...f, variaveis: (f.variaveis ?? []).filter((_, n) => n !== i) }))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => mudarFluxo((f) => ({ ...f, variaveis: [...(f.variaveis ?? []), { nome: `variavel_${variaveis.length + 1}`, tipo: "texto" }] }))}>
          <Plus className="h-4 w-4" /> Variável
        </Button>
        <p className="text-xs text-muted-foreground">Também dá para criar uma variável direto no passo, em “+ Nova variável…”.</p>
      </Secao>
    </>
  );
}

// -- funções do fluxo -----------------------------------------------------------------------------

function FormDasFuncoes({ fluxo, mudarFluxo }: { fluxo: Fluxo; mudarFluxo: Props["mudarFluxo"] }) {
  const { ativo } = useCampoAtivo();
  const funcoes = fluxo.funcoes ?? [];
  const mudar = (i: number, m: Partial<Funcao>) => mudarFluxo((f) => ({ ...f, funcoes: (f.funcoes ?? []).map((x, n) => (n === i ? { ...x, ...m } : x)) }));
  const nova = () => mudarFluxo((f) => {
    const usados = new Set((f.funcoes ?? []).map((x) => x.nome));
    let n = (f.funcoes ?? []).length + 1;
    while (usados.has(`funcao_${n}`)) n++;
    return { ...f, funcoes: [...(f.funcoes ?? []), { nome: `funcao_${n}`, id: `fn${Math.random().toString(36).slice(2, 8)}`,
      parametros: [{ nome: "valor", tipo: "qualquer" }], tipo_retorno: "booleano", retorno: { tipo: "booleano", valor: true } }] };
  });
  return (
    <Secao titulo="Funções">
      {funcoes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma função ainda. Uma função recebe valores e devolve um cálculo ou uma comparação; depois é só usar no botão Calcular de qualquer campo.</p>}
      {funcoes.map((f, i) => {
        const tipo = f.tipo_retorno ?? "qualquer";
        return (
          <div key={f.id ?? i} className="space-y-3 rounded-lg border border-border p-3" data-funcao-do-fluxo={f.nome}>
            <div className="flex gap-2">
              <Input value={f.nome} aria-label="Nome da função" onChange={(e) => mudar(i, { nome: paraNome(e.target.value) })} />
              <Button size="icon" variant="ghost" aria-label="Apagar a função" onClick={() => mudarFluxo((x) => ({ ...x, funcoes: (x.funcoes ?? []).filter((_, n) => n !== i) }))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Campo rotulo="Recebe">
              {f.parametros.map((p, k) => (
                <div key={k} className="flex gap-2">
                  <Input value={p.nome} aria-label="Nome do valor recebido" onChange={(e) => mudar(i, { parametros: f.parametros.map((x, n) => (n === k ? { ...x, nome: paraNome(e.target.value) } : x)) })} />
                  <Select value={tipoParaTexto(p.tipo)} aria-label="Tipo do valor recebido" onChange={(e) => mudar(i, { parametros: f.parametros.map((x, n) => (n === k ? { ...x, tipo: textoParaTipo(e.target.value) } : x)) })}>
                    {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                  </Select>
                  <Button size="icon" variant="ghost" aria-label="Tirar o valor recebido" onClick={() => mudar(i, { parametros: f.parametros.filter((_, n) => n !== k) })}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => mudar(i, { parametros: [...f.parametros, { nome: `valor_${f.parametros.length + 1}`, tipo: "qualquer" }] })}>
                <Plus className="h-4 w-4" /> Valor recebido
              </Button>
            </Campo>
            <Campo rotulo="Devolve">
              <Select value={tipoParaTexto(tipo)} aria-label="Tipo devolvido" onChange={(e) => {
                const t = textoParaTipo(e.target.value);
                mudar(i, { tipo_retorno: t, ...(t === "booleano" && tipo !== "booleano" ? { retorno: { tipo: "booleano", valor: true } } : {}) });
              }}>
                {TIPOS.filter((t) => t.valor !== "resultado").map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
              </Select>
            </Campo>
            <Campo rotulo={tipo === "booleano" ? "Verdadeiro quando" : "Valor devolvido"}>
              {tipo === "booleano"
                ? <CampoDeCondicao valor={f.retorno} onChange={(v) => mudar(i, { retorno: v })} />
                : <CampoDeValor valor={f.retorno} espera="qualquer" onChange={(v) => mudar(i, { retorno: v })} />}
            </Campo>
            {f.parametros.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">{ativo ? "Clique para usar no campo selecionado:" : "Valores recebidos (clique num campo e depois aqui):"}</p>
                <div className="flex flex-wrap gap-1.5">
                  {f.parametros.map((p) => (
                    <button key={p.nome} type="button" disabled={!ativo} onMouseDown={(e) => e.preventDefault()} onClick={() => ativo?.aplicar({ tipo: "var", nome: p.nome })}
                      className="rounded-md disabled:opacity-50" data-ficha={`p:${f.nome}:${p.nome}`}>
                      <Ficha>{p.nome}</Ficha>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
      <Button size="sm" variant="outline" onClick={nova}><Plus className="h-4 w-4" /> Nova função</Button>
    </Secao>
  );
}

// -- valores dinâmicos ----------------------------------------------------------------------------

function ValoresDinamicos({ fluxo, passoId }: { fluxo: Fluxo; passoId: string }) {
  const { ativo } = useCampoAtivo();
  const laco = variaveisDoLaco(fluxo, passoId) ?? [];
  type FichaDinamica = { rotulo: ReactNode; chave: string; expr: Expr };
  const grupos: { titulo: string; fichas: FichaDinamica[] }[] = [
    { titulo: "Entradas", fichas: (fluxo.entradas ?? []).map((e): FichaDinamica => ({ chave: `e:${e.nome}`, rotulo: e.rotulo || e.nome, expr: { tipo: "entrada", nome: e.nome } })) },
    { titulo: "Item da repetição", fichas: laco.map((n): FichaDinamica => ({ chave: `l:${n}`, rotulo: n, expr: { tipo: "var", nome: n } })) },
    { titulo: "Variáveis", fichas: (fluxo.variaveis ?? []).flatMap((v): FichaDinamica[] => v.tipo === "resultado"
      ? CAMPOS_DO_RESULTADO.map((c) => ({ chave: `r:${v.nome}:${c.campo}`, rotulo: <>{c.rotulo} <span className="font-normal opacity-70">de {v.nome}</span></>,
          expr: { tipo: "campo", de: { tipo: "var", nome: v.nome }, campo: c.campo } as Expr }))
      : [{ chave: `v:${v.nome}`, rotulo: v.nome, expr: { tipo: "var", nome: v.nome } as Expr }]) },
  ].filter((g) => g.fichas.length);
  return (
    <div className="max-h-[38%] shrink-0 overflow-y-auto border-t border-border bg-muted/30 px-5 py-4" data-testid="valores-dinamicos">
      <p className="text-sm font-semibold text-titulo">Valores dinâmicos</p>
      <p className="mb-3 text-xs text-muted-foreground">{ativo ? "Clique para usar no campo selecionado." : "Clique num campo acima e depois num valor."}</p>
      {grupos.length === 0 && <p className="text-xs text-muted-foreground">Crie entradas no início do fluxo ou guarde resultados em variáveis para usar aqui.</p>}
      {grupos.map((g) => (
        <div key={g.titulo} className="mb-3 last:mb-0">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{g.titulo}</p>
          <div className="flex flex-wrap gap-1.5">
            {g.fichas.map((f) => (
              <button key={f.chave} type="button" disabled={!ativo} onMouseDown={(e) => e.preventDefault()} onClick={() => ativo?.aplicar(f.expr)}
                className="rounded-md transition-opacity disabled:opacity-50" data-ficha={f.chave}>
                <Ficha>{f.rotulo}</Ficha>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
