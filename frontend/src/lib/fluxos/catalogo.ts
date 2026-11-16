import {
  Bell, Bot, CircleX, Clock, Flag, GitBranch, GitFork, List, ListPlus, MessageCircleQuestion, NotebookPen, Play, Plus,
  Repeat, Shield, SquareStack, Variable, type LucideIcon,
} from "lucide-react";

import type { Comando, TipoDeComando } from "@/lib/fluxos/tipos";

/**
 * O que o editor oferece em "Adicionar um passo": nome, ícone, grupo, a frase didática e o passo novo.
 * Cor só no quadrado do ícone, por token (claro e escuro): regra "Fluxos: editor em cartões" do design system.
 */

export type Grupo = "Automações" | "Decidir" | "Repetir" | "Pessoas" | "Dados" | "Fim";
export const GRUPOS: Grupo[] = ["Automações", "Decidir", "Repetir", "Pessoas", "Dados", "Fim"];

export type Passo = { tipo: TipoDeComando; nome: string; frase: string; icone: LucideIcon; cor: string; grupo: Grupo;
  novo: () => Omit<Comando, "id"> };

const COR = {
  automacao: "bg-primary text-primary-foreground",
  decidir: "bg-info text-info-foreground",
  estrutura: "bg-foreground text-background",
  pessoas: "bg-warning text-warning-foreground",
  dados: "bg-primary/70 text-primary-foreground",
  apoio: "bg-muted-foreground text-background",
  fim: "bg-success text-success-foreground",
  erro: "bg-destructive text-destructive-foreground",
};

const VAZIO = { tipo: "texto", valor: "" } as const;

export const PASSOS: Passo[] = [
  { tipo: "executar_automacao", nome: "Executar automação", icone: Bot, cor: COR.automacao, grupo: "Automações",
    frase: "Põe uma automação na fila e espera terminar.", novo: () => ({ tipo: "executar_automacao", automacao: "" }) },
  { tipo: "dividir_automacao", nome: "Dividir automação entre máquinas", icone: GitFork, cor: COR.automacao, grupo: "Automações",
    frase: "Reparte o trabalho e roda em várias máquinas ao mesmo tempo.",
    novo: () => ({ tipo: "dividir_automacao", automacao: "", modo: "itens", partes: 5 }) },
  { tipo: "se", nome: "Condição", icone: GitBranch, cor: COR.decidir, grupo: "Decidir",
    frase: "Segue por um caminho se algo for verdade, e por outro se não for.",
    novo: () => ({ tipo: "se", casos: [{ condicao: { tipo: "booleano", valor: true }, corpo: [] }], senao: [] }) },
  { tipo: "para_cada", nome: "Para cada item", icone: List, cor: COR.estrutura, grupo: "Repetir",
    frase: "Faz os passos de dentro para cada item de uma lista.",
    novo: () => ({ tipo: "para_cada", variavel: "item", lista: { tipo: "lista", itens: [] }, corpo: [] }) },
  { tipo: "repetir_vezes", nome: "Repetir um número de vezes", icone: Repeat, cor: COR.estrutura, grupo: "Repetir",
    frase: "Faz os passos de dentro N vezes.", novo: () => ({ tipo: "repetir_vezes", vezes: { tipo: "numero", valor: 3 }, corpo: [] }) },
  { tipo: "enquanto", nome: "Repetir enquanto", icone: Repeat, cor: COR.estrutura, grupo: "Repetir",
    frase: "Repete os passos de dentro enquanto a condição for verdade.",
    novo: () => ({ tipo: "enquanto", modo: "enquanto", condicao: { tipo: "booleano", valor: false }, corpo: [] }) },
  { tipo: "parar_laco", nome: "Parar a repetição", icone: CircleX, cor: COR.estrutura, grupo: "Repetir",
    frase: "Sai da repetição em que está.", novo: () => ({ tipo: "parar_laco" }) },
  { tipo: "proximo", nome: "Pular para o próximo", icone: Play, cor: COR.estrutura, grupo: "Repetir",
    frase: "Vai direto para a próxima volta da repetição.", novo: () => ({ tipo: "proximo" }) },
  { tipo: "perguntar", nome: "Perguntar a uma pessoa", icone: MessageCircleQuestion, cor: COR.pessoas, grupo: "Pessoas",
    frase: "Para o fluxo, avisa e segue pelo caminho que a pessoa escolher.",
    novo: () => ({ tipo: "perguntar", para: { tipo: "quem_executou" }, pergunta: { ...VAZIO },
                   opcoes: [{ rotulo: "Sim", corpo: [] }, { rotulo: "Não", corpo: [] }] }) },
  { tipo: "avisar", nome: "Avisar", icone: Bell, cor: COR.pessoas, grupo: "Pessoas",
    frase: "Manda um aviso no sino e por e-mail.", novo: () => ({ tipo: "avisar", para: { tipo: "quem_executou" }, texto: { ...VAZIO } }) },
  { tipo: "definir", nome: "Guardar um valor", icone: Variable, cor: COR.dados, grupo: "Dados",
    frase: "Guarda um número, texto ou lista numa variável.", novo: () => ({ tipo: "definir", variavel: "", valor: { ...VAZIO } }) },
  { tipo: "alterar", nome: "Somar à variável", icone: Plus, cor: COR.dados, grupo: "Dados",
    frase: "Aumenta (ou diminui) um contador.", novo: () => ({ tipo: "alterar", variavel: "", por: { tipo: "numero", valor: 1 } }) },
  { tipo: "adicionar", nome: "Adicionar à lista", icone: ListPlus, cor: COR.dados, grupo: "Dados",
    frase: "Põe um item no fim de uma lista.", novo: () => ({ tipo: "adicionar", lista: "", valor: { ...VAZIO } }) },
  { tipo: "esperar", nome: "Esperar", icone: Clock, cor: COR.apoio, grupo: "Dados",
    frase: "Pausa o fluxo por um tempo ou até um horário.", novo: () => ({ tipo: "esperar", segundos: { tipo: "numero", valor: 300 } }) },
  { tipo: "registrar", nome: "Anotar no histórico", icone: NotebookPen, cor: COR.apoio, grupo: "Dados",
    frase: "Escreve uma linha na linha do tempo do fluxo.", novo: () => ({ tipo: "registrar", texto: { ...VAZIO }, nivel: "info" }) },
  { tipo: "chamar_subfluxo", nome: "Chamar outro fluxo", icone: SquareStack, cor: COR.dados, grupo: "Dados",
    frase: "Reaproveita um fluxo publicado como um passo.", novo: () => ({ tipo: "chamar_subfluxo", fluxo: "", entradas: {} }) },
  { tipo: "tentar", nome: "Tentar e tratar erro", icone: Shield, cor: COR.estrutura, grupo: "Fim",
    frase: "Se algo dentro falhar, segue pelo caminho de tratamento.", novo: () => ({ tipo: "tentar", corpo: [], se_falhar: [] }) },
  { tipo: "concluir", nome: "Concluir", icone: Flag, cor: COR.fim, grupo: "Fim",
    frase: "Termina o fluxo com um resultado.", novo: () => ({ tipo: "concluir" }) },
  { tipo: "falhar", nome: "Falhar", icone: CircleX, cor: COR.erro, grupo: "Fim",
    frase: "Termina o fluxo como falha, com o motivo.", novo: () => ({ tipo: "falhar", motivo: { ...VAZIO } }) },
];

export const PASSO_POR_TIPO = Object.fromEntries(PASSOS.map((p) => [p.tipo, p])) as Record<TipoDeComando, Passo>;
export const INICIO = { nome: "Quando o fluxo começar", frase: "Primeiro passo. Aqui ficam as entradas que a pessoa preenche ao executar.",
                        icone: Play, cor: COR.fim };
