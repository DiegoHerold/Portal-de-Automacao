"""Motor dos fluxos em blocos: interpreta a AST (contrato ``fluxo/v1``) passo a passo.

O estado inteiro é JSON e fica no banco a cada fatia (ADR-021): variáveis globais e uma **pilha de
quadros**. Cada quadro aponta um corpo da AST pelo caminho (``["corpo", 3, "casos", 0, "corpo"]``),
a posição ``i`` dentro dele e, nos laços, a volta. Não há gerador nem pilha do Python: qualquer
processo retoma de onde parou.

Uma ``FalhaDoFluxo`` (dividir por zero, bloco "falhar"...) sobe até o "tentar" mais próximo; sem
"tentar", a execução falha com o motivo. Limites: passos por execução e voltas por laço.

Fase 4: automação, divisão e avisar passam pela porta ``Efeitos`` (fila e notificações do Portal),
na mesma transação da fatia. Enquanto a automação roda, o estado guarda a ``espera`` (os jobs) e o
fluxo fica "esperando"; a cada conferência, se terminou, o resultado vai para ``guardar_em`` (ou,
sem ``guardar_em`` e com falha, vira uma falha tratável). "Novas tentativas" repetem só o que falhou.
Fase 5: "Perguntar a uma pessoa" cria uma decisão pelos efeitos (sino e e-mail com um botão por opção)
e espera; a resposta faz o fluxo seguir pelo ramo da opção escolhida.
Fase 7: "Chamar outro fluxo" cria uma execução filha (última versão publicada do outro fluxo) e espera;
concluída, o resultado vai para ``guardar_em``; falhou ou cancelada, vira uma falha tratável.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Callable, Protocol

from modules.orchestration.fluxos.domain.funcoes import FalhaDoFluxo, chamar, para_data, texto

LACOS = ("vezes", "enquanto", "lista")
PRECISAM_DO_PORTAL = ("executar_automacao", "dividir_automacao", "avisar", "perguntar", "chamar_subfluxo")
CONFERIR_A_CADA = timedelta(seconds=5)
CONFERIR_DECISAO_A_CADA = timedelta(seconds=60)  # responder acorda o fluxo na hora; isto é só a rede de segurança


class Efeitos(Protocol):
    """O que o motor pede ao Portal (fila, notificações). Implementação: ``fluxos/efeitos.py``."""

    def enfileirar(self, pedido: dict[str, Any]) -> dict[str, Any]:
        """Põe na fila; devolve a espera (os jobs a acompanhar)."""
        ...

    def conferir(self, espera: dict[str, Any]) -> dict[str, Any] | None:
        """``None`` enquanto algum job não terminou; senão, o resultado (campos do contrato)."""
        ...

    def avisar(self, para: dict[str, Any], texto: str, bloco: str | None) -> None: ...

    def perguntar(self, para: dict[str, Any], pergunta: str, opcoes: list[str], bloco: str | None) -> dict[str, Any]:
        """Cria a decisão e avisa; devolve a espera ({"tipo": "decisao", ...})."""
        ...

    def chamar_subfluxo(self, fluxo_id: str, entradas: dict[str, Any], bloco: str | None) -> dict[str, Any]:
        """Cria a execução filha; devolve a espera ({"tipo": "subfluxo", "execucao", "nome"})."""
        ...
NOMES_DOS_BLOCOS = {
    "executar_automacao": "Executar automação", "dividir_automacao": "Dividir automação", "avisar": "Avisar",
    "perguntar": "Perguntar a uma pessoa", "chamar_subfluxo": "Chamar subfluxo",
}


class ErroDoMotor(Exception):
    """Falha que nenhum "tentar" pega: limite estourado ou bloco ainda indisponível."""


@dataclass
class Limites:
    max_passos: int = 10000
    max_voltas: int = 1000


@dataclass
class Passo:
    bloco: str | None
    tipo: str
    resumo: str
    nivel: str = "info"


@dataclass
class Fatia:
    """O que uma chamada de ``avancar`` produziu."""

    situacao: str  # rodando | esperando | concluida | falhou
    estado: dict[str, Any]
    passos: list[Passo] = field(default_factory=list)
    acordar_em: datetime | None = None
    resultado: Any = None
    motivo: str | None = None
    bloco_atual: str | None = None


def estado_inicial(ast: dict[str, Any], entradas: dict[str, Any]) -> dict[str, Any]:
    globais = {decl["nome"]: None for decl in ast.get("variaveis", [])}
    return {"globais": globais, "entradas": dict(entradas), "pilha": [{"tipo": "seq", "corpo": ["corpo"], "i": 0, "locais": {}}],
            "passos": 0}


def conferir_entradas(ast: dict[str, Any], recebidas: Any) -> dict[str, Any]:
    """Entradas do disparo: obrigatórias presentes e tipo básico certo. Devolve só as declaradas."""
    if not isinstance(recebidas, dict):
        raise FalhaDoFluxo("As entradas do fluxo vêm como um objeto {nome: valor}.")
    saida: dict[str, Any] = {}
    for decl in ast.get("entradas", []):
        nome, tipo = decl["nome"], decl["tipo"]
        valor = recebidas.get(nome)
        if valor is None or valor == "":
            if decl.get("obrigatoria"):
                raise FalhaDoFluxo(f"Falta a entrada {decl.get('rotulo') or nome}.")
            saida[nome] = None
            continue
        if not _do_tipo(valor, tipo):
            raise FalhaDoFluxo(f"A entrada {decl.get('rotulo') or nome} não é do tipo esperado.")
        saida[nome] = valor
    return saida


def _do_tipo(valor: Any, tipo: Any) -> bool:
    if isinstance(tipo, dict):
        return isinstance(valor, list) and all(_do_tipo(v, tipo["lista"]) for v in valor)
    if tipo == "numero":
        return isinstance(valor, (int, float)) and not isinstance(valor, bool)
    if tipo == "booleano":
        return isinstance(valor, bool)
    if tipo in ("texto", "data"):
        return isinstance(valor, str)
    if tipo == "objeto":
        return isinstance(valor, dict)
    return True


class Interpretador:
    def __init__(self, ast: dict[str, Any], estado: dict[str, Any], agora: Callable[[], datetime],
                 limites: Limites | None = None, efeitos: Efeitos | None = None) -> None:
        self.ast = ast
        self.estado = copy.deepcopy(estado)
        self.agora = agora
        self.limites = limites or Limites()
        self.efeitos = efeitos
        self.funcoes = {f["nome"]: f for f in ast.get("funcoes", [])}
        self.passos: list[Passo] = []

    # -- avanço ------------------------------------------------------------------------
    def avancar(self, max_passos_na_fatia: int = 200) -> Fatia:
        if self.estado.get("espera"):
            try:
                sinal = self._conferir_espera()
            except FalhaDoFluxo as falha:
                sinal = self._tratar(falha)
            except ErroDoMotor as erro:
                return self._fim("falhou", None, str(erro), self.estado.get("espera", {}).get("bloco"))
            if sinal is not None:
                return sinal
        dados = 0
        while dados < max_passos_na_fatia:
            pilha = self.estado["pilha"]
            if not pilha:
                return self._fim("concluida", None)
            quadro = pilha[-1]
            corpo = self._corpo(quadro["corpo"])
            if quadro["i"] >= len(corpo):
                try:
                    self._fim_do_quadro()
                except FalhaDoFluxo as falha:
                    if (fim := self._tratar(falha)) is not None:
                        return fim
                except ErroDoMotor as erro:
                    return self._fim("falhou", None, str(erro))
                continue
            comando = corpo[quadro["i"]]
            quadro["i"] += 1
            self.estado["passos"] += 1
            dados += 1
            if self.estado["passos"] > self.limites.max_passos:
                return self._fim("falhou", None, f"O fluxo passou de {self.limites.max_passos} passos "
                                                 "(Governança > Limites).", comando.get("id"))
            try:
                sinal = self._executar(comando)
            except FalhaDoFluxo as falha:
                falha.bloco = falha.bloco or comando.get("id")
                if (fim := self._tratar(falha)) is not None:
                    return fim
                continue
            except ErroDoMotor as erro:
                return self._fim("falhou", None, str(erro), comando.get("id"))
            if sinal is not None:
                return sinal
        return Fatia("rodando", self.estado, self.passos, bloco_atual=self._proximo_bloco())

    def _fim(self, situacao: str, resultado: Any, motivo: str | None = None, bloco: str | None = None) -> Fatia:
        self.estado["pilha"] = []
        if motivo:
            self.passos.append(Passo(bloco, "falhar", motivo, "erro"))
        return Fatia(situacao, self.estado, self.passos, resultado=resultado, motivo=motivo, bloco_atual=bloco)

    def _tratar(self, falha: FalhaDoFluxo) -> Fatia | None:
        """Desempilha até o "tentar" mais próximo (ainda no corpo). Sem ele: a execução falha."""
        self.passos.append(Passo(falha.bloco, "falha", falha.motivo, "aviso"))
        pilha = self.estado["pilha"]
        while pilha:
            quadro = pilha[-1]
            if quadro["tipo"] == "tentar" and quadro["fase"] == "corpo":
                quadro.update(fase="falha", corpo=quadro["se_falhar"], i=0)
                if quadro.get("motivo_em"):
                    self._atribuir(quadro["motivo_em"], falha.motivo)
                self.passos.append(Passo(quadro["bloco"], "tentar", "Falhou: seguindo pelo 'se falhar'."))
                return None
            pilha.pop()
        return self._fim("falhou", None, falha.motivo, falha.bloco)

    def _fim_do_quadro(self) -> None:
        pilha = self.estado["pilha"]
        quadro = pilha[-1]
        if quadro["tipo"] not in LACOS:
            pilha.pop()
            return
        if quadro["tipo"] == "vezes":
            continua = quadro["volta"] < quadro["total"]
        elif quadro["tipo"] == "enquanto":
            comando = self._no(quadro["comando"])
            continua = self._condicao_do_enquanto(comando)
        else:
            continua = quadro["indice"] + 1 < len(quadro["lista"])
        if not continua:
            pilha.pop()
            return
        quadro["volta"] += 1
        if quadro["volta"] > self.limites.max_voltas:
            raise ErroDoMotor(f"Um laço passou de {self.limites.max_voltas} voltas (Governança > Limites).")
        quadro["i"] = 0
        if quadro["tipo"] == "lista":
            quadro["indice"] += 1
            quadro["locais"][quadro["variavel"]] = quadro["lista"][quadro["indice"]]

    # -- comandos ----------------------------------------------------------------------
    def _executar(self, c: dict[str, Any]) -> Fatia | None:
        tipo, ident = c["tipo"], c.get("id")
        caminho = self._caminho_do_comando()
        if tipo == "definir":
            valor = self._valor(c["valor"])
            self._atribuir(c["variavel"], valor)
            self._log(ident, tipo, f"{c['variavel']} = {_curto(valor)}")
        elif tipo == "alterar":
            atual = self._ler(c["variavel"])
            por = self._valor(c["por"])
            if not _eh_numero(por):
                raise FalhaDoFluxo(f"'Alterar por' precisa de um número (recebeu {_curto(por)}).")
            novo = (atual if _eh_numero(atual) else 0) + por
            self._atribuir(c["variavel"], novo)
            self._log(ident, tipo, f"{c['variavel']} = {_curto(novo)}")
        elif tipo == "adicionar":
            lista = self._ler(c["lista"])
            lista = list(lista) if isinstance(lista, list) else []
            lista.append(self._valor(c["valor"]))
            self._atribuir(c["lista"], lista)
            self._log(ident, tipo, f"{c['lista']} agora tem {len(lista)} itens")
        elif tipo == "se":
            for indice, caso in enumerate(c["casos"]):
                if self._verdade(caso["condicao"]):
                    self._empilhar("seq", caminho + ["casos", indice, "corpo"])
                    self._log(ident, tipo, f"Condição {indice + 1} verdadeira")
                    return None
            if c.get("senao"):
                self._empilhar("seq", caminho + ["senao"])
                self._log(ident, tipo, "Nenhuma condição: seguindo pelo 'senão'")
            else:
                self._log(ident, tipo, "Nenhuma condição verdadeira")
        elif tipo == "repetir_vezes":
            vezes = self._valor(c["vezes"])
            if not _eh_numero(vezes):
                raise FalhaDoFluxo(f"'Repetir' precisa de um número de vezes (recebeu {_curto(vezes)}).")
            total = int(vezes)
            if total > self.limites.max_voltas:
                raise ErroDoMotor(f"'Repetir {total} vezes' passa do limite de {self.limites.max_voltas} voltas.")
            if total > 0:
                self._empilhar("vezes", caminho + ["corpo"], volta=1, total=total, bloco=ident)
            self._log(ident, tipo, f"Repetir {total} vezes")
        elif tipo == "enquanto":
            if self._condicao_do_enquanto(c):
                self._empilhar("enquanto", caminho + ["corpo"], volta=1, comando=caminho, bloco=ident)
                self._log(ident, tipo, "Entrou no laço")
            else:
                self._log(ident, tipo, "Condição já satisfeita: não entrou no laço")
        elif tipo == "para_cada":
            lista = self._valor(c["lista"])
            if not isinstance(lista, list):
                raise FalhaDoFluxo(f"'Para cada' precisa de uma lista (recebeu {_curto(lista)}).")
            if len(lista) > self.limites.max_voltas:
                raise ErroDoMotor(f"A lista tem {len(lista)} itens: passa do limite de {self.limites.max_voltas} voltas.")
            if lista:
                self._empilhar("lista", caminho + ["corpo"], volta=1, lista=lista, indice=0, variavel=c["variavel"],
                               locais={c["variavel"]: lista[0]}, bloco=ident)
            self._log(ident, tipo, f"Para cada item de uma lista com {len(lista)} itens")
        elif tipo in ("parar_laco", "proximo"):
            pilha = self.estado["pilha"]
            while pilha and pilha[-1]["tipo"] not in LACOS:
                pilha.pop()
            if pilha:
                if tipo == "parar_laco":
                    pilha.pop()
                else:
                    pilha[-1]["i"] = len(self._corpo(pilha[-1]["corpo"]))
            self._log(ident, tipo, "Parou o laço" if tipo == "parar_laco" else "Foi para a próxima volta")
        elif tipo == "esperar":
            agora = self.agora()
            if "segundos" in c:
                segundos = self._valor(c["segundos"])
                if not _eh_numero(segundos) or segundos < 0:
                    raise FalhaDoFluxo(f"'Esperar' precisa de segundos (recebeu {_curto(segundos)}).")
                acordar = agora + timedelta(seconds=float(segundos))
            else:
                acordar = para_data(self._valor(c["ate"]))
                if acordar.tzinfo is None:
                    acordar = acordar.replace(tzinfo=agora.tzinfo)
            if acordar <= agora:
                self._log(ident, tipo, "Horário já passou: seguiu sem esperar")
                return None
            self._log(ident, tipo, f"Esperando até {acordar.isoformat(timespec='seconds')}")
            return Fatia("esperando", self.estado, self.passos, acordar_em=acordar, bloco_atual=ident)
        elif tipo == "registrar":
            nivel = c.get("nivel", "info")
            self._log(ident, tipo, texto(self._valor(c["texto"])), nivel)
        elif tipo == "tentar":
            self._empilhar("tentar", caminho + ["corpo"], fase="corpo", se_falhar=caminho + ["se_falhar"],
                           motivo_em=c.get("motivo_em"), bloco=ident)
            self._log(ident, tipo, "Tentando")
        elif tipo == "concluir":
            valor = self._valor(c["valor"]) if "valor" in c else None
            self._log(ident, tipo, f"Concluído com {_curto(valor)}")
            fim = self._fim("concluida", valor)
            fim.bloco_atual = ident
            return fim
        elif tipo == "falhar":
            raise FalhaDoFluxo(texto(self._valor(c["motivo"])) or "Falhou (sem motivo).", ident)
        elif tipo in PRECISAM_DO_PORTAL and self.efeitos is None:
            raise ErroDoMotor(f"O bloco '{NOMES_DOS_BLOCOS[tipo]}' precisa do Portal para rodar.")
        elif tipo in ("executar_automacao", "dividir_automacao"):
            return self._pedir_automacao(c)
        elif tipo == "perguntar":
            pergunta = texto(self._valor(c["pergunta"]))
            opcoes = [o["rotulo"] for o in c["opcoes"]]
            espera = self.efeitos.perguntar(c["para"], pergunta, opcoes, ident)
            self.estado["espera"] = {**espera, "tipo": "decisao", "bloco": ident, "caminho": caminho,
                                     "guardar_em": c.get("guardar_em"), "opcoes": opcoes}
            self._log(ident, tipo, f"Perguntou: {pergunta[:150]} (esperando a resposta)")
            return Fatia("esperando", self.estado, self.passos, acordar_em=self.agora() + CONFERIR_DECISAO_A_CADA, bloco_atual=ident)
        elif tipo == "avisar":
            texto_do_aviso = texto(self._valor(c["texto"]))
            self.efeitos.avisar(c["para"], texto_do_aviso, ident)
            self._log(ident, tipo, f"Aviso enviado: {texto_do_aviso[:120]}")
        elif tipo == "chamar_subfluxo":
            entradas = {k: self._valor(v) for k, v in c.get("entradas", {}).items()}
            espera = self.efeitos.chamar_subfluxo(c["fluxo"], entradas, ident)
            self.estado["espera"] = {**espera, "tipo": "subfluxo", "bloco": ident, "guardar_em": c.get("guardar_em")}
            self._log(ident, tipo, f"Chamou o fluxo {espera.get('nome') or c['fluxo']}; esperando terminar")
            return Fatia("esperando", self.estado, self.passos, acordar_em=self.agora() + CONFERIR_A_CADA, bloco_atual=ident)
        else:
            raise ErroDoMotor(f"Bloco desconhecido: {tipo}.")
        return None

    # -- automação (Fase 4) --------------------------------------------------------------
    def _pedir_automacao(self, c: dict[str, Any]) -> Fatia:
        pedido: dict[str, Any] = {"tipo": c["tipo"], "automacao": c["automacao"], "bloco": c.get("id"),
                                  "parametros": {k: self._valor(v) for k, v in c.get("parametros", {}).items()}}
        if c["tipo"] == "executar_automacao":
            pedido["itens"] = self._lista_de_chaves(c["itens"], "itens") if "itens" in c else []
        else:
            pedido.update(modo=c["modo"], partes=c.get("partes"), itens_por_parte=c.get("itens_por_parte"))
            if c["modo"] == "itens":
                pedido["itens"] = self._lista_de_chaves(c["itens"], "itens")
            else:
                item = self._valor(c["item"])
                if item in (None, "") or isinstance(item, (list, dict)):
                    raise FalhaDoFluxo("Dividir por partes do trabalho precisa de um item (a chave, como texto).")
                pedido.update(item=texto(item), fatias=self._valor(c["fatias"]))
                if not isinstance(pedido["fatias"], list) or not pedido["fatias"]:
                    raise FalhaDoFluxo("O trabalho a dividir precisa ser uma lista com ao menos um elemento.")
        espera = self.efeitos.enfileirar(pedido)
        self.estado["espera"] = {**espera, "bloco": c.get("id"), "guardar_em": c.get("guardar_em"), "pedido": pedido,
                                 "novas_tentativas": c.get("novas_tentativas"), "tentativa": 1}
        jobs = len(espera.get("jobs", []))
        rotulo = "job" if jobs == 1 else "jobs"
        self._log(c.get("id"), c["tipo"], f"{c['automacao']} na fila ({jobs} {rotulo}); esperando terminar")
        return Fatia("esperando", self.estado, self.passos, acordar_em=self.agora() + CONFERIR_A_CADA, bloco_atual=c.get("id"))

    def _lista_de_chaves(self, expr: dict[str, Any], campo: str) -> list[str]:
        valor = self._valor(expr)
        if not isinstance(valor, list):
            raise FalhaDoFluxo(f"'{campo}' precisa ser uma lista (recebeu {_curto(valor)}).")
        chaves = [texto(v.get("chave") if isinstance(v, dict) else v).strip() for v in valor]
        if any(not ch for ch in chaves):
            raise FalhaDoFluxo("Há item sem chave na lista.")
        return list(dict.fromkeys(chaves))

    def _conferir_espera(self) -> Fatia | None:
        espera = self.estado["espera"]
        agora = self.agora()
        if espera.get("tipo") == "decisao":
            return self._conferir_decisao(espera, agora)
        if espera.get("tipo") == "subfluxo":
            return self._conferir_subfluxo(espera, agora)
        if espera.get("repetir_em"):
            quando = datetime.fromisoformat(espera["repetir_em"])
            if agora < quando:
                return Fatia("esperando", self.estado, self.passos, acordar_em=quando, bloco_atual=espera["bloco"])
            nova = self.efeitos.enfileirar(espera["repetir"])
            espera.update(nova, tentativa=espera["tentativa"] + 1, repetir_em=None, repetir=None)
            self._log(espera["bloco"], "repetir", f"Tentativa {espera['tentativa']}: de novo na fila, só o que falhou")
            return Fatia("esperando", self.estado, self.passos, acordar_em=agora + CONFERIR_A_CADA, bloco_atual=espera["bloco"])
        resultado = self.efeitos.conferir(espera)
        if resultado is None:
            return Fatia("esperando", self.estado, self.passos, acordar_em=agora + CONFERIR_A_CADA, bloco_atual=espera["bloco"])
        if resultado.get("situacao") not in ("ok", "cancelada"):
            regra = espera.get("novas_tentativas") or {}
            if espera["tentativa"] <= int(regra.get("ate", 0)):
                segundos = int(regra.get("esperar_segundos", 0))
                espera["repetir"] = _so_o_que_falhou(espera["pedido"], resultado)
                espera["repetir_em"] = (agora + timedelta(seconds=segundos)).isoformat()
                espera["ultimo"] = _juntar_tentativas(espera.get("ultimo"), resultado)
                motivo = resultado.get("motivo") or resultado.get("situacao")
                self._log(espera["bloco"], "repetir", f"Falhou ({motivo}); nova tentativa em {segundos} s", "aviso")
                return Fatia("esperando", self.estado, self.passos, acordar_em=agora + timedelta(seconds=segundos),
                             bloco_atual=espera["bloco"])
        resultado = _juntar_tentativas(espera.get("ultimo"), resultado)
        del self.estado["espera"]
        nivel = "info" if resultado["situacao"] == "ok" else "aviso"
        self._log(espera["bloco"], "automacao", f"Terminou: {resultado['situacao']} ({resultado['total_ok']} ok, "
                                                f"{resultado['total_com_erro']} com erro)", nivel)
        if espera.get("guardar_em"):
            self._atribuir(espera["guardar_em"], resultado)
        elif resultado["situacao"] != "ok":
            raise FalhaDoFluxo(resultado.get("motivo") or "A automação terminou com erro.", espera["bloco"])
        return None

    def _conferir_decisao(self, espera: dict[str, Any], agora: datetime) -> Fatia | None:
        resposta = self.efeitos.conferir(espera)
        if resposta is None:
            return Fatia("esperando", self.estado, self.passos, acordar_em=agora + CONFERIR_DECISAO_A_CADA, bloco_atual=espera["bloco"])
        indice = int(resposta["indice"])
        rotulo = espera["opcoes"][indice]
        del self.estado["espera"]
        quem = f" por {resposta['por']}" if resposta.get("por") else ""
        self._log(espera["bloco"], "perguntar", f"Respondido{quem}: {rotulo}")
        if espera.get("guardar_em"):
            self._atribuir(espera["guardar_em"], rotulo)
        self._empilhar("seq", list(espera["caminho"]) + ["opcoes", indice, "corpo"])
        return None

    def _conferir_subfluxo(self, espera: dict[str, Any], agora: datetime) -> Fatia | None:
        fim = self.efeitos.conferir(espera)
        if fim is None:
            return Fatia("esperando", self.estado, self.passos, acordar_em=agora + CONFERIR_A_CADA, bloco_atual=espera["bloco"])
        del self.estado["espera"]
        nome = espera.get("nome") or "chamado"
        if fim["situacao"] != "concluida":
            motivo = fim.get("motivo") or ("foi cancelado" if fim["situacao"] == "cancelada" else "falhou")
            raise FalhaDoFluxo(f"O fluxo {nome} não concluiu: {motivo}", espera["bloco"])
        self._log(espera["bloco"], "subfluxo", f"O fluxo {nome} concluiu com {_curto(fim.get('resultado'))}")
        if espera.get("guardar_em"):
            self._atribuir(espera["guardar_em"], fim.get("resultado"))
        return None

    def _condicao_do_enquanto(self, c: dict[str, Any]) -> bool:
        valor = self._verdade(c["condicao"])
        return valor if c.get("modo", "enquanto") == "enquanto" else not valor

    # -- valores -----------------------------------------------------------------------
    def _verdade(self, expr: dict[str, Any]) -> bool:
        valor = self._valor(expr)
        if not isinstance(valor, bool):
            raise FalhaDoFluxo(f"A condição precisa dar verdadeiro ou falso (deu {_curto(valor)}).")
        return valor

    def _valor(self, x: dict[str, Any], locais: dict[str, Any] | None = None, profundidade: int = 0) -> Any:
        tipo = x["tipo"]
        if tipo in ("numero", "texto", "booleano"):
            return x["valor"]
        if tipo == "nulo":
            return None
        if tipo == "lista":
            return [self._valor(i, locais, profundidade) for i in x["itens"]]
        if tipo == "objeto":
            return {k: self._valor(v, locais, profundidade) for k, v in x["campos"].items()}
        if tipo == "var":
            if locais is not None:
                return locais.get(x["nome"])
            return self._ler(x["nome"])
        if tipo == "entrada":
            return self.estado["entradas"].get(x["nome"])
        if tipo == "op":
            return self._op(x, locais, profundidade)
        if tipo == "nao":
            valor = self._valor(x["a"], locais, profundidade)
            if not isinstance(valor, bool):
                raise FalhaDoFluxo("'Não' precisa de verdadeiro ou falso.")
            return not valor
        if tipo == "fn":
            return chamar(x["nome"], [self._valor(a, locais, profundidade) for a in x["args"]], self.agora)
        if tipo == "campo":
            de = self._valor(x["de"], locais, profundidade)
            return de.get(x["campo"]) if isinstance(de, dict) else None
        if tipo == "item":
            de = self._valor(x["de"], locais, profundidade)
            posicao = self._valor(x["indice"], locais, profundidade)
            if not isinstance(de, list) or not _eh_numero(posicao):
                raise FalhaDoFluxo("'Item' pega a posição (número) de uma lista.")
            if not 1 <= int(posicao) <= len(de):
                raise FalhaDoFluxo(f"A lista tem {len(de)} itens: não existe a posição {_curto(posicao)}.")
            return de[int(posicao) - 1]  # posição 1 = primeiro, como no editor
        if tipo == "chamar":
            if profundidade > 50:
                raise ErroDoMotor("Funções chamando funções demais (mais de 50 níveis).")
            funcao = self.funcoes[x["funcao"]]
            args = [self._valor(a, locais, profundidade) for a in x["args"]]
            parametros = {p["nome"]: valor for p, valor in zip(funcao["parametros"], args)}
            return self._valor(funcao["retorno"], parametros, profundidade + 1)
        raise ErroDoMotor(f"Valor desconhecido: {tipo}.")

    def _op(self, x: dict[str, Any], locais: dict[str, Any] | None, profundidade: int) -> Any:
        op = x["op"]
        a = self._valor(x["a"], locais, profundidade)
        if op in ("e", "ou"):  # curto-circuito
            if not isinstance(a, bool):
                raise FalhaDoFluxo(f"'{op}' liga condições (verdadeiro ou falso).")
            if (op == "e" and not a) or (op == "ou" and a):
                return a
            b = self._valor(x["b"], locais, profundidade)
            if not isinstance(b, bool):
                raise FalhaDoFluxo(f"'{op}' liga condições (verdadeiro ou falso).")
            return b
        b = self._valor(x["b"], locais, profundidade)
        if op == "=":
            return a == b
        if op == "!=":
            return a != b
        if op in ("+", "-", "*", "/", "%"):
            if not (_eh_numero(a) and _eh_numero(b)):
                raise FalhaDoFluxo(f"A conta '{op}' é entre números ({_curto(a)} e {_curto(b)}).")
            if op in ("/", "%") and b == 0:
                raise FalhaDoFluxo("Divisão por zero.")
            resultado = {"+": a + b, "-": a - b, "*": a * b, "/": a / b, "%": a % b}[op]
            return int(resultado) if isinstance(resultado, float) and resultado.is_integer() else resultado
        try:
            return {"<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b}[op]
        except TypeError as exc:
            raise FalhaDoFluxo(f"Não dá para comparar {_curto(a)} com {_curto(b)}.") from exc

    # -- variáveis e pilha -------------------------------------------------------------
    def _ler(self, nome: str) -> Any:
        for quadro in reversed(self.estado["pilha"]):
            if nome in quadro.get("locais", {}):
                return quadro["locais"][nome]
        return self.estado["globais"].get(nome)

    def _atribuir(self, nome: str, valor: Any) -> None:
        for quadro in reversed(self.estado["pilha"]):
            if nome in quadro.get("locais", {}):
                quadro["locais"][nome] = valor
                return
        self.estado["globais"][nome] = valor

    def _empilhar(self, tipo: str, corpo: list[Any], **extra: Any) -> None:
        self.estado["pilha"].append({"tipo": tipo, "corpo": corpo, "i": 0, "locais": extra.pop("locais", {}), **extra})

    def _caminho_do_comando(self) -> list[Any]:
        quadro = self.estado["pilha"][-1]
        return list(quadro["corpo"]) + [quadro["i"] - 1]

    def _corpo(self, caminho: list[Any]) -> list[dict[str, Any]]:
        return self._no(caminho)

    def _no(self, caminho: list[Any]) -> Any:
        no: Any = self.ast
        for passo in caminho:
            no = no[passo]
        return no

    def _proximo_bloco(self) -> str | None:
        pilha = self.estado["pilha"]
        if not pilha:
            return None
        corpo = self._corpo(pilha[-1]["corpo"])
        if pilha[-1]["i"] < len(corpo):
            return corpo[pilha[-1]["i"]].get("id")
        return pilha[-1].get("bloco")

    def _log(self, bloco: str | None, tipo: str, resumo: str, nivel: str = "info") -> None:
        quadro = next((q for q in reversed(self.estado["pilha"]) if q["tipo"] in LACOS), None)
        if quadro is not None and tipo not in ("repetir_vezes", "enquanto", "para_cada"):
            resumo = f"[volta {quadro['volta']}] {resumo}"
        self.passos.append(Passo(bloco, tipo, resumo[:500], nivel))


def _eh_numero(valor: Any) -> bool:
    return isinstance(valor, (int, float)) and not isinstance(valor, bool)


def _curto(valor: Any) -> str:
    if valor is None:
        return "vazio"
    escrito = texto(valor)
    return escrito if len(escrito) <= 80 else escrito[:77] + "..."


def _so_o_que_falhou(pedido: dict[str, Any], resultado: dict[str, Any]) -> dict[str, Any]:
    """O pedido de uma nova tentativa: só os itens (ou as partes do trabalho) que falharam."""
    novo = dict(pedido)
    if pedido.get("modo") == "fatias" and resultado.get("fatias_com_erro"):
        novo["fatias"] = list(resultado["fatias_com_erro"])
    elif pedido.get("itens") and resultado.get("itens_com_erro"):
        novo["itens"] = list(resultado["itens_com_erro"])
    return novo


def _juntar_tentativas(anterior: dict[str, Any] | None, atual: dict[str, Any]) -> dict[str, Any]:
    """Depois de repetir só o que falhou, o resultado soma também o que deu certo antes."""
    if not anterior:
        return atual
    itens_ok = list(dict.fromkeys([*anterior.get("itens_ok", []), *atual.get("itens_ok", [])]))
    total_ok = len(itens_ok) if itens_ok else anterior.get("total_ok", 0) + atual.get("total_ok", 0)
    return {**atual, "itens_ok": itens_ok, "total_ok": total_ok,
            "arquivos": [*anterior.get("arquivos", []), *atual.get("arquivos", [])]}
