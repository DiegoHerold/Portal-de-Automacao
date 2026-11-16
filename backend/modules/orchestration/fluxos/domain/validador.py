"""Validação de um fluxo em blocos (contrato ``contracts/flows/v1``).

Duas camadas:
1. **Estrutura**: o JSON Schema do contrato (o mesmo que o frontend usa).
2. **Sentido**: variável e entrada declaradas, tipo certo em cada encaixe, laço sem saída,
   ``parar_laco``/``proximo`` fora de laço, funções (aridade, recursão), automação e subfluxo
   existentes, chamada circular entre fluxos e o limite de blocos.

Cada erro aponta o bloco (``bloco`` = id do nó mais próximo), para o editor marcar no lugar certo.
Ler uma variável declarada antes de definir devolve ``nulo`` (não é erro).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Protocol

from jsonschema import Draft202012Validator

SCHEMA_PATH = Path(__file__).resolve().parents[5] / "contracts" / "flows" / "v1" / "fluxo.schema.json"

QUALQUER = "qualquer"
# Campos do resultado de "executar automação" / "dividir automação" (a Fase 4 preenche).
CAMPOS_DO_RESULTADO: dict[str, Any] = {
    "situacao": "texto", "motivo": "texto", "total_ok": "numero", "total_com_erro": "numero",
    "itens_ok": {"lista": "texto"}, "itens_com_erro": {"lista": "texto"}, "fatias_com_erro": {"lista": "texto"},
    "partes_com_erro": {"lista": "objeto"}, "arquivos": {"lista": "objeto"}, "execucao": "texto",
    "itens_em_atencao": {"lista": "texto"},
}
OPS_NUMERICOS = {"+", "-", "*", "/", "%"}
OPS_ORDEM = {"<", "<=", ">", ">="}
OPS_LOGICOS = {"e", "ou"}


@dataclass(frozen=True)
class Erro:
    bloco: str | None
    mensagem: str
    campo: str | None = None

    def para_api(self) -> dict[str, Any]:
        return {"bloco": self.bloco, "campo": self.campo, "mensagem": self.mensagem}


class Contexto(Protocol):
    """O que o validador precisa saber do resto do Portal."""

    max_blocos: int

    def automacao_existe(self, chave: str) -> bool: ...

    def subfluxo(self, fluxo_id: str) -> tuple[bool, set[str]]:
        """(tem versão publicada?, ids dos fluxos que a última versão publicada chama)."""
        ...


@lru_cache(maxsize=1)
def _schema_validator() -> Draft202012Validator:
    return Draft202012Validator(json.loads(SCHEMA_PATH.read_text(encoding="utf-8")))


# ------------------------------------------------------------------ tipos

def _texto_do_tipo(tipo: Any) -> str:
    return f"lista de {_texto_do_tipo(tipo['lista'])}" if isinstance(tipo, dict) else str(tipo)


def compativel(esperado: Any, recebido: Any) -> bool:
    if esperado == QUALQUER or recebido == QUALQUER:
        return True
    if isinstance(esperado, dict) and isinstance(recebido, dict):
        return compativel(esperado["lista"], recebido["lista"])
    if isinstance(esperado, dict) or isinstance(recebido, dict):
        return False
    return esperado == recebido


def _eh_lista(tipo: Any) -> bool:
    return tipo == QUALQUER or isinstance(tipo, dict)


def _interno(tipo: Any) -> Any:
    return tipo["lista"] if isinstance(tipo, dict) else QUALQUER


# nome -> (mínimo de args, máximo, tipos dos args ("lista|texto" aceita os dois), retorno ou função)
FUNCOES_PRONTAS: dict[str, tuple[int, int, tuple[Any, ...], Any]] = {
    "tamanho": (1, 1, ("lista|texto",), "numero"),
    "vazio": (1, 1, (QUALQUER,), "booleano"),
    "contem": (2, 2, ("lista|texto", QUALQUER), "booleano"),
    "juntar_texto": (1, 10, ("texto",) * 10, "texto"),
    "substituir": (3, 3, ("texto", "texto", "texto"), "texto"),
    "dividir_texto": (2, 2, ("texto", "texto"), {"lista": "texto"}),
    "maiusculas": (1, 1, ("texto",), "texto"),
    "minusculas": (1, 1, ("texto",), "texto"),
    "arredondar": (1, 2, ("numero", "numero"), "numero"),
    "minimo": (1, 10, ("numero|lista",) * 10, "numero"),
    "maximo": (1, 10, ("numero|lista",) * 10, "numero"),
    "soma": (1, 1, ({"lista": "numero"},), "numero"),
    "absoluto": (1, 1, ("numero",), "numero"),
    "hoje": (0, 0, (), "data"),
    "agora": (0, 0, (), "data"),
    "somar_dias": (2, 2, ("data", "numero"), "data"),
    "competencia": (1, 1, ("data",), "texto"),
    "formatar_data": (2, 2, ("data", "texto"), "texto"),
    "primeiro": (1, 1, ("lista",), lambda args: _interno(args[0])),
    "ultimo": (1, 1, ("lista",), lambda args: _interno(args[0])),
    "dividir_em_partes": (2, 2, ("lista", "numero"), lambda args: {"lista": args[0] if _eh_lista(args[0]) else QUALQUER}),
    "sem_repetidos": (1, 1, ("lista",), lambda args: args[0]),
    "para_texto": (1, 1, (QUALQUER,), "texto"),
    "para_numero": (1, 1, (QUALQUER,), "numero"),
}


def _aceita(espera: Any, tipo: Any) -> bool:
    if espera in (QUALQUER,):
        return True
    if espera == "lista":
        return _eh_lista(tipo)
    if espera == "lista|texto":
        return _eh_lista(tipo) or compativel("texto", tipo)
    if espera == "numero|lista":
        return _eh_lista(tipo) or compativel("numero", tipo)
    return compativel(espera, tipo)


# ------------------------------------------------------------------ validador

@dataclass
class _Estado:
    erros: list[Erro] = field(default_factory=list)
    ids: set[str] = field(default_factory=set)
    blocos: int = 0
    subfluxos: set[str] = field(default_factory=set)


class Validador:
    def __init__(self, contexto: Contexto, fluxo_id: str | None = None) -> None:
        self.contexto = contexto
        self.fluxo_id = fluxo_id

    def validar(self, ast: Any) -> list[Erro]:
        if not isinstance(ast, dict):
            return [Erro(None, "O fluxo precisa ser um objeto JSON.")]
        estruturais = self._estrutura(ast)
        if estruturais:
            return estruturais
        e = _Estado()
        self._estado = e
        self.funcoes = {f["nome"]: f for f in ast.get("funcoes", [])}
        self.entradas = {i["nome"]: i["tipo"] for i in ast.get("entradas", [])}
        globais: dict[str, Any] = {}
        for lista, rotulo in ((ast.get("entradas", []), "entrada"), (ast.get("variaveis", []), "variável"),
                              (ast.get("funcoes", []), "função")):
            vistos: set[str] = set()
            for decl in lista:
                if decl["nome"] in vistos:
                    e.erros.append(Erro(decl.get("id"), f"{rotulo.capitalize()} {decl['nome']} repetida."))
                vistos.add(decl["nome"])
        for decl in ast.get("variaveis", []):
            if decl["nome"] in self.entradas:
                e.erros.append(Erro(None, f"A variável {decl['nome']} tem o mesmo nome de uma entrada."))
            globais[decl["nome"]] = decl["tipo"]
        self._funcoes()
        self._corpo(ast["corpo"], globais, em_laco=False)
        if e.blocos > self.contexto.max_blocos:
            e.erros.append(Erro(None, f"O fluxo tem {e.blocos} blocos; o limite é {self.contexto.max_blocos} "
                                      "(Governança > Limites)."))
        self._subfluxos()
        return e.erros

    # -- estrutura -----------------------------------------------------------------------
    def _estrutura(self, ast: dict[str, Any]) -> list[Erro]:
        saida: list[Erro] = []
        vistos: set[tuple[str | None, str]] = set()
        for erro in sorted(_schema_validator().iter_errors(ast), key=lambda x: list(x.absolute_path)):
            if erro.validator in ("if", "allOf", "then"):
                continue
            bloco, campo = _bloco_do_caminho(ast, list(erro.absolute_path))
            if erro.validator == "required" and "'" in erro.message:
                campo = erro.message.split("'")[1]
            item = (bloco, _mensagem_do_schema(erro))
            if item not in vistos:
                vistos.add(item)
                saida.append(Erro(bloco, item[1], campo))
        return saida[:50]

    # -- comandos ------------------------------------------------------------------------
    def _corpo(self, corpo: list[dict[str, Any]], escopo: dict[str, Any], em_laco: bool) -> None:
        for comando in corpo:
            self._comando(comando, escopo, em_laco)

    def _id(self, no: dict[str, Any]) -> None:
        self._estado.blocos += 1
        ident = no.get("id")
        if ident is None:
            return
        if ident in self._estado.ids:
            self._estado.erros.append(Erro(ident, f"O id {ident} aparece em mais de um bloco."))
        self._estado.ids.add(ident)

    def _erro(self, no: dict[str, Any], mensagem: str, campo: str | None = None) -> None:
        self._estado.erros.append(Erro(no.get("id"), mensagem, campo))

    def _var_declarada(self, no: dict[str, Any], nome: str, escopo: dict[str, Any], campo: str) -> Any | None:
        if nome not in escopo:
            self._erro(no, f"A variável {nome} não foi criada (declare em Variáveis).", campo)
            return None
        return escopo[nome]

    def _guardar(self, no: dict[str, Any], escopo: dict[str, Any], tipo: Any) -> None:
        nome = no.get("guardar_em")
        if nome is None:
            return
        atual = self._var_declarada(no, nome, escopo, "guardar_em")
        if atual is not None and not compativel(atual, tipo):
            self._erro(no, f"A variável {nome} é {_texto_do_tipo(atual)}, mas recebe {_texto_do_tipo(tipo)}.", "guardar_em")

    def _comando(self, c: dict[str, Any], escopo: dict[str, Any], em_laco: bool) -> None:
        self._id(c)
        tipo = c["tipo"]
        if tipo == "definir":
            alvo = self._var_declarada(c, c["variavel"], escopo, "variavel")
            valor = self._expr(c["valor"], escopo)
            if alvo is not None and not compativel(alvo, valor):
                self._erro(c, f"A variável {c['variavel']} é {_texto_do_tipo(alvo)}, mas o valor é {_texto_do_tipo(valor)}.", "valor")
        elif tipo == "alterar":
            alvo = self._var_declarada(c, c["variavel"], escopo, "variavel")
            if alvo is not None and not compativel("numero", alvo):
                self._erro(c, f"Só dá para alterar por um valor uma variável numérica ({c['variavel']} é {_texto_do_tipo(alvo)}).")
            self._espera(c, c["por"], escopo, "numero", "por")
        elif tipo == "adicionar":
            alvo = self._var_declarada(c, c["lista"], escopo, "lista")
            valor = self._expr(c["valor"], escopo)
            if alvo is not None and not _eh_lista(alvo):
                self._erro(c, f"{c['lista']} não é uma lista.", "lista")
            elif alvo is not None and not compativel(_interno(alvo), valor):
                self._erro(c, f"A lista {c['lista']} guarda {_texto_do_tipo(_interno(alvo))}, mas o valor é {_texto_do_tipo(valor)}.", "valor")
        elif tipo == "se":
            for caso in c["casos"]:
                self._espera(c, caso["condicao"], escopo, "booleano", "condicao")
                self._corpo(caso["corpo"], escopo, em_laco)
            self._corpo(c.get("senao", []), escopo, em_laco)
        elif tipo == "repetir_vezes":
            self._espera(c, c["vezes"], escopo, "numero", "vezes")
            self._corpo(c["corpo"], escopo, True)
        elif tipo == "enquanto":
            self._espera(c, c["condicao"], escopo, "booleano", "condicao")
            fixa = c["condicao"].get("valor") if c["condicao"]["tipo"] == "booleano" else None
            sem_fim = fixa is True if c.get("modo", "enquanto") == "enquanto" else fixa is False
            if sem_fim and not _tem_saida(c["corpo"]):
                self._erro(c, "Este laço nunca termina: a condição é fixa e não há 'parar laço', 'concluir' ou 'falhar' dentro.")
            self._corpo(c["corpo"], escopo, True)
        elif tipo == "para_cada":
            lista = self._expr(c["lista"], escopo)
            if not _eh_lista(lista):
                self._erro(c, f"'Para cada' precisa de uma lista (recebeu {_texto_do_tipo(lista)}).", "lista")
            if c["variavel"] in escopo:
                self._erro(c, f"A variável do laço ({c['variavel']}) já existe: use outro nome.", "variavel")
            self._corpo(c["corpo"], {**escopo, c["variavel"]: _interno(lista)}, True)
        elif tipo in ("parar_laco", "proximo"):
            if not em_laco:
                self._erro(c, "'Parar laço' e 'próximo' só funcionam dentro de um laço.")
        elif tipo == "esperar":
            if "segundos" in c:
                self._espera(c, c["segundos"], escopo, "numero", "segundos")
            else:
                self._espera(c, c["ate"], escopo, "data", "ate")
        elif tipo in ("registrar", "avisar"):
            self._expr(c["texto"], escopo)
        elif tipo == "tentar":
            self._corpo(c["corpo"], escopo, em_laco)
            if "motivo_em" in c:
                alvo = self._var_declarada(c, c["motivo_em"], escopo, "motivo_em")
                if alvo is not None and not compativel("texto", alvo):
                    self._erro(c, f"O motivo é texto; {c['motivo_em']} é {_texto_do_tipo(alvo)}.", "motivo_em")
            self._corpo(c["se_falhar"], escopo, em_laco)
        elif tipo == "concluir":
            if "valor" in c:
                self._expr(c["valor"], escopo)
        elif tipo == "falhar":
            self._expr(c["motivo"], escopo)
        elif tipo == "executar_automacao":
            self._automacao(c)
            if "itens" in c:
                self._espera(c, c["itens"], escopo, {"lista": QUALQUER}, "itens")
            for valor in c.get("parametros", {}).values():
                self._expr(valor, escopo)
            self._guardar(c, escopo, "resultado")
        elif tipo == "dividir_automacao":
            self._automacao(c)
            if c["modo"] == "itens":
                if "itens" not in c:
                    self._erro(c, "Dividir por itens precisa da lista de itens.", "itens")
                else:
                    self._espera(c, c["itens"], escopo, {"lista": QUALQUER}, "itens")
            else:
                for campo in ("item", "fatias"):
                    if campo not in c:
                        self._erro(c, "Dividir por fatias precisa do item e da lista de fatias.", campo)
                if "item" in c:
                    self._expr(c["item"], escopo)
                if "fatias" in c:
                    self._espera(c, c["fatias"], escopo, {"lista": QUALQUER}, "fatias")
            for valor in c.get("parametros", {}).values():
                self._expr(valor, escopo)
            self._guardar(c, escopo, "resultado")
        elif tipo == "perguntar":
            self._expr(c["pergunta"], escopo)
            rotulos = [o["rotulo"].strip().lower() for o in c["opcoes"]]
            if len(set(rotulos)) != len(rotulos):
                self._erro(c, "As opções da pergunta precisam ser diferentes.", "opcoes")
            for opcao in c["opcoes"]:
                self._corpo(opcao["corpo"], escopo, em_laco)
            self._guardar(c, escopo, "texto")
        elif tipo == "chamar_subfluxo":
            for valor in c.get("entradas", {}).values():
                self._expr(valor, escopo)
            alvo = c["fluxo"]
            if self.fluxo_id is not None and alvo == self.fluxo_id:
                self._erro(c, "Um fluxo não pode chamar a si mesmo.", "fluxo")
            else:
                publicado, _ = self.contexto.subfluxo(alvo)
                if not publicado:
                    self._erro(c, "O subfluxo não existe ou ainda não tem versão publicada.", "fluxo")
                else:
                    self._estado.subfluxos.add(alvo)
            self._guardar(c, escopo, QUALQUER)

    def _automacao(self, c: dict[str, Any]) -> None:
        if not self.contexto.automacao_existe(c["automacao"]):
            self._erro(c, f"A automação {c['automacao']} não existe no Catálogo.", "automacao")

    # -- expressões ----------------------------------------------------------------------
    def _espera(self, dono: dict[str, Any], expr: dict[str, Any], escopo: dict[str, Any], tipo: Any, campo: str) -> None:
        recebido = self._expr(expr, escopo)
        if not compativel(tipo, recebido):
            alvo = expr if expr.get("id") else dono
            self._erro(alvo, f"Aqui entra {_texto_do_tipo(tipo)}, mas o valor é {_texto_do_tipo(recebido)}.", campo)

    def _expr(self, x: dict[str, Any], escopo: dict[str, Any]) -> Any:
        self._id(x)
        tipo = x["tipo"]
        if tipo in ("numero", "texto", "booleano"):
            return tipo
        if tipo == "nulo":
            return QUALQUER
        if tipo == "lista":
            itens = [self._expr(i, escopo) for i in x["itens"]]
            primeiro = itens[0] if itens else QUALQUER
            return {"lista": primeiro if all(compativel(primeiro, i) for i in itens) else QUALQUER}
        if tipo == "objeto":
            for valor in x["campos"].values():
                self._expr(valor, escopo)
            return "objeto"
        if tipo == "var":
            if x["nome"] not in escopo:
                self._erro(x, f"A variável {x['nome']} não foi criada (declare em Variáveis).")
                return QUALQUER
            return escopo[x["nome"]]
        if tipo == "entrada":
            if x["nome"] not in self.entradas:
                self._erro(x, f"A entrada {x['nome']} não existe.")
                return QUALQUER
            return self.entradas[x["nome"]]
        if tipo == "op":
            a, b, op = self._expr(x["a"], escopo), self._expr(x["b"], escopo), x["op"]
            if op in OPS_NUMERICOS:
                for lado, t in (("a", a), ("b", b)):
                    if not compativel("numero", t):
                        self._erro(x, f"A conta '{op}' é entre números ({_texto_do_tipo(t)} não serve). Para juntar textos, use 'juntar texto'.", lado)
                return "numero"
            if op in OPS_LOGICOS:
                for lado, t in (("a", a), ("b", b)):
                    if not compativel("booleano", t):
                        self._erro(x, f"'{op}' liga condições (verdadeiro/falso), não {_texto_do_tipo(t)}.", lado)
                return "booleano"
            if op in OPS_ORDEM and not (compativel(a, b) and (compativel("numero", a) or compativel("data", a) or compativel("texto", a))):
                self._erro(x, f"Não dá para comparar {_texto_do_tipo(a)} com {_texto_do_tipo(b)} usando '{op}'.")
            return "booleano"
        if tipo == "nao":
            if not compativel("booleano", self._expr(x["a"], escopo)):
                self._erro(x, "'Não' inverte uma condição (verdadeiro/falso).")
            return "booleano"
        if tipo == "fn":
            minimo, maximo, esperados, retorno = FUNCOES_PRONTAS[x["nome"]]
            args = [self._expr(a, escopo) for a in x["args"]]
            if not minimo <= len(args) <= maximo:
                self._erro(x, f"'{x['nome']}' recebe de {minimo} a {maximo} valores (recebeu {len(args)}).")
                return QUALQUER
            for i, (espera, recebido) in enumerate(zip(esperados, args)):
                if not _aceita(espera, recebido):
                    self._erro(x, f"'{x['nome']}': o valor {i + 1} não serve ({_texto_do_tipo(recebido)}).")
            return retorno(args) if callable(retorno) else retorno
        if tipo == "campo":
            de = self._expr(x["de"], escopo)
            if de == "resultado":
                if x["campo"] not in CAMPOS_DO_RESULTADO:
                    self._erro(x, f"O resultado da automação não tem '{x['campo']}' (tem: {', '.join(sorted(CAMPOS_DO_RESULTADO))}).", "campo")
                    return QUALQUER
                return CAMPOS_DO_RESULTADO[x["campo"]]
            if de not in ("objeto", QUALQUER):
                self._erro(x, f"Só objetos e resultados têm campos ({_texto_do_tipo(de)} não tem).", "de")
            return QUALQUER
        if tipo == "item":
            de = self._expr(x["de"], escopo)
            if not _eh_lista(de):
                self._erro(x, f"'Item' pega um elemento de uma lista ({_texto_do_tipo(de)} não é lista).", "de")
            if not compativel("numero", self._expr(x["indice"], escopo)):
                self._erro(x, "A posição do item é um número.", "indice")
            return _interno(de)
        if tipo == "chamar":
            funcao = self.funcoes.get(x["funcao"])
            args = [self._expr(a, escopo) for a in x["args"]]
            if funcao is None:
                self._erro(x, f"A função {x['funcao']} não existe.", "funcao")
                return QUALQUER
            if len(args) != len(funcao["parametros"]):
                self._erro(x, f"A função {x['funcao']} recebe {len(funcao['parametros'])} valores (recebeu {len(args)}).")
            for param, recebido in zip(funcao["parametros"], args):
                if not compativel(param["tipo"], recebido):
                    self._erro(x, f"{x['funcao']}: {param['nome']} é {_texto_do_tipo(param['tipo'])}, recebeu {_texto_do_tipo(recebido)}.")
            return funcao.get("tipo_retorno", QUALQUER)
        return QUALQUER

    # -- funções e subfluxos ---------------------------------------------------------------
    def _funcoes(self) -> None:
        chamadas: dict[str, set[str]] = {}
        for funcao in self.funcoes.values():
            nomes = [p["nome"] for p in funcao["parametros"]]
            if len(set(nomes)) != len(nomes):
                self._estado.erros.append(Erro(funcao.get("id"), f"A função {funcao['nome']} tem parâmetros repetidos."))
            retorno = self._expr(funcao["retorno"], {p["nome"]: p["tipo"] for p in funcao["parametros"]})
            if "tipo_retorno" in funcao and not compativel(funcao["tipo_retorno"], retorno):
                self._estado.erros.append(Erro(funcao.get("id"), f"A função {funcao['nome']} devolve {_texto_do_tipo(retorno)}, "
                                                                 f"mas diz devolver {_texto_do_tipo(funcao['tipo_retorno'])}."))
            chamadas[funcao["nome"]] = set(_chamadas(funcao["retorno"]))
        for nome in chamadas:
            if _alcanca(nome, nome, chamadas):
                self._estado.erros.append(Erro(self.funcoes[nome].get("id"), f"A função {nome} chama a si mesma (direta ou indiretamente)."))

    def _subfluxos(self) -> None:
        if self.fluxo_id is None:
            return
        visitados: set[str] = set()
        pendentes = list(self._estado.subfluxos)
        while pendentes:
            atual = pendentes.pop()
            if atual in visitados:
                continue
            visitados.add(atual)
            _, chama = self.contexto.subfluxo(atual)
            if self.fluxo_id in chama:
                self._estado.erros.append(Erro(None, "Chamada circular: um subfluxo chamado aqui volta a chamar este fluxo."))
                return
            pendentes.extend(chama)


def subfluxos_chamados(ast: Any) -> set[str]:
    """Ids dos fluxos que esta AST chama (para a checagem de chamada circular de quem a chama)."""
    achados: set[str] = set()

    def visitar(no: Any) -> None:
        if isinstance(no, dict):
            if no.get("tipo") == "chamar_subfluxo" and isinstance(no.get("fluxo"), str):
                achados.add(no["fluxo"])
            for valor in no.values():
                visitar(valor)
        elif isinstance(no, list):
            for valor in no:
                visitar(valor)

    visitar(ast)
    return achados


def _tem_saida(corpo: list[dict[str, Any]]) -> bool:
    for c in corpo:
        if c["tipo"] in ("parar_laco", "concluir", "falhar"):
            return True
        if c["tipo"] in ("repetir_vezes", "enquanto", "para_cada"):
            if _tem_fim(c["corpo"]):
                return True
            continue
        filhos = [c.get("corpo", []), c.get("senao", []), c.get("se_falhar", [])]
        filhos += [caso["corpo"] for caso in c.get("casos", [])] + [o["corpo"] for o in c.get("opcoes", [])]
        if any(_tem_saida(f) for f in filhos):
            return True
    return False


def _tem_fim(corpo: list[dict[str, Any]]) -> bool:
    """Dentro de um laço interno, só 'concluir' e 'falhar' saem do laço de fora."""
    for c in corpo:
        if c["tipo"] in ("concluir", "falhar"):
            return True
        filhos = [c.get("corpo", []), c.get("senao", []), c.get("se_falhar", [])]
        filhos += [caso["corpo"] for caso in c.get("casos", [])] + [o["corpo"] for o in c.get("opcoes", [])]
        if any(_tem_fim(f) for f in filhos):
            return True
    return False


def _chamadas(expr: Any) -> list[str]:
    if isinstance(expr, dict):
        proprias = [expr["funcao"]] if expr.get("tipo") == "chamar" else []
        return proprias + [n for v in expr.values() for n in _chamadas(v)]
    if isinstance(expr, list):
        return [n for v in expr for n in _chamadas(v)]
    return []


def _alcanca(origem: str, alvo: str, grafo: dict[str, set[str]]) -> bool:
    vistos: set[str] = set()
    pilha = list(grafo.get(origem, ()))
    while pilha:
        atual = pilha.pop()
        if atual == alvo:
            return True
        if atual not in vistos:
            vistos.add(atual)
            pilha.extend(grafo.get(atual, ()))
    return False


def _bloco_do_caminho(ast: Any, caminho: list[Any]) -> tuple[str | None, str | None]:
    """O bloco mais próximo no caminho do erro e o campo dele (o primeiro nome depois do bloco)."""
    bloco, no, posicao = None, ast, -1
    for indice, passo in enumerate(caminho):
        try:
            no = no[passo]
        except (KeyError, IndexError, TypeError):
            break
        if isinstance(no, dict) and isinstance(no.get("id"), str):
            bloco, posicao = no["id"], indice
    campo = next((str(p) for p in caminho[posicao + 1:] if isinstance(p, str)), None)
    return bloco, campo


def _mensagem_do_schema(erro: Any) -> str:
    if erro.validator == "required":
        faltando = erro.message.split("'")[1] if "'" in erro.message else "um campo"
        return f"Falta preencher '{faltando}'."
    if erro.validator == "enum":
        return f"Valor não permitido: {erro.instance!r}."
    if erro.validator == "pattern":
        return "Nome inválido: use letras minúsculas, números e _ (começando por letra ou _)."
    if erro.validator == "const":
        return "Contrato do fluxo desconhecido (esperado: fluxo/v1)."
    if erro.validator == "type":
        return f"Tipo de valor errado em '{erro.path[-1] if erro.path else 'fluxo'}'."
    if erro.validator in ("minItems", "maxItems", "minimum", "maximum", "maxLength", "minLength", "maxProperties"):
        return f"Fora do limite permitido em '{erro.path[-1] if erro.path else 'fluxo'}'."
    if erro.validator == "oneOf":
        return "Escolha uma das formas permitidas (ex.: 'partes' ou 'itens por parte', 'segundos' ou 'até')."
    if erro.validator == "additionalProperties":
        return "Campo desconhecido no fluxo."
    return "Formato inválido."
