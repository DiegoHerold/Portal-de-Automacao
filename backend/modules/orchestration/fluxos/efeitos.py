"""Efeitos dos fluxos no Portal (Fase 4): fila, resultado dos jobs, cancelamento e avisos.

Tudo na mesma transação da fatia do motor: se a fatia cair, nada fica na fila pela metade.

- **Executar automação**: um pedido à fila, igual ao Executar (origem ``flow``), com o cadastro atual
  dos itens. Quem disparou o fluxo precisa poder **executar** a automação.
- **Dividir por itens**: N jobs numa execução, sem separar um grupo (matriz fica com as filiais).
- **Dividir por partes do trabalho**: N execuções do mesmo item, cada uma com ``_parte`` =
  ``{indice, total, fatias}`` nos parâmetros (SDK: ``job.parte``). Só para automação que declara
  ``aceita_partes`` no manifesto.
- O fluxo espera pelos **jobs** (a fila pode reaproveitar um job igual que já estava na fila).
- **Perguntar a uma pessoa** (Fase 5): cria a decisão (``fluxo_decisoes``) com quem pode responder,
  avisa no sino e por e-mail (correio central), com um botão por opção que leva ao Portal (com login).
- **Chamar outro fluxo** (Fase 7): uma execução filha pelas ``Execucoes`` (mesma pessoa, mesmas
  permissões); o fluxo espera a filha terminar. Cancelar a mãe cancela a filha.
"""

from __future__ import annotations

import html
import math
from datetime import datetime
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from modules.orchestration.fluxos.domain.funcoes import FalhaDoFluxo, texto

TERMINAIS = ("succeeded", "failed", "cancelled", "timed_out", "skipped")
ITEM_OK = ("ok",)
ITEM_ATENCAO = ("atencao",)


def dividir_em_grupos(itens: list[dict[str, Any]], partes: int) -> list[list[str]]:
    """Reparte os itens em até ``partes`` partes de tamanho parecido, sem separar um grupo."""
    from modules.dispatch.domain.fila import agrupar

    grupos = sorted(agrupar(itens), key=len, reverse=True)
    caixas: list[list[dict[str, Any]]] = [[] for _ in range(min(partes, len(grupos)))]
    for grupo in grupos:  # o maior grupo vai para a parte mais vazia
        min(caixas, key=len).extend(grupo)
    return [[str(i["chave"]) for i in caixa] for caixa in caixas if caixa]


def dividir_lista(lista: list[Any], partes: int) -> list[list[Any]]:
    tamanho, sobra = divmod(len(lista), partes)
    saida, inicio = [], 0
    for indice in range(min(partes, len(lista))):
        fim = inicio + tamanho + (1 if indice < sobra else 0)
        saida.append(lista[inicio:fim])
        inicio = fim
    return saida


class EfeitosDoPortal:
    def __init__(self, db: Session, execucao: Any, fluxo_nome: str, agora: Callable[[], datetime],
                 max_partes: int, execucoes: Any = None) -> None:
        self.execucoes = execucoes
        self.db = db
        self.execucao = execucao
        self.fluxo_nome = fluxo_nome
        self.agora = agora
        self.max_partes = max_partes

    # -- fila ------------------------------------------------------------------------------
    def enfileirar(self, pedido: dict[str, Any]) -> dict[str, Any]:
        automacao = self._automacao(pedido["automacao"])
        versao, manifesto = self._versao_publicada(automacao.id)
        parametros = dict(pedido.get("parametros") or {})
        if pedido["tipo"] == "dividir_automacao" and pedido.get("modo") == "fatias":
            if not (manifesto.get("execution") or {}).get("split_work"):
                raise FalhaDoFluxo(f"A automação {automacao.name} não aceita rodar em partes do trabalho "
                                   "(declare execution.aceita_partes no manifesto).")
            partes = dividir_lista(list(pedido["fatias"]), self._quantas(pedido, len(pedido["fatias"])))
            itens = self._itens(automacao.id, [pedido["item"]])
            jobs, execucoes = [], []
            for indice, fatias in enumerate(partes, start=1):
                feito = self._fila(versao, itens, {**parametros, "_parte": {"indice": indice, "total": len(partes), "fatias": fatias}})
                execucoes.append(feito["execution_id"])
                jobs += [{"job": j["job_id"], "parte": indice, "itens": j["itens"], "fatias": fatias} for j in feito["jobs"]]
            return {"jobs": jobs, "execucoes": [e for e in execucoes if e]}
        itens = self._itens(automacao.id, list(pedido.get("itens") or []))
        agrupamento = None
        if pedido["tipo"] == "dividir_automacao":
            if not itens:
                raise FalhaDoFluxo("Não há itens para dividir.")
            agrupamento = dividir_em_grupos(itens, self._quantas(pedido, len(itens)))
        feito = self._fila(versao, itens, parametros, agrupamento)
        return {"jobs": [{"job": j["job_id"], "parte": i, "itens": j["itens"]} for i, j in enumerate(feito["jobs"], start=1)],
                "execucoes": [feito["execution_id"]] if feito["execution_id"] else []}

    def _quantas(self, pedido: dict[str, Any], total: int) -> int:
        partes = pedido.get("partes") or math.ceil(total / max(1, int(pedido.get("itens_por_parte") or 1)))
        if partes > self.max_partes:
            raise FalhaDoFluxo(f"Dividir em {partes} partes passa do limite de {self.max_partes} (Governança > Limites).")
        return max(1, min(int(partes), total))

    def _fila(self, versao_id: int, itens: list[dict[str, Any]], parametros: dict[str, Any],
              agrupamento: list[list[str]] | None = None) -> dict[str, Any]:
        from modules.dispatch.infrastructure.adapters.fila import build_fila
        from modules.orchestration.application.use_cases.queue import FilaError

        try:
            return build_fila(self.db).enfileirar.execute(
                automation_version_id=versao_id, itens=itens, parametros=parametros, prioridade=0,
                solicitante=self.execucao.disparado_por, now=self.agora(), origem="flow", agrupamento=agrupamento)
        except FilaError as exc:
            raise FalhaDoFluxo(str(exc)) from exc

    def _automacao(self, chave: str) -> Any:
        from modules.access.api.authorization import acesso_por_automacao
        from modules.access.domain.concessao import EXECUTAR
        from modules.access.infrastructure.adapters import build_access_adapters
        from modules.catalog.infrastructure.orm.models import CatalogAutomationRecord

        automacao = self.db.scalar(select(CatalogAutomationRecord).where(CatalogAutomationRecord.key == chave))
        if automacao is None:
            raise FalhaDoFluxo(f"A automação {chave} não existe mais no Catálogo.")
        pessoa = build_access_adapters(self.db).access.get_user_record(int(self.execucao.disparado_por)) \
            if self.execucao.disparado_por and str(self.execucao.disparado_por).isdigit() else None
        if pessoa is None or not acesso_por_automacao(self.db).pode(pessoa, automacao.id, EXECUTAR):
            raise FalhaDoFluxo(f"Quem disparou o fluxo não pode executar a automação {automacao.name}.")
        return automacao

    def _versao_publicada(self, automation_id: int) -> tuple[int, dict[str, Any]]:
        from modules.catalog.infrastructure.orm.models import CatalogAutomationVersionRecord
        from modules.catalog.infrastructure.repositories.sqlalchemy_itens import SqlAlchemyItemRegistry

        versao = self.db.scalar(select(CatalogAutomationVersionRecord.id).where(
            CatalogAutomationVersionRecord.automation_id == automation_id, CatalogAutomationVersionRecord.status == "published")
            .order_by(CatalogAutomationVersionRecord.id.desc()).limit(1))
        if versao is None:
            raise FalhaDoFluxo("A automação não tem versão publicada.")
        return versao, SqlAlchemyItemRegistry(self.db).manifesto(automation_id) or {}

    def _itens(self, automation_id: int, chaves: list[str]) -> list[dict[str, Any]]:
        """O cadastro atual de cada item (como o Executar); item fora do cadastro vai só com a chave."""
        from modules.catalog.domain.itens import configuracao_de_trabalho
        from modules.catalog.infrastructure.repositories.sqlalchemy_itens import SqlAlchemyItemRegistry

        registro = SqlAlchemyItemRegistry(self.db)
        spec = registro.spec(automation_id)
        atuais = {r.chave: r for r in registro.selecionar(automation_id, chaves, False)} if spec is not None and chaves else {}
        itens = []
        for chave in chaves:
            r = atuais.get(chave)
            if r is not None:
                itens.append({"chave": r.chave, "rotulo": r.rotulo, "grupo": r.grupo_chave or r.chave,
                              "atributos": dict(r.atributos or {}), "configuracao": configuracao_de_trabalho(spec, dict(r.atributos or {}))})
            else:
                itens.append({"chave": chave, "rotulo": chave, "grupo": chave, "atributos": {}, "configuracao": {}})
        return itens

    # -- resultado ---------------------------------------------------------------------------
    def conferir(self, espera: dict[str, Any]) -> dict[str, Any] | None:
        if espera.get("tipo") == "decisao":
            return self._conferir_decisao(espera)
        if espera.get("tipo") == "subfluxo":
            return self.execucoes.fim_da_filha(espera["execucao"])
        return self._conferir_jobs(espera)

    # -- subfluxo (Fase 7) ---------------------------------------------------------------------
    def chamar_subfluxo(self, fluxo_id: str, entradas: dict[str, Any], bloco: str | None) -> dict[str, Any]:
        filha, nome = self.execucoes.iniciar_filha(self.execucao, fluxo_id, entradas, bloco)
        return {"tipo": "subfluxo", "execucao": filha, "nome": nome}

    def _conferir_jobs(self, espera: dict[str, Any]) -> dict[str, Any] | None:
        from modules.orchestration.infrastructure.orm.models import ExecutionItemRecord, TaskExecutionRecord
        from modules.storage.infrastructure.orm.models import ArtifactRecord

        ids = [j["job"] for j in espera.get("jobs", [])]
        tarefas = {t.id: t for t in self.db.scalars(select(TaskExecutionRecord).where(TaskExecutionRecord.id.in_(ids)))} if ids else {}
        if any(tarefas.get(i) is None or tarefas[i].status not in TERMINAIS for i in ids):
            return None
        itens = list(self.db.scalars(select(ExecutionItemRecord).where(ExecutionItemRecord.task_execution_id.in_(ids)))) if ids else []
        por_job: dict[str, list[Any]] = {}
        for item in itens:
            por_job.setdefault(item.task_execution_id, []).append(item)
        itens_ok, com_erro, em_atencao, fatias_com_erro, partes_com_erro = [], [], [], [], []
        for job in espera.get("jobs", []):
            tarefa = tarefas[job["job"]]
            seus = por_job.get(job["job"], [])
            deu_certo = tarefa.status == "succeeded" and all(i.status in ITEM_OK for i in seus)
            for item in seus:
                if item.status in ITEM_OK and tarefa.status == "succeeded":
                    itens_ok.append(item.item_key)
                elif item.status in ITEM_ATENCAO:
                    em_atencao.append(item.item_key)
                    com_erro.append(item.item_key)
                else:
                    com_erro.append(item.item_key)
            if not deu_certo:
                partes_com_erro.append({"parte": job.get("parte"), "situacao": tarefa.status, "motivo": tarefa.failure_summary})
                fatias_com_erro += list(job.get("fatias") or [])
        arquivos = [{"id": a.id, "nome": a.name, "execucao": a.execution_id} for a in self.db.scalars(
            select(ArtifactRecord).where(ArtifactRecord.task_execution_id.in_(ids), ArtifactRecord.status == "available",
                                         ~ArtifactRecord.name.like("passos/%")))] if ids else []
        situacoes = {t.status for t in tarefas.values()}
        if situacoes == {"cancelled"}:
            situacao = "cancelada"
        elif not partes_com_erro:
            situacao = "ok"
        elif len(partes_com_erro) == len(espera.get("jobs", [])) and not itens_ok:
            situacao = "falhou"
        else:
            situacao = "parcial"
        sem_itens = not itens
        motivo = next((p["motivo"] for p in partes_com_erro if p["motivo"]), None)
        return {"situacao": situacao, "motivo": motivo, "itens_ok": list(dict.fromkeys(itens_ok)),
                "itens_com_erro": list(dict.fromkeys(com_erro)), "itens_em_atencao": list(dict.fromkeys(em_atencao)),
                "fatias_com_erro": fatias_com_erro, "partes_com_erro": partes_com_erro, "arquivos": arquivos,
                "total_ok": (len(espera.get("jobs", [])) - len(partes_com_erro)) if sem_itens else len(set(itens_ok)),
                "total_com_erro": len(partes_com_erro) if sem_itens else len(set(com_erro)),
                "execucao": (espera.get("execucoes") or [None])[0]}

    # -- cancelar ------------------------------------------------------------------------------
    def cancelar(self, espera: dict[str, Any]) -> int:
        """Para (agora) as execuções que o fluxo pôs na fila e ainda não terminaram (ou a pergunta em aberto)."""
        if espera.get("tipo") == "subfluxo":
            return self.execucoes.cancelar_filha(espera["execucao"])
        if espera.get("tipo") == "decisao":
            from modules.orchestration.fluxos.modelos import FluxoDecisaoRecord

            decisao = self.db.get(FluxoDecisaoRecord, espera["decisao"])
            if decisao is not None and decisao.situacao == "aguardando":
                decisao.situacao = "cancelada"
                return 1
            return 0
        from modules.dispatch.infrastructure.adapters.fila import build_parar
        from modules.orchestration.application.use_cases.queue import FilaError

        def cancelar_no_agent(execucao: str, razao: str | None) -> object:
            from modules.dispatch.infrastructure.adapters import build_dispatch_adapters
            from modules.orchestration.application.dto import ActorDTO
            from modules.orchestration.application.use_cases.resilience import RequestExecutionCancellation

            d = build_dispatch_adapters(self.db)
            return RequestExecutionCancellation(d.executions, d.tasks, d.attempts, d.cancellation_requests, d.commands,
                                                d.reservations, d.locks, d.leases, d.outbox, d.transaction).execute(
                execucao, actor=ActorDTO(actor_type="system", actor_id="fluxos"), reason=razao or "fluxo cancelado")

        paradas = 0
        for execucao_id in espera.get("execucoes") or []:
            try:
                build_parar(self.db, cancelar_no_agent).execute(execution_id=execucao_id, modo="agora",
                                                                motivo=f"Fluxo {self.fluxo_nome} cancelado", now=self.agora())
                paradas += 1
            except FilaError:
                continue  # já terminou
        return paradas

    # -- perguntar (Fase 5) --------------------------------------------------------------------
    def perguntar(self, para: dict[str, Any], pergunta: str, opcoes: list[str], bloco: str | None) -> dict[str, Any]:
        from uuid import uuid4

        from infrastructure.config import get_settings
        from modules.orchestration.fluxos.modelos import FluxoDecisaoRecord
        from modules.telemetry.domain.notificacoes import Ocorrencia
        from modules.telemetry.infrastructure.repositories.sqlalchemy_notificacoes import SqlAlchemyNotificacoes

        pessoas = self._pessoas(para)
        decisao = FluxoDecisaoRecord(id=f"dec_{uuid4().hex[:20]}", execucao_id=self.execucao.id, fluxo_id=self.execucao.fluxo_id,
                                     bloco=bloco, pergunta=pergunta[:2000], opcoes=list(opcoes),
                                     destinatarios=[pid for pid, _ in pessoas], situacao="aguardando", criada_em=self.agora())
        self.db.add(decisao)
        self.db.flush()
        link = f"/pendencias/decisoes/{decisao.id}"
        SqlAlchemyNotificacoes(self.db).registrar(
            Ocorrencia(chave=f"decisao:{decisao.id}", tipos=frozenset({"fluxo"}), titulo=f"Fluxo {self.fluxo_nome}: sua decisão"[:300],
                       texto=pergunta[:2000], quando=self.agora(), link=link), pessoas)
        self._email_da_decisao(decisao, [email for _, email in pessoas if email], get_settings().frontend_url.rstrip("/") + link)
        return {"tipo": "decisao", "decisao": decisao.id}

    def _email_da_decisao(self, decisao: Any, para: list[str], link: str) -> None:
        """Um botão por opção; o botão abre o Portal (com login) já com a opção marcada para confirmar."""
        if not para:
            return
        from modules.telemetry.correio.api import build_correio
        from modules.telemetry.correio.correio import Contexto, validar

        botoes = "".join(
            f"<a href='{html.escape(f'{link}?opcao={i}', quote=True)}' style='display:inline-block;margin:0 8px 8px 0;"
            "background:#102947;color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:15px;font-weight:600;"
            f"text-decoration:none;padding:12px 22px;border-radius:8px'>{html.escape(opcao)}</a>"
            for i, opcao in enumerate(decisao.opcoes))
        corpo = ("<div style='font-family:Segoe UI,Arial,sans-serif;color:#1d2330'>"
                 f"<p style='font-size:14px;margin:0 0 8px'>O fluxo <b>{html.escape(self.fluxo_nome)}</b> precisa da sua decisão:</p>"
                 f"<p style='font-size:17px;font-weight:600;margin:0 0 18px'>{html.escape(decisao.pergunta)}</p>{botoes}"
                 "<p style='font-size:12px;color:#5d6677;margin:14px 0 0'>Vale a primeira resposta. O botão abre o Portal (pede login) "
                 "para você confirmar.</p></div>")
        mensagem = validar({"para": para, "assunto": f"Fluxo {self.fluxo_nome}: sua decisão", "html": corpo})
        build_correio(self.db).pedir(Contexto(origem="portal", tipo="decisao_de_fluxo"), mensagem,
                                     chave_idempotencia=f"decisao:{decisao.id}")

    def _conferir_decisao(self, espera: dict[str, Any]) -> dict[str, Any] | None:
        from modules.orchestration.fluxos.modelos import FluxoDecisaoRecord

        decisao = self.db.get(FluxoDecisaoRecord, espera["decisao"])
        if decisao is None or decisao.situacao != "respondida" or decisao.resposta is None:
            return None
        return {"indice": decisao.resposta, "por": decisao.respondida_por}

    def _pessoas(self, para: dict[str, Any]) -> list[tuple[int, str]]:
        from modules.access.infrastructure.orm.models import AccessUserRecord as UserRecord, TeamMembershipRecord

        if para.get("tipo") == "time":
            ids = list(self.db.scalars(select(TeamMembershipRecord.user_id).where(TeamMembershipRecord.team_id == int(para["id"]))))
        elif para.get("tipo") == "pessoa":
            ids = [int(para["id"])]
        else:
            ids = [int(self.execucao.disparado_por)] if str(self.execucao.disparado_por or "").isdigit() else []
        pessoas = [(pid, email) for pid, email in self.db.execute(select(UserRecord.id, UserRecord.email).where(UserRecord.id.in_(ids)))] if ids else []
        if not pessoas:
            raise FalhaDoFluxo("Ninguém para avisar (o time está vazio ou a pessoa não existe).")
        return pessoas

    # -- avisar --------------------------------------------------------------------------------
    def avisar(self, para: dict[str, Any], texto_do_aviso: str, bloco: str | None) -> None:
        from modules.telemetry.domain.notificacoes import Ocorrencia
        from modules.telemetry.infrastructure.repositories.sqlalchemy_notificacoes import SqlAlchemyNotificacoes

        pessoas = self._pessoas(para)
        chave = f"fluxo:{self.execucao.id}:{bloco}:{self.execucao.estado.get('passos', 0)}:{len(texto_do_aviso)}"
        SqlAlchemyNotificacoes(self.db).registrar(
            Ocorrencia(chave=chave[:300], tipos=frozenset({"fluxo"}), titulo=f"Fluxo {self.fluxo_nome}"[:300],
                       texto=texto(texto_do_aviso)[:2000], quando=self.agora(), link=f"/flows/execucoes/{self.execucao.id}"),
            pessoas)
