"""Funções prontas dos fluxos (``{"tipo": "fn", "nome": ...}`` no contrato ``fluxo/v1``).

Datas trafegam como texto ISO (``2026-11-13`` ou ``2026-11-13T14:05:00-03:00``): cabem no estado
JSON e comparam em ordem. Erro de uso (dividir por zero, data inválida) vira ``FalhaDoFluxo``,
que o bloco "tentar" pode pegar.
"""

from __future__ import annotations

import json
import math
from datetime import date, datetime, timedelta
from typing import Any, Callable


class FalhaDoFluxo(Exception):
    """Falha que o fluxo pode tratar com "tentar / se falhar"."""

    def __init__(self, motivo: str, bloco: str | None = None) -> None:
        super().__init__(motivo)
        self.motivo = motivo
        self.bloco = bloco


def para_data(valor: Any) -> datetime:
    if isinstance(valor, str):
        try:
            return datetime.fromisoformat(valor)
        except ValueError:
            pass
    raise FalhaDoFluxo(f"Data inválida: {valor!r} (use AAAA-MM-DD).")


def _lista(valor: Any, nome: str) -> list[Any]:
    if not isinstance(valor, list):
        raise FalhaDoFluxo(f"'{nome}' precisa de uma lista.")
    return valor


def _numero(valor: Any, nome: str) -> float | int:
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        raise FalhaDoFluxo(f"'{nome}' precisa de um número (recebeu {texto(valor)}).")
    return valor


def texto(valor: Any) -> str:
    if valor is None:
        return ""
    if isinstance(valor, bool):
        return "verdadeiro" if valor else "falso"
    if isinstance(valor, float) and valor.is_integer():
        return str(int(valor))
    if isinstance(valor, (list, dict)):
        return json.dumps(valor, ensure_ascii=False)
    return str(valor)


def _vazio(valor: Any) -> bool:
    return valor is None or valor == "" or valor == [] or valor == {}


def _numeros(args: list[Any], nome: str) -> list[float | int]:
    valores = args[0] if len(args) == 1 and isinstance(args[0], list) else args
    if not valores:
        raise FalhaDoFluxo(f"'{nome}' precisa de ao menos um número.")
    return [_numero(v, nome) for v in valores]


def _formatar(valor: Any, formato: Any) -> str:
    d = para_data(valor)
    saida = str(formato)
    for chave, parte in (("AAAA", f"{d.year:04d}"), ("MM", f"{d.month:02d}"), ("DD", f"{d.day:02d}"),
                         ("hh", f"{d.hour:02d}"), ("mm", f"{d.minute:02d}")):
        saida = saida.replace(chave, parte)
    return saida


def _arredondar(args: list[Any]) -> float | int:
    numero = _numero(args[0], "arredondar")
    casas = int(_numero(args[1], "arredondar")) if len(args) > 1 else 0
    fator = 10 ** casas
    resultado = math.floor(numero * fator + 0.5) / fator  # meio para cima, como na conta de papel
    return int(resultado) if casas == 0 else resultado


def _dividir_em_partes(args: list[Any]) -> list[list[Any]]:
    lista = _lista(args[0], "dividir_em_partes")
    partes = int(_numero(args[1], "dividir_em_partes"))
    if partes < 1:
        raise FalhaDoFluxo("Divida em ao menos 1 parte.")
    tamanho, sobra = divmod(len(lista), partes)
    saida, inicio = [], 0
    for indice in range(min(partes, len(lista)) if lista else 0):
        fim = inicio + tamanho + (1 if indice < sobra else 0)
        saida.append(lista[inicio:fim])
        inicio = fim
    return saida


def _para_numero(valor: Any) -> float | int:
    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        return valor
    try:
        numero = float(str(valor).strip().replace(".", "").replace(",", ".")) if "," in str(valor) else float(str(valor).strip())
    except ValueError as exc:
        raise FalhaDoFluxo(f"Não dá para ler {valor!r} como número.") from exc
    return int(numero) if numero.is_integer() else numero


def _sem_repetidos(lista: list[Any]) -> list[Any]:
    vistos, saida = [], []
    for item in lista:
        if item not in vistos:
            vistos.append(item)
            saida.append(item)
    return saida


FUNCOES: dict[str, Callable[[list[Any], Callable[[], datetime]], Any]] = {
    "tamanho": lambda a, _: len(a[0]) if isinstance(a[0], (list, str)) else 0,
    "vazio": lambda a, _: _vazio(a[0]),
    "contem": lambda a, _: (a[1] in a[0]) if isinstance(a[0], (list, str)) and not (isinstance(a[0], str) and not isinstance(a[1], str)) else False,
    "juntar_texto": lambda a, _: "".join(texto(v) for v in a),
    "substituir": lambda a, _: texto(a[0]).replace(texto(a[1]), texto(a[2])),
    "dividir_texto": lambda a, _: texto(a[0]).split(texto(a[1])) if texto(a[1]) else list(texto(a[0])),
    "maiusculas": lambda a, _: texto(a[0]).upper(),
    "minusculas": lambda a, _: texto(a[0]).lower(),
    "arredondar": lambda a, _: _arredondar(a),
    "minimo": lambda a, _: min(_numeros(a, "minimo")),
    "maximo": lambda a, _: max(_numeros(a, "maximo")),
    "soma": lambda a, _: sum(_numero(v, "soma") for v in _lista(a[0], "soma")),
    "absoluto": lambda a, _: abs(_numero(a[0], "absoluto")),
    "hoje": lambda a, agora: agora().date().isoformat(),
    "agora": lambda a, agora: agora().isoformat(timespec="seconds"),
    "somar_dias": lambda a, _: _somar_dias(a[0], _numero(a[1], "somar_dias")),
    "competencia": lambda a, _: f"{para_data(a[0]).month:02d}/{para_data(a[0]).year:04d}",
    "formatar_data": lambda a, _: _formatar(a[0], a[1]),
    "primeiro": lambda a, _: _lista(a[0], "primeiro")[0] if a[0] else None,
    "ultimo": lambda a, _: _lista(a[0], "ultimo")[-1] if a[0] else None,
    "dividir_em_partes": lambda a, _: _dividir_em_partes(a),
    "sem_repetidos": lambda a, _: _sem_repetidos(_lista(a[0], "sem_repetidos")),
    "para_texto": lambda a, _: texto(a[0]) if not isinstance(a[0], list) else ", ".join(texto(v) for v in a[0]),
    "para_numero": lambda a, _: _para_numero(a[0]),
}


def _somar_dias(valor: Any, dias: float | int) -> str:
    d = para_data(valor)
    novo = d + timedelta(days=dias)
    return novo.date().isoformat() if len(str(valor)) == 10 else novo.isoformat(timespec="seconds")


def chamar(nome: str, args: list[Any], agora: Callable[[], datetime]) -> Any:
    try:
        return FUNCOES[nome](args, agora)
    except FalhaDoFluxo:
        raise
    except (TypeError, ValueError, IndexError, OverflowError) as exc:
        raise FalhaDoFluxo(f"'{nome}' não funcionou com estes valores ({exc}).") from exc


__all__ = ["FUNCOES", "FalhaDoFluxo", "chamar", "date", "para_data", "texto"]
