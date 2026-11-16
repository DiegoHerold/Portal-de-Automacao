"""Validador dos fluxos em blocos (contrato contracts/flows/v1), sem banco."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from modules.orchestration.fluxos.domain.validador import Validador

EXEMPLOS = Path(__file__).resolve().parents[5] / "contracts" / "flows" / "v1" / "examples"


class Contexto:
    def __init__(self, max_blocos: int = 500, subfluxos: dict[str, set[str]] | None = None) -> None:
        self.max_blocos = max_blocos
        self.subfluxos = subfluxos or {}

    def automacao_existe(self, chave: str) -> bool:
        return chave == "integracao_contabil"

    def subfluxo(self, fluxo_id: str) -> tuple[bool, set[str]]:
        return (fluxo_id in self.subfluxos, self.subfluxos.get(fluxo_id, set()))


def validar(ast: dict, contexto: Contexto | None = None, fluxo_id: str = "flx_a") -> list[dict]:
    return [e.para_api() for e in Validador(contexto or Contexto(), fluxo_id).validar(ast)]


def base(*corpo: dict, variaveis: list | None = None, entradas: list | None = None, funcoes: list | None = None) -> dict:
    return {"contrato": "fluxo/v1", "entradas": entradas or [], "variaveis": variaveis or [], "funcoes": funcoes or [],
            "corpo": list(corpo)}


num = lambda v: {"tipo": "numero", "valor": v}  # noqa: E731
txt = lambda v: {"tipo": "texto", "valor": v}  # noqa: E731
var = lambda n: {"tipo": "var", "nome": n}  # noqa: E731


@pytest.mark.parametrize("arquivo", sorted(p.name for p in EXEMPLOS.glob("*.json")))
def test_exemplos_do_contrato_sao_validos(arquivo: str) -> None:
    assert validar(json.loads((EXEMPLOS / arquivo).read_text(encoding="utf-8"))) == []


def test_estrutura_aponta_o_bloco_e_o_campo() -> None:
    erros = validar(base({"id": "b1", "tipo": "definir", "variavel": "x"}))
    assert erros == [{"bloco": "b1", "campo": "valor", "mensagem": "Falta preencher 'valor'."}]
    assert validar(base({"id": "b1", "tipo": "voar"}))[0]["mensagem"].startswith("Valor não permitido")
    assert validar({"contrato": "fluxo/v9", "corpo": []})[0]["mensagem"].startswith("Contrato do fluxo desconhecido")
    assert validar(base({"id": "b1", "tipo": "definir", "variavel": "Total Geral", "valor": num(1)}))[0]["mensagem"].startswith("Nome inválido")


def test_variavel_precisa_ser_declarada_e_do_tipo_certo() -> None:
    erros = validar(base({"id": "b1", "tipo": "definir", "variavel": "x", "valor": num(1)}))
    assert erros[0]["bloco"] == "b1" and "não foi criada" in erros[0]["mensagem"]
    erros = validar(base({"id": "b1", "tipo": "definir", "variavel": "x", "valor": txt("a")}, variaveis=[{"nome": "x", "tipo": "numero"}]))
    assert "é numero, mas o valor é texto" in erros[0]["mensagem"]
    erros = validar(base({"id": "b1", "tipo": "registrar", "texto": {"tipo": "entrada", "nome": "nada", "id": "e1"}}))
    assert erros[0] == {"bloco": "e1", "campo": None, "mensagem": "A entrada nada não existe."}


def test_tipos_nas_contas_e_condicoes() -> None:
    soma_texto = {"tipo": "op", "op": "+", "a": txt("a"), "b": num(1), "id": "e1"}
    assert "juntar texto" in validar(base({"id": "b1", "tipo": "registrar", "texto": soma_texto}))[0]["mensagem"]
    se_numero = {"id": "b1", "tipo": "se", "casos": [{"condicao": num(1), "corpo": []}]}
    assert "Aqui entra booleano" in validar(base(se_numero))[0]["mensagem"]
    para_cada_texto = {"id": "b1", "tipo": "para_cada", "variavel": "i", "lista": txt("abc"), "corpo": []}
    assert "precisa de uma lista" in validar(base(para_cada_texto))[0]["mensagem"]


def test_laco_sem_saida_e_parar_fora_de_laco() -> None:
    sempre = {"id": "b1", "tipo": "enquanto", "condicao": {"tipo": "booleano", "valor": True}, "corpo": [
        {"id": "b2", "tipo": "registrar", "texto": txt("de novo")}]}
    assert "nunca termina" in validar(base(sempre))[0]["mensagem"]
    com_saida = copy.deepcopy(sempre)
    com_saida["corpo"].append({"id": "b3", "tipo": "parar_laco"})
    assert validar(base(com_saida)) == []
    assert "só funcionam dentro de um laço" in validar(base({"id": "b1", "tipo": "parar_laco"}))[0]["mensagem"]


def test_variavel_do_laco_vale_so_dentro() -> None:
    laco = {"id": "b1", "tipo": "para_cada", "variavel": "i", "lista": {"tipo": "lista", "itens": [num(1)]}, "corpo": [
        {"id": "b2", "tipo": "registrar", "texto": {"tipo": "fn", "nome": "para_texto", "args": [var("i")]}}]}
    fora = {"id": "b3", "tipo": "registrar", "texto": {"tipo": "fn", "nome": "para_texto", "args": [var("i")]}}
    assert validar(base(laco)) == []
    assert "A variável i não foi criada" in validar(base(laco, fora))[0]["mensagem"]


def test_automacao_resultado_e_divisao() -> None:
    erros = validar(base({"id": "b1", "tipo": "executar_automacao", "automacao": "nao_existe"}))
    assert erros[0]["campo"] == "automacao" and "não existe no Catálogo" in erros[0]["mensagem"]
    campo_errado = {"id": "b2", "tipo": "registrar", "texto": {"tipo": "fn", "nome": "para_texto", "args": [
        {"tipo": "campo", "id": "e1", "de": var("r"), "campo": "inexistente"}]}}
    erros = validar(base({"id": "b1", "tipo": "executar_automacao", "automacao": "integracao_contabil", "guardar_em": "r"},
                         campo_errado, variaveis=[{"nome": "r", "tipo": "resultado"}]))
    assert erros[0]["bloco"] == "e1" and "não tem 'inexistente'" in erros[0]["mensagem"]
    sem_fatias = {"id": "b1", "tipo": "dividir_automacao", "automacao": "integracao_contabil", "modo": "fatias", "partes": 3}
    assert {e["campo"] for e in validar(base(sem_fatias))} == {"item", "fatias"}
    sem_partes = {"id": "b1", "tipo": "dividir_automacao", "automacao": "integracao_contabil", "modo": "itens",
                  "itens": {"tipo": "lista", "itens": []}}
    assert "partes" in validar(base(sem_partes))[0]["mensagem"]


def test_funcoes_aridade_tipos_e_recursao() -> None:
    dobro = {"nome": "dobro", "id": "f1", "parametros": [{"nome": "n", "tipo": "numero"}], "tipo_retorno": "numero",
             "retorno": {"tipo": "op", "op": "*", "a": var("n"), "b": num(2)}}
    chama = lambda *args: {"id": "b1", "tipo": "registrar", "texto": {"tipo": "fn", "nome": "para_texto", "args": [  # noqa: E731
        {"tipo": "chamar", "funcao": "dobro", "args": list(args)}]}}
    assert validar(base(chama(num(2)), funcoes=[dobro])) == []
    assert "recebe 1 valores" in validar(base(chama(), funcoes=[dobro]))[0]["mensagem"]
    assert "n é numero, recebeu texto" in validar(base(chama(txt("x")), funcoes=[dobro]))[0]["mensagem"]
    a = {"nome": "a", "id": "fa", "parametros": [], "retorno": {"tipo": "chamar", "funcao": "b", "args": []}}
    b = {"nome": "b", "id": "fb", "parametros": [], "retorno": {"tipo": "chamar", "funcao": "a", "args": []}}
    assert {e["bloco"] for e in validar(base(funcoes=[a, b])) if "chama a si mesma" in e["mensagem"]} == {"fa", "fb"}


def test_subfluxo_existente_sem_chamada_circular() -> None:
    chamar = lambda alvo: {"id": "b1", "tipo": "chamar_subfluxo", "fluxo": alvo}  # noqa: E731
    assert "não pode chamar a si mesmo" in validar(base(chamar("flx_a")))[0]["mensagem"]
    assert "ainda não tem versão publicada" in validar(base(chamar("flx_b")))[0]["mensagem"]
    assert validar(base(chamar("flx_b")), Contexto(subfluxos={"flx_b": set()})) == []
    circular = Contexto(subfluxos={"flx_b": {"flx_c"}, "flx_c": {"flx_a"}})
    assert "Chamada circular" in validar(base(chamar("flx_b")), circular)[0]["mensagem"]


def test_limite_de_blocos_e_ids_repetidos() -> None:
    corpo = [{"id": f"b{i}", "tipo": "registrar", "texto": txt("x")} for i in range(6)]
    assert "o limite é 10" in validar(base(*corpo), Contexto(max_blocos=10))[0]["mensagem"]
    repetido = [{"id": "b1", "tipo": "registrar", "texto": txt("x")}, {"id": "b1", "tipo": "registrar", "texto": txt("y")}]
    assert "aparece em mais de um bloco" in validar(base(*repetido))[0]["mensagem"]
