"""Fluxos em blocos (Fase 3): avança as execuções prontas, uma fatia por vez."""

from __future__ import annotations

from infrastructure.database import SessionLocal
from workers.celery_app import celery_app


@celery_app.task(name="workers.tasks.fluxos_tasks.avancar")
def avancar() -> int:
    from modules.orchestration.fluxos.execucoes import build_execucoes

    with SessionLocal() as db:
        feitas = build_execucoes(db).avancar_prontas()
        db.commit()
        return feitas
