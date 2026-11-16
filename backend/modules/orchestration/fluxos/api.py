"""API dos fluxos em blocos (Fase 2). Regras em ``aplicacao.py``; contrato em ``contracts/flows/v1``.

- ``GET /fluxos/contrato``: o JSON Schema do contrato (o editor usa o mesmo arquivo).
- ``GET /fluxos`` (``?arquivados=true``), ``POST /fluxos`` (``{nome, descricao}``).
- ``GET /fluxos/{id}``: dados, rascunho, erros do rascunho e versões. ``PUT /fluxos/{id}``: nome,
  descrição e situação (``ativo``/``arquivado``).
- ``PUT /fluxos/{id}/rascunho`` (a AST): grava mesmo com erros e devolve ``{"erros": [...]}``.
- ``POST /fluxos/{id}/validar`` (AST opcional; sem corpo, valida o rascunho).
- ``POST /fluxos/{id}/publicar`` (``{notas}``): versão nova; com erros, 422 ``FLUXO_INVALIDO`` com
  ``error.details.erros``.
- ``GET /fluxos/{id}/versoes/{numero}``: a AST publicada.
- Decisões (Fase 5): ``GET /fluxos/decisoes`` (as abertas que a pessoa pode responder),
  ``GET /fluxos/decisoes/{id}``, ``POST /fluxos/decisoes/{id}/responder`` (``{opcao: índice, via}``); já
  respondida: 409 ``JA_RESPONDIDA`` com quem, quando e por onde.
- Execuções (Fase 3): ``POST /fluxos/{id}/executar`` (``{entradas}``, roda a última versão publicada),
  ``GET /fluxos/{id}/execucoes``, ``GET /fluxos/execucoes/{id}`` (situação, bloco atual, variáveis e
  passos), ``POST /fluxos/execucoes/{id}/pausar``, ``.../continuar``, ``.../cancelar``.

Ver: ``fluxos.ver`` ou ``fluxos.gerenciar``. Mudar e publicar: ``fluxos.gerenciar``.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from infrastructure.database import get_db
from modules.access.api.authorization import precisa
from modules.access.api.dependencies import get_current_user
from modules.orchestration.fluxos.aplicacao import FluxoInvalido, FluxoNaoEncontrado, Fluxos, PedidoInvalido
from modules.orchestration.fluxos.domain.validador import SCHEMA_PATH
from modules.orchestration.fluxos.repositorio import ContextoDoPortal, SqlAlchemyFluxos

router = APIRouter(prefix="/fluxos", tags=["fluxos"])
VER = [Depends(precisa("fluxos.ver", "fluxos.gerenciar"))]
GERENCIAR = [Depends(precisa("fluxos.gerenciar"))]


def fluxos(db: Session) -> Fluxos:
    from modules.governance.infrastructure.adapters import build_governance_adapters

    return Fluxos(SqlAlchemyFluxos(db), build_governance_adapters(db).audit, ContextoDoPortal(db))


def execucoes(db: Session) -> Any:
    from modules.orchestration.fluxos.execucoes import build_execucoes

    return build_execucoes(db)


def _fazer(db: Session, acao: Any, gravar: bool = False) -> Any:
    try:
        resultado = acao()
        if gravar:
            db.commit()
        return resultado
    except FluxoNaoEncontrado as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FluxoInvalido as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail={"error": {"code": "FLUXO_INVALIDO", "message": str(exc),
                                                               "details": {"erros": [e.para_api() for e in exc.erros]}}}) from exc
    except PedidoInvalido as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/contrato", dependencies=VER)
def contrato() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


# -- decisões (Fase 5): quem foi perguntado responde; não pede a funcionalidade Fluxos ------------------
def _decisoes(db: Session) -> Any:
    from modules.governance.infrastructure.adapters import build_governance_adapters
    from modules.orchestration.fluxos.decisoes import Decisoes

    return Decisoes(db, build_governance_adapters(db).audit)


def _fazer_decisao(db: Session, acao: Any, gravar: bool = False) -> Any:
    from modules.orchestration.fluxos.decisoes import JaRespondida, SemPermissao

    try:
        return _fazer(db, acao, gravar)
    except SemPermissao as exc:
        db.rollback()
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except JaRespondida as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail={"error": {"code": "JA_RESPONDIDA", "message": str(exc),
                                                               "details": {"resolucao": jsonable_encoder(exc.resolucao)}}}) from exc


@router.get("/decisoes")
def decisoes_abertas(db: Session = Depends(get_db), user: Any = Depends(get_current_user)) -> dict[str, Any]:
    return {"decisoes": _decisoes(db).listar(user)}


@router.get("/decisoes/{decisao_id}")
def decisao(decisao_id: str, db: Session = Depends(get_db), user: Any = Depends(get_current_user)) -> dict[str, Any]:
    return _fazer_decisao(db, lambda: _decisoes(db).obter(user, decisao_id))


@router.post("/decisoes/{decisao_id}/responder")
def responder(decisao_id: str, corpo: dict[str, Any] = Body(...), db: Session = Depends(get_db),
              user: Any = Depends(get_current_user)) -> dict[str, Any]:
    return _fazer_decisao(db, lambda: _decisoes(db).responder(user, decisao_id, corpo.get("opcao"), str(corpo.get("via") or "portal")),
                          gravar=True)


@router.get("/execucoes/{execucao_id}", dependencies=VER)
def execucao(execucao_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    return _fazer(db, lambda: execucoes(db).detalhe(execucao_id))


@router.post("/execucoes/{execucao_id}/{acao}", dependencies=GERENCIAR)
def agir(execucao_id: str, acao: str, db: Session = Depends(get_db), user: Any = Depends(get_current_user)) -> dict[str, Any]:
    if acao not in ("pausar", "continuar", "cancelar"):
        raise HTTPException(status_code=404, detail="Ação desconhecida.")
    return _fazer(db, lambda: getattr(execucoes(db), acao)(user, execucao_id), gravar=True)


@router.get("", dependencies=VER)
def listar(arquivados: bool = False, db: Session = Depends(get_db)) -> dict[str, Any]:
    return {"fluxos": fluxos(db).listar(arquivados)}


@router.post("", status_code=201, dependencies=GERENCIAR)
def criar(corpo: dict[str, Any] = Body(...), db: Session = Depends(get_db), user: Any = Depends(get_current_user)) -> dict[str, Any]:
    return _fazer(db, lambda: fluxos(db).criar(user, corpo), gravar=True)


@router.get("/{fluxo_id}", dependencies=VER)
def obter(fluxo_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    return _fazer(db, lambda: fluxos(db).obter(fluxo_id))


@router.put("/{fluxo_id}", dependencies=GERENCIAR)
def mudar(fluxo_id: str, corpo: dict[str, Any] = Body(...), db: Session = Depends(get_db),
          user: Any = Depends(get_current_user)) -> dict[str, Any]:
    return _fazer(db, lambda: fluxos(db).mudar(user, fluxo_id, corpo), gravar=True)


@router.put("/{fluxo_id}/rascunho", dependencies=GERENCIAR)
def salvar_rascunho(fluxo_id: str, corpo: Any = Body(...), db: Session = Depends(get_db),
                    user: Any = Depends(get_current_user)) -> dict[str, Any]:
    return {"erros": _fazer(db, lambda: fluxos(db).salvar_rascunho(user, fluxo_id, corpo), gravar=True)}


@router.post("/{fluxo_id}/validar", dependencies=VER)
def validar(fluxo_id: str, corpo: Any = Body(None), db: Session = Depends(get_db)) -> dict[str, Any]:
    return {"erros": _fazer(db, lambda: fluxos(db).validar(fluxo_id, corpo))}


@router.post("/{fluxo_id}/publicar", status_code=201, dependencies=GERENCIAR)
def publicar(fluxo_id: str, corpo: dict[str, Any] | None = Body(None), db: Session = Depends(get_db),
             user: Any = Depends(get_current_user)) -> dict[str, Any]:
    return _fazer(db, lambda: fluxos(db).publicar(user, fluxo_id, (corpo or {}).get("notas")), gravar=True)


@router.post("/{fluxo_id}/executar", status_code=201, dependencies=GERENCIAR)
def executar(fluxo_id: str, corpo: dict[str, Any] | None = Body(None), db: Session = Depends(get_db),
             user: Any = Depends(get_current_user)) -> dict[str, Any]:
    return _fazer(db, lambda: execucoes(db).iniciar(user, fluxo_id, (corpo or {}).get("entradas", {})), gravar=True)


@router.get("/{fluxo_id}/execucoes", dependencies=VER)
def execucoes_do_fluxo(fluxo_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    return {"execucoes": execucoes(db).listar(fluxo_id)}


@router.get("/{fluxo_id}/versoes/{numero}", dependencies=VER)
def versao(fluxo_id: str, numero: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    return _fazer(db, lambda: fluxos(db).versao(fluxo_id, numero))
