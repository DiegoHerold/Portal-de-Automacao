"""Parte do trabalho (0.6.0): quando um fluxo do Portal divide o trabalho de um item entre máquinas.

O bloco "Dividir automação entre máquinas", por **partes do trabalho**, põe na fila N jobs do mesmo
item (ex.: a empresa Planet), cada um com uma fatia do trabalho (ex.: 10 dos 50 arquivos TXT). A
fatia chega no parâmetro reservado ``_parte``. A automação precisa declarar ``aceita_partes: true``
na seção ``execucao`` do manifesto e processar **só** a fatia recebida::

    from portal_automacoes import job_atual, parte_do_trabalho

    parte = parte_do_trabalho(job_atual())
    arquivos = parte.fatias if parte else todos_os_arquivos()   # sem parte: o trabalho inteiro
    print(f"parte {parte.indice} de {parte.total}") if parte else None

No Portal, as partes que falharem aparecem em ``fatias_com_erro`` do resultado, e o fluxo pode
repetir só elas.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

PARAMETRO = "_parte"


@dataclass(frozen=True)
class Parte:
    indice: int          # 1, 2, 3...
    total: int           # em quantas partes o trabalho foi dividido
    fatias: list[Any]    # o pedaço do trabalho desta parte (ex.: nomes de arquivos)


def parte_do_trabalho(job: Any) -> Parte | None:
    """A parte deste job, ou ``None`` se o trabalho não foi dividido.

    ``job``: o ``Job`` da instância (modo direto), o dicionário de ``job_atual()`` ou só os parâmetros.
    """
    if job is None:
        return None
    parametros = getattr(job, "parametros", None)
    if parametros is None and isinstance(job, dict):
        parametros = job.get("parametros", job)
    bruto = (parametros or {}).get(PARAMETRO) if isinstance(parametros, dict) else None
    if not isinstance(bruto, dict):
        return None
    try:
        return Parte(indice=int(bruto["indice"]), total=int(bruto["total"]), fatias=list(bruto.get("fatias") or []))
    except (KeyError, TypeError, ValueError):
        return None
