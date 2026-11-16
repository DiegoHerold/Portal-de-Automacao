"""Parte do trabalho (0.6.0): o que o fluxo dividido entrega a cada job."""

from portal_automacoes import Parte, job_atual, parte_do_trabalho
from portal_automacoes.instancia import Job


def test_parte_pelo_job_da_instancia_e_pelo_job_atual(tmp_path) -> None:
    parametros = {"competencia": "10/2026", "_parte": {"indice": 2, "total": 5, "fatias": ["11.txt", "12.txt"]}}
    job = Job("tsk_1", "exe_1", "jbt", 1, parametros, [{"chave": "PLANET"}])
    assert job.parte == Parte(2, 5, ["11.txt", "12.txt"])
    arquivo = tmp_path / "job.json"
    arquivo.write_text('{"parametros": {"_parte": {"indice": 1, "total": 2, "fatias": ["a"]}}, "itens": []}', encoding="utf-8")
    assert parte_do_trabalho(job_atual({"PORTAL_JOB_ARQUIVO": str(arquivo)})) == Parte(1, 2, ["a"])


def test_sem_parte_ou_parte_quebrada_e_none() -> None:
    assert parte_do_trabalho(job_atual({})) is None
    assert parte_do_trabalho({"_parte": {"indice": "x"}}) is None
    assert parte_do_trabalho(None) is None
    assert Job("t", "e", "j", 1, {}, []).parte is None
