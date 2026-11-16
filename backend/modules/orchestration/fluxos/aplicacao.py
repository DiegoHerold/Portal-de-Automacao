"""Casos de uso do cadastro de fluxos em blocos (Fase 2).

- Criar com um rascunho vazio; salvar o rascunho a qualquer momento (mesmo inválido: quem monta
  vê os erros no bloco); publicar só rascunho válido, como versão imutável (1, 2, 3...).
- Arquivar tira da lista e impede publicar; as versões ficam.
- Criar, mudar e publicar entram na auditoria. Salvar rascunho não (seria ruído).
"""

from __future__ import annotations

import copy
from datetime import UTC, datetime
from typing import Any, Callable
from uuid import uuid4

from modules.governance.domain.audit import AuditEvent
from modules.orchestration.fluxos.domain.validador import Erro, Validador

RASCUNHO_VAZIO: dict[str, Any] = {"contrato": "fluxo/v1", "entradas": [], "variaveis": [], "funcoes": [], "corpo": []}
SITUACOES = ("ativo", "arquivado")


class FluxoNaoEncontrado(LookupError):
    pass


class PedidoInvalido(ValueError):
    pass


class FluxoInvalido(ValueError):
    def __init__(self, erros: list[Erro]) -> None:
        super().__init__("O fluxo tem erros: corrija antes de publicar.")
        self.erros = erros


def _quem(ator: Any) -> str | None:
    valor = getattr(ator, "id", None)
    return str(valor) if valor is not None else None


class Fluxos:
    def __init__(self, repo: Any, auditoria: Any, contexto: Any, agora: Callable[[], datetime] | None = None) -> None:
        self.repo = repo
        self.auditoria = auditoria
        self.contexto = contexto
        self._agora = agora or (lambda: datetime.now(UTC))

    # -- leitura -----------------------------------------------------------------------
    def listar(self, incluir_arquivados: bool = False) -> list[dict[str, Any]]:
        fluxos = self.repo.todos(incluir_arquivados)
        ultimas = self.repo.ultimas_por_fluxo([f.id for f in fluxos])
        return [self._resumo(f, ultimas.get(f.id)) for f in fluxos]

    def obter(self, fluxo_id: str) -> dict[str, Any]:
        fluxo = self._fluxo(fluxo_id)
        versoes = self.repo.versoes(fluxo.id)
        return {**self._resumo(fluxo, versoes[0] if versoes else None), "rascunho": fluxo.rascunho,
                "erros": [e.para_api() for e in self._validar(fluxo.id, fluxo.rascunho)],
                "versoes": [self._versao(v, com_ast=False) for v in versoes]}

    def versao(self, fluxo_id: str, numero: int) -> dict[str, Any]:
        self._fluxo(fluxo_id)
        versao = self.repo.versao(fluxo_id, numero)
        if versao is None:
            raise FluxoNaoEncontrado("Versão não encontrada.")
        return self._versao(versao, com_ast=True)

    def validar(self, fluxo_id: str, ast: Any | None = None) -> list[dict[str, Any]]:
        fluxo = self._fluxo(fluxo_id)
        return [e.para_api() for e in self._validar(fluxo.id, fluxo.rascunho if ast is None else ast)]

    # -- escrita -----------------------------------------------------------------------
    def criar(self, ator: Any, dados: dict[str, Any]) -> dict[str, Any]:
        nome = _nome(dados.get("nome"))
        agora = self._agora()
        fluxo = self.repo.criar(nome, _descricao(dados.get("descricao")), copy.deepcopy(RASCUNHO_VAZIO), _quem(ator), agora)
        self._auditar(ator, "fluxo.criado", fluxo.id, depois={"nome": nome})
        return self.obter(fluxo.id)

    def mudar(self, ator: Any, fluxo_id: str, dados: dict[str, Any]) -> dict[str, Any]:
        fluxo = self._fluxo(fluxo_id)
        campos: dict[str, Any] = {}
        if "nome" in dados:
            campos["nome"] = _nome(dados["nome"])
        if "descricao" in dados:
            campos["descricao"] = _descricao(dados["descricao"])
        if "situacao" in dados:
            if dados["situacao"] not in SITUACOES:
                raise PedidoInvalido("Situação: ativo ou arquivado.")
            campos["situacao"] = dados["situacao"]
        if not campos:
            raise PedidoInvalido("Nada para mudar.")
        antes = {"nome": fluxo.nome, "descricao": fluxo.descricao, "situacao": fluxo.situacao}
        self.repo.gravar(fluxo, self._agora(), **campos)
        self._auditar(ator, "fluxo.alterado", fluxo.id, antes=antes, depois={k: getattr(fluxo, k) for k in antes})
        return self.obter(fluxo.id)

    def salvar_rascunho(self, ator: Any, fluxo_id: str, ast: Any) -> list[dict[str, Any]]:
        fluxo = self._fluxo(fluxo_id)
        if not isinstance(ast, dict):
            raise PedidoInvalido("O rascunho precisa ser um objeto JSON (contrato fluxo/v1).")
        agora = self._agora()
        self.repo.gravar(fluxo, agora, rascunho=ast, rascunho_atualizado_em=agora, rascunho_atualizado_por=_quem(ator))
        return [e.para_api() for e in self._validar(fluxo.id, ast)]

    def publicar(self, ator: Any, fluxo_id: str, notas: Any = None) -> dict[str, Any]:
        fluxo = self._fluxo(fluxo_id)
        if fluxo.situacao != "ativo":
            raise PedidoInvalido("Fluxo arquivado não publica: reative antes.")
        erros = self._validar(fluxo.id, fluxo.rascunho)
        if erros:
            raise FluxoInvalido(erros)
        if not fluxo.rascunho.get("corpo"):
            raise PedidoInvalido("O fluxo está vazio: monte ao menos um bloco antes de publicar.")
        ultima = self.repo.ultima_versao(fluxo.id)
        if ultima is not None and ultima.ast == fluxo.rascunho:
            raise PedidoInvalido(f"Nada mudou desde a versão {ultima.numero}.")
        texto = str(notas).strip()[:2000] if notas not in (None, "") else None
        versao = self.repo.publicar(fluxo, copy.deepcopy(fluxo.rascunho), texto, _quem(ator), self._agora())
        self._auditar(ator, "fluxo.publicado", fluxo.id, depois={"versao": versao.numero, "notas": texto})
        return self._versao(versao, com_ast=False)

    # -- apoio -------------------------------------------------------------------------
    def _fluxo(self, fluxo_id: str) -> Any:
        fluxo = self.repo.obter(fluxo_id)
        if fluxo is None:
            raise FluxoNaoEncontrado("Fluxo não encontrado.")
        return fluxo

    def _validar(self, fluxo_id: str, ast: Any) -> list[Erro]:
        return Validador(self.contexto, fluxo_id).validar(ast)

    @staticmethod
    def _resumo(fluxo: Any, ultima: Any) -> dict[str, Any]:
        return {"id": fluxo.id, "nome": fluxo.nome, "descricao": fluxo.descricao, "situacao": fluxo.situacao,
                "versao_publicada": ultima.numero if ultima else None, "publicada_em": ultima.publicada_em if ultima else None,
                "rascunho_mudou": ultima is None or ultima.ast != fluxo.rascunho,
                "rascunho_atualizado_em": fluxo.rascunho_atualizado_em, "criado_em": fluxo.criado_em}

    @staticmethod
    def _versao(versao: Any, com_ast: bool) -> dict[str, Any]:
        saida = {"numero": versao.numero, "publicada_em": versao.publicada_em, "publicada_por": versao.publicada_por,
                 "notas": versao.notas}
        return {**saida, "ast": versao.ast} if com_ast else saida

    def _auditar(self, ator: Any, acao: str, fluxo_id: str, antes: dict | None = None, depois: dict | None = None) -> None:
        self.auditoria.append(AuditEvent(
            id=f"aud_{uuid4().hex}", actor_type="user", actor_id=_quem(ator), action=acao, resource_type="fluxo",
            resource_id=fluxo_id, before=antes, after=depois, organization_id=getattr(ator, "organization_id", None),
            occurred_at=self._agora()))


def _nome(valor: Any) -> str:
    nome = str(valor or "").strip()
    if not nome:
        raise PedidoInvalido("Dê um nome ao fluxo.")
    return nome[:160]


def _descricao(valor: Any) -> str | None:
    texto = str(valor or "").strip()
    return texto[:2000] or None
