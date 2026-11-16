# Segredos

Guarda senhas, tokens e outros acessos que as automações recebem do Portal durante a execução, em vez de ficarem no `.env` de cada máquina. Cada segredo tem um ou mais campos (ex.: usuário, senha e banco) e só é entregue às automações ligadas a ele.

A aba fica fora do menu por padrão; quem tem acesso liga em Configurações.

## O que aparece

- **Busca** por nome, chave ou nome de automação que usa o segredo.
- **Tabela**: nome; chave e nomes dos campos; automações que usam ("nenhuma automação" se não houver); último uso ("nunca" se ainda não foi entregue); situação (**Ativo**, **Vencido** ou **Desativado**).
- **Detalhe** (painel lateral, ao clicar na linha):
  - situação, versão atual e data de vencimento, se houver; descrição;
  - **Campos**: nome de cada campo, com o valor só dos **visíveis**. Os **ocultos** aparecem como `••••••••`;
  - **Automações que usam**, com o último uso de cada uma;
  - **Como a automação usa**: o código pronto para este segredo (`acesso = a.segredo("chave")`, `acesso["campo"]`);
  - **Versões**: número, data de criação, vencimento e qual está em uso. Nenhum valor aparece aqui.

Campo **oculto** nunca volta para a tela por nenhuma rota e vira `***` no log. Campo **visível** (usuário, banco, servidor) aparece no Portal e não é mascarado.

## O que dá para fazer

- **Novo segredo**: nome, chave, campos, descrição opcional ("Para que serve") e vencimento opcional.
  - A chave é preenchida a partir do nome (sem acento, minúsculas, espaço vira `_`) até ser editada à mão. Só letras minúsculas, números, ponto, hífen e sublinhado, até 160 caracteres. Não pode repetir.
  - Modelos para começar: Senha; Usuário e senha; Usuário, senha e banco; Token de API.
  - Campos: de 1 a 20, nome com letras minúsculas, números e `_`, começando por letra (até 40), sem repetir; valor obrigatório, em texto, até 8 KB. O botão de olho alterna oculto/visível.
  - O vencimento precisa ser no futuro.
  - Os valores ficam cifrados no banco.
- **Editar campos**: acrescentar, tirar, renomear, trocar valor, ocultar/mostrar e mudar o vencimento.
  - Campo oculto deixado em branco mantém o valor atual. Campo renomeado pede o valor de novo.
  - Mudou algum valor, entrou ou saiu campo, ou mudou o vencimento: cria **versão nova**. Só ocultar/mostrar muda sem versão nova.
  - O valor novo vale a partir do próximo pedido; execuções que já receberam seguem com o antigo.
- **Editar nome e chave** (também a descrição). Se a chave mudar, a tela avisa: o código das automações pede o segredo pela chave, então é preciso trocar `a.segredo("antiga")` por `a.segredo("nova")` nas automações listadas. Até lá elas não recebem o segredo.
- **Desativar** / **Reativar**: desativado, nenhuma automação recebe mais, mas valores e ligações ficam.
- **Automações que usam**: marcar ou desmarcar automações (as arquivadas só aparecem se já estiverem ligadas) e **Salvar automações**. Também dá para ligar e desligar segredos pela aba Técnico da automação.
- **Apagar**: abre uma confirmação que só libera **Apagar de vez** depois de digitar a chave do segredo exatamente. O backend confere a chave de novo. Valores, versões e ligações saem sem volta; as automações listadas deixam de receber. Fica só o registro na auditoria (chave, nome, campos e automações, sem valores). Depois dá para criar outro com a mesma chave.

Tudo vai para a auditoria: `segredo.criado`, `segredo.campos_alterados`, `segredo.alterado`, `segredo.ligado`, `segredo.desligado`, `segredo.apagado`.

## Como a automação lê o segredo

Com o SDK Python (`sdk/python`, a partir da 0.5.0):

```python
dominio = a.segredo("dominio")           # todos os campos, como um dicionário
senha = a.segredo("dominio", "senha")    # só um campo, em texto
varios = a.segredos("dominio", "banco")  # vários num pedido só
```

- **Modo direto**: o SDK pede ao Portal com o token do job (`POST /api/v1/direto/jobs/{job}/segredos`, corpo `{"chaves": [...]}`, até 50 chaves). O Portal só entrega se a execução está ativa (aceita, confirmada, preparando ou rodando), o segredo está ligado àquela automação, está ativo e a versão atual não venceu. A resposta traz o que foi entregue e o motivo de cada recusa, sem cache.
- **Modo agente**: o Agent ainda não entrega segredos; o SDK levanta `SegredoIndisponivel` dizendo para usar o modo direto.
- **Sem Portal (desenvolvimento)**: o SDK lê do ambiente, `PORTAL_SEGREDO_<CHAVE>` com um JSON dos campos ou `PORTAL_SEGREDO_<CHAVE>__<CAMPO>` por campo.
- Segredo não entregue levanta `SegredoIndisponivel` com a chave e o motivo, nunca o valor. Campo que não existe levanta `KeyError` listando os que existem.
- O SDK troca os valores dos campos ocultos por `***` nos eventos antes de gravar ou enviar, e o Portal faz o mesmo ao receber. Valores com menos de 4 caracteres não são mascarados.
- Cada entrega (`segredo.entregue`) e cada recusa (`segredo.negado`) vão para a auditoria, com automação, execução e versão, sem o valor. É daí que sai o "último uso".

## Quem pode

- **Ver** (`segredos.ver`, também dá `secret.read_metadata`): abre a tela, a lista, o detalhe, as versões e as automações que usam (só leitura).
- **Gerenciar** (`segredos.gerenciar`, também dá `secret.manage`): mostra Novo segredo, Editar nome e chave, Editar campos, Desativar/Reativar, a lista de automações para marcar e Apagar.
- Admin vê e gerencia tudo.

## Por dentro

- Tela: `frontend/src/app/(dashboard)/secrets/page.tsx`, `frontend/src/components/secrets/secrets-manager.tsx`
- API:
  - `GET /segredos` — lista com campos (valor só dos visíveis), versão, validade, automações e último uso.
  - `POST /segredos` — cria.
  - `PUT /segredos/{id}/campos` — troca os campos e valores (versão nova quando muda valor).
  - `PUT /segredos/{id}` — nome, chave, descrição e situação.
  - `PUT /segredos/{id}/automacoes` — quais automações usam.
  - `GET /segredos/{id}/versoes` — histórico de versões, sem valores.
  - `DELETE /segredos/{id}?confirmar=<chave>` — apaga.
  - `GET /automations` — automações para marcar (só para quem gerencia).
  - `POST /direto/jobs/{job}/segredos` — entrega à automação (usada pelo SDK, não pela tela).
- Regras no backend:
  - `backend/modules/governance/api/segredos.py` (rotas e permissões)
  - `backend/modules/governance/application/segredos.py` (validação, versões, entrega, máscara, auditoria)
  - `backend/modules/governance/infrastructure/repositories/sqlalchemy_segredos.py` (gravação)
  - `backend/gateway/direct_gateway/routes.py` (entrega no modo direto)
  - `sdk/python/portal_automacoes/segredos.py` e `automacao.py` (`segredo()`, `segredos()`)
