import type { Comando, Fluxo } from "@/lib/fluxos/tipos";

/**
 * Operações sobre a árvore do fluxo. Tudo imutável (devolve um fluxo novo): o desfazer e refazer do
 * editor é só a lista de versões. Um lugar na árvore é um **caminho** até uma lista de passos
 * (`["corpo"]`, `["corpo", 3, "casos", 0, "corpo"]`) e um índice nela.
 */

export type Caminho = (string | number)[];
export type Lugar = { lista: Caminho; indice: number };
export type Corpo = { rotulo: string; caminho: Caminho; tom?: "sim" | "nao" | "erro" | "neutro" };

/** As listas de passos que um passo tem dentro (ramos e corpos), na ordem em que aparecem. */
export function corposDe(c: Comando, base: Caminho = []): Corpo[] {
  switch (c.tipo) {
    case "se": {
      const casos = (c.casos as { corpo: Comando[] }[]) ?? [];
      return [
        ...casos.map((_, i) => ({ rotulo: casos.length > 1 ? `Se (condição ${i + 1})` : "Sim", caminho: [...base, "casos", i, "corpo"], tom: "sim" as const })),
        { rotulo: casos.length > 1 ? "Senão" : "Não", caminho: [...base, "senao"], tom: "neutro" as const },
      ];
    }
    case "repetir_vezes": case "enquanto": case "para_cada":
      return [{ rotulo: "Faça", caminho: [...base, "corpo"] }];
    case "tentar":
      return [{ rotulo: "Tentar", caminho: [...base, "corpo"] }, { rotulo: "Se falhar", caminho: [...base, "se_falhar"], tom: "erro" }];
    case "perguntar":
      return ((c.opcoes as { rotulo: string }[]) ?? []).map((o, i) => ({
        rotulo: `Se responder “${o.rotulo}”`, caminho: [...base, "opcoes", i, "corpo"], tom: i === 0 ? "sim" as const : "neutro" as const }));
    default:
      return [];
  }
}

export function ler(fluxo: Fluxo, caminho: Caminho): unknown {
  let no: unknown = fluxo;
  for (const passo of caminho) no = (no as Record<string | number, unknown> | undefined)?.[passo];
  return no;
}

function lista(fluxo: Fluxo, caminho: Caminho): Comando[] {
  const achada = ler(fluxo, caminho);
  return Array.isArray(achada) ? (achada as Comando[]) : [];
}

function comLista(fluxo: Fluxo, caminho: Caminho, mudar: (itens: Comando[]) => Comando[]): Fluxo {
  const copia = structuredClone(fluxo) as Fluxo;
  let pai: Record<string | number, unknown> = copia as unknown as Record<string, unknown>;
  for (const passo of caminho.slice(0, -1)) pai = pai[passo] as Record<string | number, unknown>;
  const ultimo = caminho[caminho.length - 1];
  pai[ultimo] = mudar(Array.isArray(pai[ultimo]) ? (pai[ultimo] as Comando[]) : []);
  return copia;
}

export function acharLugar(fluxo: Fluxo, id: string, base: Caminho = ["corpo"]): Lugar | null {
  const itens = lista(fluxo, base);
  for (let i = 0; i < itens.length; i++) {
    if (itens[i].id === id) return { lista: base, indice: i };
    for (const corpo of corposDe(itens[i], [...base, i])) {
      const achado = acharLugar(fluxo, id, corpo.caminho);
      if (achado) return achado;
    }
  }
  return null;
}

export function acharPasso(fluxo: Fluxo, id: string): Comando | null {
  const lugar = acharLugar(fluxo, id);
  return lugar ? lista(fluxo, lugar.lista)[lugar.indice] ?? null : null;
}

export function todosOsIds(fluxo: Fluxo, base: Caminho = ["corpo"]): string[] {
  return lista(fluxo, base).flatMap((c, i) => [c.id, ...corposDe(c, [...base, i]).flatMap((k) => todosOsIds(fluxo, k.caminho))]);
}

export function novoId(fluxo: Fluxo, usados: Set<string> = new Set(todosOsIds(fluxo))): string {
  for (;;) {
    const id = `b${Math.random().toString(36).slice(2, 8)}`;
    if (!usados.has(id)) {
      usados.add(id);
      return id;
    }
  }
}

export function inserir(fluxo: Fluxo, lugar: Lugar, passo: Omit<Comando, "id">): { fluxo: Fluxo; id: string } {
  const id = novoId(fluxo);
  return { fluxo: comLista(fluxo, lugar.lista, (itens) => [...itens.slice(0, lugar.indice), { ...passo, id } as Comando, ...itens.slice(lugar.indice)]), id };
}

export function atualizar(fluxo: Fluxo, id: string, mudar: (passo: Comando) => Comando): Fluxo {
  const lugar = acharLugar(fluxo, id);
  if (!lugar) return fluxo;
  return comLista(fluxo, lugar.lista, (itens) => itens.map((c, i) => (i === lugar.indice ? mudar(c) : c)));
}

export function remover(fluxo: Fluxo, id: string): Fluxo {
  const lugar = acharLugar(fluxo, id);
  if (!lugar) return fluxo;
  return comLista(fluxo, lugar.lista, (itens) => itens.filter((_, i) => i !== lugar.indice));
}

export function mover(fluxo: Fluxo, id: string, delta: -1 | 1): Fluxo {
  const lugar = acharLugar(fluxo, id);
  if (!lugar) return fluxo;
  const destino = lugar.indice + delta;
  return comLista(fluxo, lugar.lista, (itens) => {
    if (destino < 0 || destino >= itens.length) return itens;
    const novos = [...itens];
    [novos[lugar.indice], novos[destino]] = [novos[destino], novos[lugar.indice]];
    return novos;
  });
}

/** Arrastar: tira o passo de onde está e põe no lugar escolhido. Não deixa soltar um passo dentro dele mesmo. */
export function moverPara(fluxo: Fluxo, id: string, destino: Lugar): Fluxo {
  const origem = acharLugar(fluxo, id);
  if (!origem) return fluxo;
  const dentroDeSi = [...origem.lista, origem.indice];
  if (destino.lista.length >= dentroDeSi.length && dentroDeSi.every((p, i) => destino.lista[i] === p)) return fluxo;
  const passo = lista(fluxo, origem.lista)[origem.indice];
  const mesmaLista = origem.lista.length === destino.lista.length && origem.lista.every((p, i) => destino.lista[i] === p);
  let indice = destino.indice;
  if (mesmaLista) {
    if (indice === origem.indice || indice === origem.indice + 1) return fluxo;
    if (indice > origem.indice) indice -= 1;
  }
  // Tirar o passo desloca os irmãos de baixo: um destino dentro de um deles muda de índice.
  const caminho = [...destino.lista];
  const n = origem.lista.length;
  if (!mesmaLista && caminho.length > n && origem.lista.every((p, i) => caminho[i] === p) && Number(caminho[n]) > origem.indice) {
    caminho[n] = Number(caminho[n]) - 1;
  }
  const sem = comLista(fluxo, origem.lista, (itens) => itens.filter((_, i) => i !== origem.indice));
  return comLista(sem, caminho, (itens) => [...itens.slice(0, indice), passo, ...itens.slice(indice)]);
}

/** Cópia logo abaixo do original, com ids novos em tudo o que estiver dentro. */
export function duplicar(fluxo: Fluxo, id: string): { fluxo: Fluxo; id: string } {
  const lugar = acharLugar(fluxo, id);
  const original = lugar ? lista(fluxo, lugar.lista)[lugar.indice] : null;
  if (!lugar || !original) return { fluxo, id };
  const usados = new Set(todosOsIds(fluxo));
  const reidentificar = (c: Comando): Comando => {
    const copia = structuredClone(c) as Comando;
    copia.id = novoId(fluxo, usados);
    for (const corpo of corposDe(copia)) {
      const itens = ler(copia as unknown as Fluxo, corpo.caminho) as Comando[] | undefined;
      if (Array.isArray(itens)) itens.splice(0, itens.length, ...itens.map(reidentificar));
    }
    return copia;
  };
  const copia = reidentificar(original);
  return { fluxo: comLista(fluxo, lugar.lista, (itens) => [...itens.slice(0, lugar.indice + 1), copia, ...itens.slice(lugar.indice + 1)]), id: copia.id };
}

/** Variáveis de laço ("para cada") que valem dentro do passo `id`. */
export function variaveisDoLaco(fluxo: Fluxo, id: string, base: Caminho = ["corpo"], acima: string[] = []): string[] | null {
  const itens = lista(fluxo, base);
  for (let i = 0; i < itens.length; i++) {
    const c = itens[i];
    if (c.id === id) return acima;
    const aqui = c.tipo === "para_cada" && typeof c.variavel === "string" ? [...acima, c.variavel] : acima;
    for (const corpo of corposDe(c, [...base, i])) {
      const achado = variaveisDoLaco(fluxo, id, corpo.caminho, aqui);
      if (achado) return achado;
    }
  }
  return null;
}
