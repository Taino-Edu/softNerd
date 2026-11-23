# Gerenciamento Ágil — PIM IV, etapa 9 (Gerenciamento de Projetos Ágil)

O **Santuário Nerd** foi construído em entregas curtas e contínuas para um cliente real (a loja de card games do Maikon, em José Bonifácio-SP),
com o cliente dando pedidos e relatos diretamente. Este pacote documenta como o trabalho foi organizado, **reconstruindo as sprints e o quadro
Kanban a partir do histórico real** do projeto (CHANGELOG, Git e GitHub).

> **Honestidade sobre o método:** o projeto não rodava cerimônias de Scrum formais. O que existia era entrega contínua, backlog vivo e
> fluxo com revisão automática. As *sprints* abaixo são janelas fixas de 14 dias montadas **depois**; datas, versões, commits e PRs são reais,
> as metas são resumos do que foi entregue. Isso está dito em cada documento onde importa.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| [`product-backlog.md`](product-backlog.md) | Backlog do produto em **épicos e histórias de usuário**, com situação e entrega (versão ou PR) |
| [`sprints.md`](sprints.md) | **18 sprints reconstruídas** (01/03 a 07/11/2026), com meta, entregas e métricas, e o **Sprint Backlog da sprint 19** (fechamento do PIM) |
| [`kanban.md`](kanban.md) | **Quadro Kanban** (imagem), colunas, políticas explícitas e definição de pronto |
| [`metricas.md`](metricas.md) | Métricas de fluxo: versões, commits, PRs, tempo de ciclo, tipos de trabalho, pedidos do cliente |
| [`retrospectivas.md`](retrospectivas.md) | Cinco retrospectivas reconstruídas de eventos reais, com lição e ação |
| `metricas.json`, `img/` | Dados e gráficos (SVG e PNG, prontos para o trabalho escrito) |

## Papéis

| Papel | Quem | Como atua |
|---|---|---|
| **Product Owner** | Maikon (dono da loja) | traz pedidos, relatos de problema e testes; decide o que vale mais |
| **Desenvolvedor e responsável pelo fluxo** | Taino | prioriza o backlog, implementa, revisa o CI e aprova o deploy |

*(Confirmar com o grupo: papéis de cada integrante e como descrever o apoio de ferramentas de assistência a código usadas no desenvolvimento.)*

## Como o Scrum/Kanban aparece na prática

| Prática | Como o projeto fazia | Evidência |
|---|---|---|
| **Product Backlog** | arquivo vivo atualizado a cada versão | `docs/planejamento/BACKLOG.md`, [`product-backlog.md`](product-backlog.md) |
| **Planejamento** | contínuo: o item mais importante da fila vira a próxima entrega; a sprint 19 tem plano explícito | [`sprints.md`](sprints.md) |
| **Reunião diária** | não houve (desenvolvimento individual); o papel dela é cumprido pela seção "Esperando alguém" do backlog e pela revisão do CI | [`kanban.md`](kanban.md) |
| **Revisão da sprint** | cada versão é entregue ao cliente e descrita no CHANGELOG; o Maikon responde com pedidos e relatos | `frontend/public/CHANGELOG.md` (33 versões citam o cliente) |
| **Retrospectiva** | feita depois de incidentes e de grandes entregas | [`retrospectivas.md`](retrospectivas.md) |
| **Incremento** | cada versão em produção | 157 versões de v1.0.0 a v1.85.0 |
| **Kanban** | colunas A fazer → Esperando alguém → Em andamento → Em revisão (PR + CI) → Feito | [`kanban.md`](kanban.md) |

## Princípios do Manifesto Ágil, com evidência

- **Entregar software funcionando com frequência:** 157 versões em 18 sprints; 47 na sprint 17 e 32 na 18 ([gráfico](img/versoes-por-sprint.svg)).
- **Colaboração com o cliente:** 33 versões nascem de pedido, relato ou teste do dono da loja ([gráfico](img/pedidos-do-cliente.svg)).
- **Responder a mudanças:** 16 versões entraram como "mudança com volta" (atrás de chave de funcionalidade), podendo ser revertidas sem novo deploy.
- **Atenção contínua à excelência técnica:** CI com testes, Postgres real, teste de carga, CodeQL e build das imagens em todo PR; sprints 17–18 removem código e reorganizam o back em camadas.

## Fluxo técnico (definição de pronto)

`branch → pull request → CI verde (testes, Postgres real, carga, imagens Docker, CodeQL, mapa do sistema) → merge → o deploy abre e espera a aprovação do dono → backup dos bancos → troca sem queda → teste de fumaça → robô de fumaça a cada 30 min`. Sem push direto na `main`.

## Como regenerar

```bash
python3 scripts/gerar-metricas-agil.py      # precisa do GitHub CLI logado (gh) e do repositório com histórico completo
```

## Limitações

- Antes de 27/03/2026 não há commits no Git atual, e antes de 04/05 não há PRs (o fluxo com pull request começou depois). As colunas respectivas ficam com "—".
- O tempo de ciclo mede abertura → merge do PR, não o tempo desde a ideia; inclui a espera do CI.
- "Pedidos do cliente" conta versões em que o CHANGELOG cita o Maikon; pedidos feitos por outros canais e não citados não entram.
