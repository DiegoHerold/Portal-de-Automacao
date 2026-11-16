# Documentação do Portal de Automações

Comece pela [visão geral](visao-geral.md) (arquitetura, módulos, como rodar e testar). As decisões de arquitetura
estão em [decisoes.md](decisoes.md) e as regras visuais das telas em [design-system.md](design-system.md).

Cada aba do Portal tem um documento com o que aparece, o que dá para fazer, quem pode e, em "Por dentro", os
arquivos e as rotas da API que ela usa. Mudou uma tela? Atualize o documento dela no mesmo trabalho.

## Abas do Portal

**Monitorar**
- [Painel](telas/painel.md): o que está rodando agora, máquinas e alertas.
- [Fila](telas/fila.md): o que espera para rodar, em que ordem e com que previsão.
- [Máquinas](telas/maquinas.md): as máquinas, o que cada uma roda e se está livre.
- [Histórico](telas/historico.md): execuções que já rodaram e o acompanhamento de cada uma.
- [Pendências](telas/pendencias.md): o que espera uma pessoa (itens em atenção e decisões de fluxo).

**Operação**
- [Execuções](telas/execucoes.md): pedir e acompanhar execuções de automações.
- [Fluxos](telas/fluxos.md): programas em passos que usam automações (editor em cartões, execução ao vivo).
- [Webhooks](telas/webhooks.md): chamadas de fora que disparam automações.
- [Agendamentos](telas/agendamentos.md): agenda e regras de quando cada automação roda.

**Catálogo**
- [Automações](telas/automacoes.md): o cadastro de cada automação, versões, itens, campos, arquivos e acessos.
- [Categorias](telas/categorias.md): grupos de automações.
- [Runtimes](telas/runtimes.md): os ambientes em que as automações rodam.

**Infraestrutura**
- [Agents](telas/agent.md): o programa que roda nas máquinas e a ligação com o Portal.
- [Armazenamento](telas/armazenamento.md): arquivos e pacotes guardados.

**Segurança**
- [Auditoria](telas/auditoria.md): quem fez o quê e quando.
- [Segredos](telas/segredos.md): senhas e chaves que as automações usam.
- [Contas de serviço](telas/contas-de-servico.md): acesso de sistemas e automações sem pessoa.

**Pessoas e acesso**
- [Usuários](telas/usuarios.md) · [Times](telas/times.md) · [Papéis](telas/papeis.md) (o modelo de permissões) ·
  [Organizações](telas/organizacoes.md)

**Governança**
- [Limites](telas/limites.md): limites do sistema e como criar um novo.
- [Retenção](telas/retencao.md): limpeza automática de dados antigos.
- [E-mails](telas/emails.md): o correio central e o histórico de envios.

**Conta**
- [Configurações](telas/configuracoes.md): senha e acesso, notificações, áreas do Portal e integração com o GitHub.
- [Login](telas/login.md): entrar com código, convite e sessão.

## Outras documentações

- Contratos (protocolo Portal-Agent, eventos da automação, manifesto, fluxos): `contracts/`.
- SDK para escrever automações: `sdk/python/README.md`.
- O Automation Agent e a ferramenta de certificação: `automation-agent/docs/`.
- Plano da nova versão do Agent em .NET: [agent-refundacao/PROMPT.md](agent-refundacao/PROMPT.md).
