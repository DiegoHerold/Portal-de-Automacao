"""Motor dos fluxos em blocos (Fase 3), sem banco: estado JSON, retomada, laços, falhas e limites."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest

from modules.orchestration.fluxos.domain.funcoes import FalhaDoFluxo
from modules.orchestration.fluxos.domain.motor import Interpretador, Limites, conferir_entradas, estado_inicial

from pathlib import Path

EXEMPLOS = Path(__file__).resolve().parents[5] / "contracts" / "flows" / "v1" / "examples"

AGORA = datetime(2026, 11, 13, 10, 0, tzinfo=UTC)
num = lambda v: {"tipo": "numero", "valor": v}  # noqa: E731
txt = lambda v: {"tipo": "texto", "valor": v}  # noqa: E731
var = lambda n: {"tipo": "var", "nome": n}  # noqa: E731
op = lambda o, a, b: {"tipo": "op", "op": o, "a": a, "b": b}  # noqa: E731


def fluxo(*corpo: dict, variaveis: dict | None = None, entradas: list | None = None, funcoes: list | None = None) -> dict:
    return {"contrato": "fluxo/v1", "entradas": entradas or [],
            "variaveis": [{"nome": n, "tipo": t} for n, t in (variaveis or {}).items()], "funcoes": funcoes or [],
            "corpo": list(corpo)}


def rodar(ast: dict, entradas: dict | None = None, limites: Limites | None = None, relogio=lambda: AGORA, fatia: int = 1000):
    estado = estado_inicial(ast, entradas or {})
    return Interpretador(ast, json.loads(json.dumps(estado)), relogio, limites).avancar(fatia)


def test_contas_condicoes_e_concluir() -> None:
    ast = fluxo(
        {"id": "b1", "tipo": "definir", "variavel": "x", "valor": op("*", num(6), num(7))},
        {"id": "b2", "tipo": "se", "casos": [{"condicao": op(">", var("x"), num(50)), "corpo": [
            {"id": "b3", "tipo": "concluir", "valor": txt("grande")}]}],
         "senao": [{"id": "b4", "tipo": "concluir", "valor": op("+", var("x"), num(0.5))}]},
        variaveis={"x": "numero"})
    fim = rodar(ast)
    assert fim.situacao == "concluida" and fim.resultado == 42.5 and fim.bloco_atual == "b4"
    assert [p.resumo for p in fim.passos][:2] == ["x = 42", "Nenhuma condição: seguindo pelo 'senão'"]


def test_lacos_vezes_enquanto_e_para_cada_com_parar_e_proximo() -> None:
    ast = fluxo(
        {"id": "b1", "tipo": "definir", "variavel": "soma", "valor": num(0)},
        {"id": "b2", "tipo": "para_cada", "variavel": "n", "lista": {"tipo": "lista", "itens": [num(1), num(2), num(3), num(4)]}, "corpo": [
            {"id": "b3", "tipo": "se", "casos": [{"condicao": op("=", var("n"), num(2)), "corpo": [{"id": "b4", "tipo": "proximo"}]}]},
            {"id": "b5", "tipo": "se", "casos": [{"condicao": op("=", var("n"), num(4)), "corpo": [{"id": "b6", "tipo": "parar_laco"}]}]},
            {"id": "b7", "tipo": "alterar", "variavel": "soma", "por": var("n")}]},
        {"id": "b8", "tipo": "repetir_vezes", "vezes": num(3), "corpo": [{"id": "b9", "tipo": "alterar", "variavel": "soma", "por": num(10)}]},
        {"id": "b10", "tipo": "enquanto", "modo": "ate", "condicao": op(">=", var("soma"), num(40)), "corpo": [
            {"id": "b11", "tipo": "alterar", "variavel": "soma", "por": num(1)}]},
        {"id": "b12", "tipo": "concluir", "valor": var("soma")},
        variaveis={"soma": "numero"})
    fim = rodar(ast)
    assert fim.situacao == "concluida" and fim.resultado == 40  # (1+3) + 30 + 6 voltas do "até"
    assert any(p.resumo.startswith("[volta 3]") for p in fim.passos)


def test_tentar_pega_a_falha_e_guarda_o_motivo() -> None:
    ast = fluxo(
        {"id": "b1", "tipo": "tentar", "motivo_em": "motivo", "corpo": [
            {"id": "b2", "tipo": "definir", "variavel": "x", "valor": op("/", num(1), num(0))},
            {"id": "b3", "tipo": "registrar", "texto": txt("não chega aqui")}],
         "se_falhar": [{"id": "b4", "tipo": "concluir", "valor": var("motivo")}]},
        variaveis={"x": "numero", "motivo": "texto"})
    fim = rodar(ast)
    assert fim.situacao == "concluida" and fim.resultado == "Divisão por zero."
    assert "não chega aqui" not in [p.resumo for p in fim.passos]
    sem_tentar = rodar(fluxo({"id": "b1", "tipo": "falhar", "motivo": txt("faltou a guia")}))
    assert sem_tentar.situacao == "falhou" and sem_tentar.motivo == "faltou a guia" and sem_tentar.bloco_atual == "b1"


def test_esperar_salva_estado_e_retoma_em_outro_processo() -> None:
    ast = fluxo(
        {"id": "b1", "tipo": "definir", "variavel": "x", "valor": num(1)},
        {"id": "b2", "tipo": "esperar", "segundos": num(300)},
        {"id": "b3", "tipo": "concluir", "valor": op("+", var("x"), num(1))},
        variaveis={"x": "numero"})
    primeira = rodar(ast)
    assert primeira.situacao == "esperando" and primeira.acordar_em == AGORA + timedelta(seconds=300)
    salvo = json.loads(json.dumps(primeira.estado))  # o que vai para o banco
    depois = Interpretador(ast, salvo, lambda: AGORA + timedelta(minutes=6)).avancar()
    assert depois.situacao == "concluida" and depois.resultado == 2


def test_fatias_pequenas_dao_o_mesmo_resultado() -> None:
    ast = fluxo(
        {"id": "b1", "tipo": "definir", "variavel": "t", "valor": num(0)},
        {"id": "b2", "tipo": "repetir_vezes", "vezes": num(25), "corpo": [{"id": "b3", "tipo": "alterar", "variavel": "t", "por": num(2)}]},
        {"id": "b4", "tipo": "concluir", "valor": var("t")}, variaveis={"t": "numero"})
    estado = estado_inicial(ast, {})
    fatias = 0
    while True:
        fim = Interpretador(ast, json.loads(json.dumps(estado)), lambda: AGORA).avancar(3)
        fatias += 1
        if fim.situacao != "rodando":
            break
        estado = fim.estado
    assert fim.resultado == 50 and fatias > 5


def test_limites_de_passos_e_voltas() -> None:
    sem_fim = fluxo({"id": "b1", "tipo": "enquanto", "condicao": {"tipo": "booleano", "valor": True}, "corpo": [
        {"id": "b2", "tipo": "registrar", "texto": txt("de novo")}]})
    fim = rodar(sem_fim, limites=Limites(max_passos=50, max_voltas=1000))
    assert fim.situacao == "falhou" and "50 passos" in fim.motivo
    fim = rodar(sem_fim, limites=Limites(max_passos=10000, max_voltas=20))
    assert fim.situacao == "falhou" and "20 voltas" in fim.motivo
    # O limite não é falha "tratável": um "tentar" não segura.
    preso = fluxo({"id": "t", "tipo": "tentar", "corpo": sem_fim["corpo"], "se_falhar": [{"id": "x", "tipo": "concluir"}]})
    assert rodar(preso, limites=Limites(max_passos=10000, max_voltas=20)).situacao == "falhou"


def test_funcoes_do_fluxo_e_prontas() -> None:
    dobro = {"nome": "dobro", "parametros": [{"nome": "n", "tipo": "numero"}], "retorno": op("*", var("n"), num(2))}
    ast = fluxo(
        {"id": "b1", "tipo": "definir", "variavel": "r", "valor": {"tipo": "lista", "itens": [
            {"tipo": "chamar", "funcao": "dobro", "args": [num(21)]},
            {"tipo": "fn", "nome": "competencia", "args": [{"tipo": "fn", "nome": "hoje", "args": []}]},
            {"tipo": "fn", "nome": "arredondar", "args": [num(2.345), num(2)]},
            {"tipo": "fn", "nome": "para_numero", "args": [txt("1.234,50")]},
            {"tipo": "fn", "nome": "dividir_em_partes", "args": [{"tipo": "lista", "itens": [num(i) for i in range(5)]}, num(2)]},
            {"tipo": "item", "de": {"tipo": "lista", "itens": [txt("a"), txt("b")]}, "indice": num(2)}]}},
        {"id": "b2", "tipo": "concluir", "valor": var("r")}, variaveis={"r": "qualquer"}, funcoes=[dobro])
    assert rodar(ast).resultado == [42, "11/2026", 2.35, 1234.5, [[0, 1, 2], [3, 4]], "b"]


def test_bloco_do_portal_sem_portal_para_com_motivo_claro() -> None:
    for comando in ({"id": "b1", "tipo": "chamar_subfluxo", "fluxo": "flx_outro"},
                    {"id": "b1", "tipo": "executar_automacao", "automacao": "integracao_contabil"}):
        fim = rodar(fluxo(comando))
        assert fim.situacao == "falhou" and "precisa do Portal" in fim.motivo


def test_entradas_obrigatorias_e_tipos() -> None:
    ast = fluxo(entradas=[{"nome": "empresas", "tipo": {"lista": "texto"}, "obrigatoria": True, "rotulo": "Empresas"},
                          {"nome": "limite", "tipo": "numero"}])
    with pytest.raises(FalhaDoFluxo, match="Falta a entrada Empresas"):
        conferir_entradas(ast, {})
    with pytest.raises(FalhaDoFluxo, match="não é do tipo"):
        conferir_entradas(ast, {"empresas": "8010"})
    assert conferir_entradas(ast, {"empresas": ["8010"], "extra": 1}) == {"empresas": ["8010"], "limite": None}


# -- Fase 4: automação, divisão e avisar pela porta de efeitos ------------------------------------

class EfeitosDeTeste:
    """Fila de mentira: cada pedido vira um "job"; ``respostas`` diz o resultado de cada conferência."""

    def __init__(self, respostas: list) -> None:
        self.pedidos: list[dict] = []
        self.avisos: list[tuple] = []
        self.respostas = list(respostas)

    def enfileirar(self, pedido):
        self.pedidos.append(pedido)
        return {"jobs": [{"job": f"tsk_{len(self.pedidos)}"}]}

    def conferir(self, espera):
        return self.respostas.pop(0)

    def avisar(self, para, texto, bloco):
        self.avisos.append((para["tipo"], texto, bloco))

    def perguntar(self, para, pergunta, opcoes, bloco):
        self.avisos.append(("pergunta", pergunta, tuple(opcoes)))
        return {"decisao": "dec_1"}

    def chamar_subfluxo(self, fluxo_id, entradas, bloco):
        self.pedidos.append({"subfluxo": fluxo_id, "entradas": entradas, "bloco": bloco})
        return {"execucao": f"fle_{len(self.pedidos)}", "nome": "Conferir empresa"}


def resultado(situacao="ok", ok=(), erro=(), fatias_erro=()) -> dict:
    return {"situacao": situacao, "itens_ok": list(ok), "itens_com_erro": list(erro), "fatias_com_erro": list(fatias_erro),
            "total_ok": len(ok), "total_com_erro": len(erro), "arquivos": [], "motivo": None if situacao == "ok" else "deu erro"}


def avancar_ate_o_fim(ast, efeitos, entradas=None, relogio_inicial=AGORA):
    estado = estado_inicial(ast, entradas or {})
    agora = relogio_inicial
    todos = []  # o Portal grava os passos de cada fatia; aqui juntamos no fim
    for _ in range(50):
        fim = Interpretador(ast, json.loads(json.dumps(estado)), lambda: agora, efeitos=efeitos).avancar()
        todos.extend(fim.passos)
        if fim.situacao not in ("rodando", "esperando"):
            fim.passos = todos
            return fim
        estado = fim.estado
        agora = fim.acordar_em or agora
    raise AssertionError("não terminou")


EMPRESAS = [{"nome": "empresas", "tipo": {"lista": "texto"}}]


def test_executar_espera_e_guarda_o_resultado() -> None:
    ast = fluxo(
        {"id": "b1", "tipo": "executar_automacao", "automacao": "integracao_contabil", "guardar_em": "r",
         "itens": {"tipo": "entrada", "nome": "empresas"}, "parametros": {"competencia": txt("10/2026")}},
        {"id": "b2", "tipo": "concluir", "valor": {"tipo": "campo", "de": var("r"), "campo": "total_ok"}},
        variaveis={"r": "resultado"}, entradas=EMPRESAS)
    efeitos = EfeitosDeTeste([None, None, resultado(ok=["8010", "8020"])])
    primeira = Interpretador(ast, estado_inicial(ast, {"empresas": ["8010", "8020"]}), lambda: AGORA, efeitos=efeitos).avancar()
    assert primeira.situacao == "esperando" and primeira.acordar_em == AGORA + timedelta(seconds=5)
    assert efeitos.pedidos == [{"tipo": "executar_automacao", "automacao": "integracao_contabil", "bloco": "b1",
                                "parametros": {"competencia": "10/2026"}, "itens": ["8010", "8020"]}]
    fim = avancar_ate_o_fim(ast, efeitos, {"empresas": ["8010", "8020"]})
    assert fim.situacao == "concluida" and fim.resultado == 2


def test_falha_sem_guardar_cai_no_tentar() -> None:
    ast = fluxo({"id": "t", "tipo": "tentar", "motivo_em": "m",
                 "corpo": [{"id": "b1", "tipo": "executar_automacao", "automacao": "x"}],
                 "se_falhar": [{"id": "b2", "tipo": "concluir", "valor": var("m")}]}, variaveis={"m": "texto"})
    fim = avancar_ate_o_fim(ast, EfeitosDeTeste([resultado("falhou")]))
    assert fim.situacao == "concluida" and fim.resultado == "deu erro"


def test_novas_tentativas_repetem_so_o_que_falhou_e_somam_o_que_deu_certo() -> None:
    ast = fluxo(
        {"id": "b1", "tipo": "executar_automacao", "automacao": "integracao_contabil", "guardar_em": "r",
         "itens": {"tipo": "entrada", "nome": "empresas"}, "novas_tentativas": {"ate": 2, "esperar_segundos": 300}},
        {"id": "b2", "tipo": "concluir", "valor": var("r")}, variaveis={"r": "resultado"}, entradas=EMPRESAS)
    efeitos = EfeitosDeTeste([resultado("parcial", ok=["8010"], erro=["8020", "8030"]),
                              resultado("parcial", ok=["8020"], erro=["8030"]),
                              resultado("falhou", erro=["8030"])])
    fim = avancar_ate_o_fim(ast, efeitos, {"empresas": ["8010", "8020", "8030"]})
    assert [p["itens"] for p in efeitos.pedidos] == [["8010", "8020", "8030"], ["8020", "8030"], ["8030"]]
    assert fim.resultado["itens_ok"] == ["8010", "8020"] and fim.resultado["itens_com_erro"] == ["8030"]
    assert fim.resultado["total_ok"] == 2 and fim.resultado["situacao"] == "falhou"
    assert any("nova tentativa em 300 s" in p.resumo for p in fim.passos)


def test_dividir_por_partes_do_trabalho_e_avisar() -> None:
    ast = json.loads((EXEMPLOS / "planet-em-5-maquinas.json").read_text(encoding="utf-8"))
    ast["corpo"] = ast["corpo"][:1] + [{"id": "av", "tipo": "avisar", "para": {"tipo": "quem_executou"},
                                        "texto": {"tipo": "fn", "nome": "para_texto", "args": [
                                            {"tipo": "campo", "de": var("resultado"), "campo": "total_ok"}]}},
                                       {"id": "fim", "tipo": "concluir"}]
    efeitos = EfeitosDeTeste([resultado(ok=["PLANET"])])
    fim = avancar_ate_o_fim(ast, efeitos, {"empresa": "PLANET", "arquivos": [f"{i}.txt" for i in range(50)]})
    pedido = efeitos.pedidos[0]
    assert (pedido["modo"], pedido["item"], len(pedido["fatias"]), pedido["partes"]) == ("fatias", "PLANET", 50, 5)
    assert efeitos.avisos == [("quem_executou", "1", "av")] and fim.situacao == "concluida"


# -- Fase 5: perguntar a uma pessoa ------------------------------------------------------------------

def test_perguntar_espera_a_resposta_e_segue_pelo_ramo_escolhido() -> None:
    ast = fluxo(
        {"id": "p", "tipo": "perguntar", "para": {"tipo": "quem_executou"}, "pergunta": txt("Seguir?"), "guardar_em": "escolha",
         "opcoes": [{"rotulo": "tentar de novo", "corpo": [{"id": "a", "tipo": "concluir", "valor": txt("repetiu")}]},
                    {"rotulo": "encerrar", "corpo": [{"id": "b", "tipo": "registrar", "texto": var("escolha")}]}]},
        {"id": "c", "tipo": "concluir", "valor": op("+", num(1), num(1))}, variaveis={"escolha": "texto"})
    efeitos = EfeitosDeTeste([None, {"indice": 1, "por": "Ana"}])
    primeira = Interpretador(ast, estado_inicial(ast, {}), lambda: AGORA, efeitos=efeitos).avancar()
    assert primeira.situacao == "esperando" and primeira.acordar_em == AGORA + timedelta(seconds=60)
    assert efeitos.avisos == [("pergunta", "Seguir?", ("tentar de novo", "encerrar"))]
    fim = avancar_ate_o_fim(ast, efeitos)
    resumos = [p.resumo for p in fim.passos]
    assert "Respondido por Ana: encerrar" in resumos and "encerrar" in resumos  # o registrar leu a variável
    assert fim.situacao == "concluida" and fim.resultado == 2  # saiu do ramo e seguiu o fluxo


# -- Fase 7: subfluxo ------------------------------------------------------------------------------

def test_subfluxo_espera_a_filha_e_guarda_o_resultado() -> None:
    ast = fluxo(
        {"id": "b1", "tipo": "chamar_subfluxo", "fluxo": "flx_filho", "guardar_em": "r",
         "entradas": {"empresa": {"tipo": "texto", "valor": "8010"}, "dobro": {"tipo": "op", "op": "*", "a": num(2), "b": num(21)}}},
        {"id": "b2", "tipo": "concluir", "valor": var("r")},
        variaveis={"r": "qualquer"})
    efeitos = EfeitosDeTeste([None, None, {"situacao": "concluida", "resultado": {"ok": 3}, "motivo": None}])
    fim = avancar_ate_o_fim(ast, efeitos)
    assert fim.situacao == "concluida" and fim.resultado == {"ok": 3}
    assert efeitos.pedidos == [{"subfluxo": "flx_filho", "entradas": {"empresa": "8010", "dobro": 42}, "bloco": "b1"}]
    resumos = [p.resumo for p in fim.passos]
    assert "Chamou o fluxo Conferir empresa; esperando terminar" in resumos
    assert any(r.startswith("O fluxo Conferir empresa concluiu") for r in resumos)


def test_subfluxo_que_falha_vira_falha_tratavel() -> None:
    ast = fluxo(
        {"id": "b1", "tipo": "tentar", "motivo_em": "m", "corpo": [{"id": "b2", "tipo": "chamar_subfluxo", "fluxo": "flx_filho"}],
         "se_falhar": [{"id": "b3", "tipo": "concluir", "valor": var("m")}]},
        variaveis={"m": "texto"})
    efeitos = EfeitosDeTeste([{"situacao": "falhou", "resultado": None, "motivo": "faltou o arquivo"}])
    fim = avancar_ate_o_fim(ast, efeitos)
    assert fim.situacao == "concluida" and fim.resultado == "O fluxo Conferir empresa não concluiu: faltou o arquivo"
    cancelado = avancar_ate_o_fim(fluxo({"id": "b1", "tipo": "chamar_subfluxo", "fluxo": "flx_filho"}),
                                  EfeitosDeTeste([{"situacao": "cancelada", "resultado": None, "motivo": None}]))
    assert cancelado.situacao == "falhou" and "foi cancelado" in cancelado.motivo
