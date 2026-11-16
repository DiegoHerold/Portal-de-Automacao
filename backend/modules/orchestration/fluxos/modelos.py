"""Fluxos em blocos (ADR-021): o fluxo e as versões publicadas. Só o Orchestration escreve aqui.

O rascunho fica no próprio fluxo (pode estar inválido enquanto alguém monta). Cada publicação
cria uma versão imutável com a AST validada. As execuções (Fase 3) apontam para uma versão.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from infrastructure.database import Base


class FluxoRecord(Base):
    __tablename__ = "fluxos"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    situacao: Mapped[str] = mapped_column(String(20), nullable=False, default="ativo", index=True)  # ativo | arquivado
    rascunho: Mapped[dict] = mapped_column(JSONB, nullable=False)
    rascunho_atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    rascunho_atualizado_por: Mapped[str | None] = mapped_column(String(120), nullable=True)
    criado_por: Mapped[str | None] = mapped_column(String(120), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class FluxoVersaoRecord(Base):
    __tablename__ = "fluxo_versoes"
    __table_args__ = (UniqueConstraint("fluxo_id", "numero", name="uq_fluxo_versoes_numero"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    fluxo_id: Mapped[str] = mapped_column(ForeignKey("fluxos.id", ondelete="CASCADE"), nullable=False, index=True)
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    ast: Mapped[dict] = mapped_column(JSONB, nullable=False)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    publicada_por: Mapped[str | None] = mapped_column(String(120), nullable=True)
    publicada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class FluxoExecucaoRecord(Base):
    """Uma execução de uma versão publicada (Fase 3). ``estado`` é o do motor: variáveis e pilha."""

    __tablename__ = "fluxo_execucoes"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    fluxo_id: Mapped[str] = mapped_column(ForeignKey("fluxos.id", ondelete="CASCADE"), nullable=False, index=True)
    versao_id: Mapped[str] = mapped_column(ForeignKey("fluxo_versoes.id", ondelete="CASCADE"), nullable=False)
    versao_numero: Mapped[int] = mapped_column(Integer, nullable=False)
    # rodando | esperando | pausada | concluida | falhou | cancelada
    situacao: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    pedido: Mapped[str | None] = mapped_column(String(20), nullable=True)  # cancelar | pausar (vale na próxima fatia)
    entradas: Mapped[dict] = mapped_column(JSONB, nullable=False)
    estado: Mapped[dict] = mapped_column(JSONB, nullable=False)
    resultado: Mapped[Any] = mapped_column(JSONB, nullable=True)
    motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    bloco_atual: Mapped[str | None] = mapped_column(String(80), nullable=True)
    passos_dados: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    acordar_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    origem: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    disparado_por: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Subfluxo (Fase 7): a execução que chamou e o bloco "Chamar outro fluxo" dela.
    execucao_pai_id: Mapped[str | None] = mapped_column(ForeignKey("fluxo_execucoes.id", ondelete="CASCADE"), nullable=True, index=True)
    bloco_pai: Mapped[str | None] = mapped_column(String(80), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    terminado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class FluxoPassoRecord(Base):
    """Linha do tempo de uma execução: cada bloco executado, com a volta do laço (tela ao vivo)."""

    __tablename__ = "fluxo_passos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    execucao_id: Mapped[str] = mapped_column(ForeignKey("fluxo_execucoes.id", ondelete="CASCADE"), nullable=False)
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    bloco: Mapped[str | None] = mapped_column(String(80), nullable=True)
    tipo: Mapped[str] = mapped_column(String(40), nullable=False)
    resumo: Mapped[str] = mapped_column(Text, nullable=False)
    nivel: Mapped[str] = mapped_column(String(10), nullable=False, default="info")
    quando: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class FluxoDecisaoRecord(Base):
    """Bloco "Perguntar a uma pessoa" (Fase 5): a pergunta, as opções, quem pode responder e a resposta.

    Vale uma vez: a primeira resposta decide; quem chegar depois vê quem respondeu, quando e por onde.
    """

    __tablename__ = "fluxo_decisoes"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    execucao_id: Mapped[str] = mapped_column(ForeignKey("fluxo_execucoes.id", ondelete="CASCADE"), nullable=False, index=True)
    fluxo_id: Mapped[str] = mapped_column(ForeignKey("fluxos.id", ondelete="CASCADE"), nullable=False)
    bloco: Mapped[str | None] = mapped_column(String(80), nullable=True)
    pergunta: Mapped[str] = mapped_column(Text, nullable=False)
    opcoes: Mapped[list] = mapped_column(JSONB, nullable=False)
    destinatarios: Mapped[list] = mapped_column(JSONB, nullable=False)  # ids de usuários que podem responder
    situacao: Mapped[str] = mapped_column(String(20), nullable=False, default="aguardando", index=True)  # aguardando | respondida | cancelada
    resposta: Mapped[int | None] = mapped_column(Integer, nullable=True)  # índice da opção (0, 1, 2...)
    respondida_por: Mapped[str | None] = mapped_column(String(120), nullable=True)
    respondida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    respondida_via: Mapped[str | None] = mapped_column(String(20), nullable=True)  # portal | email
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
