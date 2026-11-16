"""Execução dos fluxos em blocos (Fase 3): iniciar, avançar em fatias, pausar, continuar, cancelar.

- Iniciar roda a **última versão publicada**, com as entradas conferidas (obrigatórias e tipo).
- Uma tarefa do Celery (``workers/tasks/fluxos_tasks.py``) pega as execuções prontas com
  ``FOR UPDATE SKIP LOCKED`` (cada uma num worker só), roda uma fatia do motor e grava estado e
  passos. Esperar não segura worker: a execução fica ``esperando`` até ``acordar_em``.
- Pausar e cancelar pegam a mesma trava da linha, então valem na hora e nunca no meio de uma fatia.
- Limites (Governança > Limites): passos por execução, voltas por laço, tempo máximo, partes por divisão.
- Fase 4: cada fatia recebe os efeitos do Portal (``efeitos.py``: fila, resultado, avisos). Cancelar o
  fluxo também para as automações que ele pôs na fila e ainda não terminaram.
- Fase 7: subfluxo é uma execução filha (``execucao_pai_id``), com a mesma pessoa e as mesmas permissões;
  ao terminar, acorda a mãe na hora. Profundidade máxima de chamadas: ``MAX_PROFUNDIDADE``. O detalhe
  traz o "agora" da tela ao vivo: os jobs com a máquina de cada um, a pergunta aberta ou o subfluxo.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Callable
from uuid import uuid4

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from modules.governance.domain.audit import AuditEvent
from modules.orchestration.fluxos.aplicacao import FluxoNaoEncontrado, PedidoInvalido
from modules.orchestration.fluxos.domain.funcoes import FalhaDoFluxo
from modules.orchestration.fluxos.domain.motor import Interpretador, Limites, conferir_entradas, estado_inicial
from modules.orchestration.fluxos.modelos import FluxoExecucaoRecord, FluxoPassoRecord, FluxoRecord, FluxoVersaoRecord

TERMINAIS = ("concluida", "falhou", "cancelada")
MAX_PROFUNDIDADE = 10
PASSOS_POR_FATIA = 200
PASSOS_NO_DETALHE = 300


def _quem(ator: Any) -> str | None:
    valor = getattr(ator, "id", None)
    return str(valor) if valor is not None else None


class Execucoes:
    def __init__(self, db: Session, auditoria: Any, limites: Callable[[], dict[str, int]],
                 agora: Callable[[], datetime] | None = None) -> None:
        self.db = db
        self.auditoria = auditoria
        self.limites = limites
        self._agora = agora or (lambda: datetime.now(UTC))

    def _efeitos(self, execucao: FluxoExecucaoRecord) -> Any:
        from modules.orchestration.fluxos.efeitos import EfeitosDoPortal

        fluxo = self.db.get(FluxoRecord, execucao.fluxo_id)
        return EfeitosDoPortal(self.db, execucao, fluxo.nome if fluxo else "", self._agora, self.limites()["max_partes"], self)

    # -- iniciar e consultar -----------------------------------------------------------
    def iniciar(self, ator: Any, fluxo_id: str, entradas: Any, origem: str = "manual") -> dict[str, Any]:
        fluxo = self.db.get(FluxoRecord, fluxo_id)
        if fluxo is None:
            raise FluxoNaoEncontrado("Fluxo não encontrado.")
        if fluxo.situacao != "ativo":
            raise PedidoInvalido("Fluxo arquivado não executa: reative antes.")
        versao = self._ultima_versao(fluxo_id)
        if versao is None:
            raise PedidoInvalido("Publique uma versão do fluxo antes de executar.")
        try:
            conferidas = conferir_entradas(versao.ast, entradas if entradas is not None else {})
        except FalhaDoFluxo as exc:
            raise PedidoInvalido(exc.motivo) from exc
        execucao = self._criar(fluxo, versao, conferidas, origem, _quem(ator))
        self._auditar(ator, "fluxo.executado", execucao, {"fluxo": fluxo.id, "versao": versao.numero, "origem": origem})
        return self.detalhe(execucao.id)

    def _ultima_versao(self, fluxo_id: str) -> FluxoVersaoRecord | None:
        return self.db.scalar(select(FluxoVersaoRecord).where(FluxoVersaoRecord.fluxo_id == fluxo_id)
                              .order_by(FluxoVersaoRecord.numero.desc()).limit(1))

    def _criar(self, fluxo: FluxoRecord, versao: FluxoVersaoRecord, entradas: dict[str, Any], origem: str,
               disparado_por: str | None, mae: FluxoExecucaoRecord | None = None, bloco: str | None = None) -> FluxoExecucaoRecord:
        agora = self._agora()
        profundidade = int(mae.estado.get("profundidade", 0)) + 1 if mae is not None else 0
        execucao = FluxoExecucaoRecord(
            id=f"fle_{uuid4().hex[:20]}", fluxo_id=fluxo.id, versao_id=versao.id, versao_numero=versao.numero,
            situacao="rodando", entradas=entradas,
            estado={**estado_inicial(versao.ast, entradas), "linhas": 0, "profundidade": profundidade},
            passos_dados=0, origem=origem, disparado_por=disparado_por, execucao_pai_id=mae.id if mae is not None else None,
            bloco_pai=bloco, criado_em=agora, atualizado_em=agora)
        self.db.add(execucao)
        self.db.flush()
        return execucao

    # -- subfluxo (Fase 7): chamadas pelos efeitos ---------------------------------------
    def iniciar_filha(self, mae: FluxoExecucaoRecord, fluxo_id: str, entradas: dict[str, Any], bloco: str | None) -> tuple[str, str]:
        if int(mae.estado.get("profundidade", 0)) + 1 > MAX_PROFUNDIDADE:
            raise FalhaDoFluxo(f"Fluxos chamando fluxos demais (mais de {MAX_PROFUNDIDADE} níveis).")
        fluxo = self.db.get(FluxoRecord, fluxo_id)
        if fluxo is None or fluxo.situacao != "ativo":
            raise FalhaDoFluxo("O fluxo chamado não existe mais ou está arquivado.")
        versao = self._ultima_versao(fluxo_id)
        if versao is None:
            raise FalhaDoFluxo(f"O fluxo {fluxo.nome} não tem versão publicada.")
        filha = self._criar(fluxo, versao, conferir_entradas(versao.ast, entradas), "subfluxo", mae.disparado_por, mae, bloco)
        self._linha(filha, None, "inicio", f"Chamado pelo fluxo {self._nome(mae.fluxo_id)}.")
        return filha.id, fluxo.nome

    def fim_da_filha(self, execucao_id: str) -> dict[str, Any] | None:
        filha = self.db.get(FluxoExecucaoRecord, execucao_id)
        if filha is None:
            return {"situacao": "falhou", "resultado": None, "motivo": "a execução chamada sumiu"}
        if filha.situacao not in TERMINAIS:
            return None
        return {"situacao": filha.situacao, "resultado": filha.resultado, "motivo": filha.motivo}

    def cancelar_filha(self, execucao_id: str) -> int:
        filha = self.db.scalar(select(FluxoExecucaoRecord).where(FluxoExecucaoRecord.id == execucao_id).with_for_update())
        if filha is None or filha.situacao in TERMINAIS:
            return 0
        self._parar(filha, "O fluxo que chamou foi cancelado.")
        return 1

    def _nome(self, fluxo_id: str) -> str:
        fluxo = self.db.get(FluxoRecord, fluxo_id)
        return fluxo.nome if fluxo else fluxo_id

    def detalhe(self, execucao_id: str) -> dict[str, Any]:
        execucao = self._execucao(execucao_id)
        fluxo = self.db.get(FluxoRecord, execucao.fluxo_id)
        passos = list(self.db.scalars(select(FluxoPassoRecord).where(FluxoPassoRecord.execucao_id == execucao.id)
                                      .order_by(FluxoPassoRecord.numero.desc()).limit(PASSOS_NO_DETALHE)))
        filhas = list(self.db.scalars(select(FluxoExecucaoRecord).where(FluxoExecucaoRecord.execucao_pai_id == execucao.id)
                                      .order_by(FluxoExecucaoRecord.criado_em)))
        mae = self.db.get(FluxoExecucaoRecord, execucao.execucao_pai_id) if execucao.execucao_pai_id else None
        return {**self._resumo(execucao), "fluxo_nome": fluxo.nome if fluxo else None,
                "disparado_por_nome": self._pessoas([execucao.disparado_por]).get(execucao.disparado_por),
                "entradas": execucao.entradas, "variaveis": execucao.estado.get("globais", {}),
                "agora": self._agora_da_execucao(execucao) if execucao.situacao not in TERMINAIS else None,
                "mae": {"id": mae.id, "fluxo_id": mae.fluxo_id, "fluxo_nome": self._nome(mae.fluxo_id), "bloco": execucao.bloco_pai}
                       if mae is not None else None,
                "filhas": [{"id": f.id, "fluxo_id": f.fluxo_id, "fluxo_nome": self._nome(f.fluxo_id), "bloco": f.bloco_pai,
                            "situacao": f.situacao, "criado_em": f.criado_em, "terminado_em": f.terminado_em} for f in filhas],
                "passos": [{"numero": p.numero, "bloco": p.bloco, "tipo": p.tipo, "resumo": p.resumo, "nivel": p.nivel,
                            "quando": p.quando} for p in reversed(passos)]}

    def listar(self, fluxo_id: str, limite: int = 50) -> list[dict[str, Any]]:
        consulta = (select(FluxoExecucaoRecord).where(FluxoExecucaoRecord.fluxo_id == fluxo_id)
                    .order_by(FluxoExecucaoRecord.criado_em.desc()).limit(max(1, min(limite, 200))))
        execucoes = list(self.db.scalars(consulta))
        nomes = self._pessoas([e.disparado_por for e in execucoes])
        return [{**self._resumo(e), "disparado_por_nome": nomes.get(e.disparado_por)} for e in execucoes]

    # -- tela ao vivo ------------------------------------------------------------------
    def _pessoas(self, ids: list[str | None]) -> dict[str | None, str]:
        from modules.access.infrastructure.orm.models import AccessUserRecord

        numeros = {int(i) for i in ids if i and str(i).isdigit()}
        if not numeros:
            return {}
        return {str(pid): nome for pid, nome in self.db.execute(
            select(AccessUserRecord.id, AccessUserRecord.name).where(AccessUserRecord.id.in_(numeros)))}

    def _agora_da_execucao(self, execucao: FluxoExecucaoRecord) -> dict[str, Any] | None:
        """O que a execução espera agora: jobs (com a máquina de cada um), uma pergunta ou um subfluxo."""
        espera = execucao.estado.get("espera")
        if not espera:
            return None
        base: dict[str, Any] = {"bloco": espera.get("bloco")}
        if espera.get("tipo") == "decisao":
            from modules.orchestration.fluxos.modelos import FluxoDecisaoRecord

            decisao = self.db.get(FluxoDecisaoRecord, espera.get("decisao"))
            return {**base, "tipo": "decisao", "decisao": espera.get("decisao"),
                    "pergunta": decisao.pergunta if decisao else None, "opcoes": decisao.opcoes if decisao else [],
                    "desde": decisao.criada_em if decisao else None}
        if espera.get("tipo") == "subfluxo":
            filha = self.db.get(FluxoExecucaoRecord, espera.get("execucao"))
            return {**base, "tipo": "subfluxo", "execucao": espera.get("execucao"), "fluxo_nome": espera.get("nome"),
                    "situacao": filha.situacao if filha else None, "bloco_atual": filha.bloco_atual if filha else None}
        pedido = espera.get("pedido") or {}
        return {**base, "tipo": "automacao", "automacao": pedido.get("automacao"), "modo": pedido.get("modo"),
                "tentativa": espera.get("tentativa", 1), "nova_tentativa_em": espera.get("repetir_em"),
                "jobs": self._jobs_ao_vivo(espera.get("jobs") or [])}

    def _jobs_ao_vivo(self, jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        from sqlalchemy import func

        from modules.fleet.infrastructure.orm.models import AgentRecord, MachineRecord
        from modules.orchestration.infrastructure.orm.models import ExecutionAttemptRecord, TaskExecutionRecord

        ids = [j["job"] for j in jobs]
        if not ids:
            return []
        maquina = func.coalesce(ExecutionAttemptRecord.machine_id, AgentRecord.machine_id)
        linhas = self.db.execute(
            select(TaskExecutionRecord, MachineRecord.name)
            .outerjoin(ExecutionAttemptRecord, (ExecutionAttemptRecord.task_execution_id == TaskExecutionRecord.id)
                       & (ExecutionAttemptRecord.attempt_number == TaskExecutionRecord.current_attempt_number))
            .outerjoin(AgentRecord, AgentRecord.id == ExecutionAttemptRecord.agent_id)
            .outerjoin(MachineRecord, MachineRecord.id == maquina)
            .where(TaskExecutionRecord.id.in_(ids))).all()
        por_id = {t.id: (t, nome) for t, nome in linhas}
        saida = []
        for j in jobs:
            tarefa, nome = por_id.get(j["job"], (None, None))
            saida.append({"job": j["job"], "parte": j.get("parte"), "itens": j.get("itens") or [], "fatias": len(j.get("fatias") or []),
                          "situacao": tarefa.status if tarefa else None, "maquina": nome,
                          "execucao": tarefa.execution_id if tarefa else None,
                          "comecou_em": tarefa.started_at if tarefa else None, "terminou_em": tarefa.completed_at if tarefa else None})
        return saida

    # -- pausar, continuar, cancelar ---------------------------------------------------
    def pausar(self, ator: Any, execucao_id: str) -> dict[str, Any]:
        execucao = self._travada(execucao_id)
        if execucao.situacao not in ("rodando", "esperando"):
            raise PedidoInvalido(f"Só dá para pausar uma execução rodando ou esperando (esta está {execucao.situacao}).")
        execucao.situacao, execucao.atualizado_em = "pausada", self._agora()
        self._linha(execucao, None, "pausar", "Pausada por uma pessoa.", "aviso")
        self._auditar(ator, "fluxo.execucao_pausada", execucao)
        return self.detalhe(execucao.id)

    def continuar(self, ator: Any, execucao_id: str) -> dict[str, Any]:
        execucao = self._travada(execucao_id)
        if execucao.situacao != "pausada":
            raise PedidoInvalido("Só dá para continuar uma execução pausada.")
        agora = self._agora()
        execucao.situacao = "esperando" if execucao.acordar_em and execucao.acordar_em > agora else "rodando"
        execucao.atualizado_em = agora
        self._linha(execucao, None, "continuar", "Continuada por uma pessoa.")
        self._auditar(ator, "fluxo.execucao_continuada", execucao)
        return self.detalhe(execucao.id)

    def cancelar(self, ator: Any, execucao_id: str) -> dict[str, Any]:
        execucao = self._travada(execucao_id)
        if execucao.situacao in TERMINAIS:
            raise PedidoInvalido(f"A execução já terminou ({execucao.situacao}).")
        self._parar(execucao, "Cancelada por uma pessoa.")
        self._auditar(ator, "fluxo.execucao_cancelada", execucao)
        return self.detalhe(execucao.id)

    def _parar(self, execucao: FluxoExecucaoRecord, motivo: str) -> None:
        agora = self._agora()
        espera = execucao.estado.get("espera")
        if espera:
            paradas = self._efeitos(execucao).cancelar(espera)
            if espera.get("tipo") == "subfluxo":
                parado = "O fluxo chamado foi cancelado." if paradas else "O fluxo chamado já tinha terminado."
            elif espera.get("tipo") == "decisao":
                parado = "A pergunta em aberto foi cancelada." if paradas else "A pergunta já estava respondida."
            else:
                parado = f"{paradas} execução(ões) de automação paradas."
            self._linha(execucao, espera.get("bloco"), "cancelar", parado, "aviso")
            execucao.estado = {k: v for k, v in execucao.estado.items() if k != "espera"}
        execucao.situacao, execucao.terminado_em, execucao.atualizado_em = "cancelada", agora, agora
        execucao.motivo, execucao.acordar_em = motivo, None
        self._linha(execucao, None, "cancelar", motivo, "aviso")

    # -- avanço (tarefa periódica) -----------------------------------------------------
    def avancar_prontas(self, limite: int = 20) -> int:
        """Uma fatia para cada execução pronta (rodando, ou esperando com o horário vencido)."""
        agora = self._agora()
        prontas = list(self.db.scalars(
            select(FluxoExecucaoRecord)
            .where(or_(FluxoExecucaoRecord.situacao == "rodando",
                       and_(FluxoExecucaoRecord.situacao == "esperando", FluxoExecucaoRecord.acordar_em <= agora)))
            .order_by(FluxoExecucaoRecord.atualizado_em).limit(limite).with_for_update(skip_locked=True)))
        for execucao in prontas:
            self._fatia(execucao)
        return len(prontas)

    def _fatia(self, execucao: FluxoExecucaoRecord) -> None:
        agora = self._agora()
        limites = self.limites()
        if (agora - execucao.criado_em).total_seconds() > limites["max_duracao_segundos"]:
            motivo = f"O fluxo passou do tempo máximo de {limites['max_duracao_segundos'] // 3600} h (Governança > Limites)."
            self._linha(execucao, execucao.bloco_atual, "falhar", motivo, "erro", agora)
            self._terminar(execucao, "falhou", None, motivo, agora)
            return
        versao = self.db.get(FluxoVersaoRecord, execucao.versao_id)
        motor = Interpretador(versao.ast, execucao.estado, self._agora,
                              Limites(max_passos=limites["max_passos"], max_voltas=limites["max_voltas"]),
                              efeitos=self._efeitos(execucao))
        fatia = motor.avancar(PASSOS_POR_FATIA)
        execucao.estado = {**fatia.estado, "linhas": execucao.estado.get("linhas", 0)}
        for passo in fatia.passos:
            self._linha(execucao, passo.bloco, passo.tipo, passo.resumo, passo.nivel, agora)
        execucao.passos_dados = fatia.estado.get("passos", 0)
        execucao.bloco_atual = fatia.bloco_atual
        execucao.atualizado_em = agora
        if fatia.situacao in ("concluida", "falhou"):
            self._terminar(execucao, fatia.situacao, fatia.resultado, fatia.motivo, agora)
        elif fatia.situacao == "esperando":
            execucao.situacao, execucao.acordar_em = "esperando", fatia.acordar_em
        else:
            execucao.situacao, execucao.acordar_em = "rodando", None

    def _terminar(self, execucao: FluxoExecucaoRecord, situacao: str, resultado: Any, motivo: str | None, agora: datetime) -> None:
        execucao.situacao, execucao.resultado, execucao.motivo = situacao, resultado, motivo
        execucao.terminado_em, execucao.atualizado_em, execucao.acordar_em = agora, agora, None
        if execucao.execucao_pai_id:  # subfluxo: a mãe confere na hora (se outro worker a segura, confere sozinha depois)
            mae = self.db.scalar(select(FluxoExecucaoRecord).where(FluxoExecucaoRecord.id == execucao.execucao_pai_id)
                                 .with_for_update(skip_locked=True))
            if mae is not None and mae.situacao == "esperando":
                mae.acordar_em = agora

    # -- apoio -------------------------------------------------------------------------
    def _execucao(self, execucao_id: str) -> FluxoExecucaoRecord:
        execucao = self.db.get(FluxoExecucaoRecord, execucao_id)
        if execucao is None:
            raise FluxoNaoEncontrado("Execução não encontrada.")
        return execucao

    def _travada(self, execucao_id: str) -> FluxoExecucaoRecord:
        execucao = self.db.scalar(select(FluxoExecucaoRecord).where(FluxoExecucaoRecord.id == execucao_id).with_for_update())
        if execucao is None:
            raise FluxoNaoEncontrado("Execução não encontrada.")
        return execucao

    def _linha(self, execucao: FluxoExecucaoRecord, bloco: str | None, tipo: str, resumo: str, nivel: str = "info",
               quando: datetime | None = None) -> None:
        numero = int(execucao.estado.get("linhas", 0)) + 1
        execucao.estado = {**execucao.estado, "linhas": numero}
        self.db.add(FluxoPassoRecord(execucao_id=execucao.id, numero=numero, bloco=bloco, tipo=tipo, resumo=resumo[:2000],
                                     nivel=nivel, quando=quando or self._agora()))

    @staticmethod
    def _resumo(execucao: FluxoExecucaoRecord) -> dict[str, Any]:
        return {"id": execucao.id, "fluxo_id": execucao.fluxo_id, "versao": execucao.versao_numero,
                "execucao_pai_id": execucao.execucao_pai_id,
                "situacao": execucao.situacao, "bloco_atual": execucao.bloco_atual, "passos_dados": execucao.passos_dados,
                "acordar_em": execucao.acordar_em, "resultado": execucao.resultado, "motivo": execucao.motivo,
                "origem": execucao.origem, "disparado_por": execucao.disparado_por, "criado_em": execucao.criado_em,
                "terminado_em": execucao.terminado_em}

    def _auditar(self, ator: Any, acao: str, execucao: FluxoExecucaoRecord, depois: dict | None = None) -> None:
        self.auditoria.append(AuditEvent(
            id=f"aud_{uuid4().hex}", actor_type="user", actor_id=_quem(ator), action=acao, resource_type="fluxo_execucao",
            resource_id=execucao.id, after=depois or {"fluxo": execucao.fluxo_id, "situacao": execucao.situacao},
            organization_id=getattr(ator, "organization_id", None), occurred_at=self._agora()))


def limites_do_portal(db: Session) -> Callable[[], dict[str, int]]:
    from modules.governance.infrastructure.limites import ler_limite

    return lambda: {"max_passos": ler_limite(db, "fluxo.max_passos"), "max_voltas": ler_limite(db, "fluxo.max_voltas"),
                    "max_duracao_segundos": ler_limite(db, "fluxo.max_duracao_segundos"),
                    "max_partes": ler_limite(db, "fluxo.max_partes")}


def build_execucoes(db: Session) -> Execucoes:
    from modules.governance.infrastructure.adapters import build_governance_adapters

    return Execucoes(db, build_governance_adapters(db).audit, limites_do_portal(db))
