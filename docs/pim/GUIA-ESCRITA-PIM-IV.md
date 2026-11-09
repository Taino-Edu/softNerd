# Guia de escrita do PIM IV

Atualizado em 09/11/2026. **Postagem: 14/11/2026.** Substitui a `ANALISE-PIM-IV.md` para quem está escrevendo.

Regra geral: o texto só descreve o que existe hoje. O que ainda é ideia entra como proposta ou plano.

## Antes de escrever

| Assunto | Decisão |
|---|---|
| Empresa | **Santuário Nerd**, loja real de card games em José Bonifácio-SP |
| Cidade da capa | São José do Rio Preto |
| Integrantes | 5. Nomes completos e RAs na lista do grupo (não ficam aqui porque este repositório é público) |
| Orientador | Não há. Não inventar nome; perguntar ao coordenador se a UNIP exige algo nesse campo |
| Nome do sistema | softNerd |

**Mudança de nome em relação ao PIM III.** O PIM III falava da empresa fictícia "softNerd Card & Board" e de "entrevistas hipotéticas". A Introdução precisa explicar essa passagem para a loja real. O grupo deve escrever o que aconteceu de fato e confirmar com o coordenador.

## Não copiar do PIM III

O manual proíbe reaproveitar texto sem referência. O PIM III deve ser **reescrito e citado**, com os 6 autores originais na referência, inclusive quem saiu do grupo.

| O PIM III diz | Escrever |
|---|---|
| .NET 8 | .NET 10 |
| Next.js 14 | Next.js 15 |
| Usuários, pontos e ingressos no NoSQL | Usuários e campeonatos no PostgreSQL. MongoDB só para `CardCache` e `VendaAvulsa` |
| MER com 9 entidades | Usar o MER novo de `docs/pim/banco` |
| Pagamento futuro via Mercado Pago | Pix pelo Banco Inter |
| `Data/migrations` | O projeto não usa migrations (`EnsureCreated` + SQL de inicialização) |
| Triggers protegem o fechamento de contas | Triggers carimbam `updated_at` e auditam estoque |
| Machine learning preditivo | Não existe no código |

**Também não citar como existente:** NFC-e, WhatsApp automático, OFX, Mercado Pago e Tenant-ERP.

**Erros do PIM III a não repetir:**
- Capítulos repetidos ou fora de ordem (5, 6, 7 e 9) e seções vazias (8.2.2 e 8.3).
- Sumário sem número de página.
- Sobrenomes do Quadro 1 diferentes da capa.
- IBGE, Lei 10.436 e Decreto 5.626 citados no texto e ausentes das Referências.
- "9,7 milhões ... Censo 2022": conferir na fonte, o número parece ser do Censo 2010.
- Ano da capa: o PIM III diz 2025, mas tem prints e acessos de maio de 2026. Conferir antes de referenciar.

**Prints:** só com dados de teste ou dados de clientes borrados (LGPD).

## Formato obrigatório

- Capa, Resumo (150 a 500 palavras), Abstract, Sumário, Introdução, Desenvolvimento (**20 a 30 páginas**), Conclusão e Referências.
- A4, margens 3/2 cm, Arial ou Times 12, espaçamento 1,5, numeração visível a partir da Introdução.
- Trabalho fora da ABNT pode ser reprovado direto.
- O líder posta no sistema da UNIP, e uma cópia impressa vai ao coordenador.

## Etapas

Páginas são sugestão, proporcionais à nota.

### Etapa 1: Caracterização da organização (1,0 · 2 páginas)
Pede: segmento, produtos ou serviços, estrutura organizacional, processos, problemas e oportunidades.
- **Temos:** loja de TCG (Pokémon, One Piece, Riftbound), venda no balcão e no site, pré-venda, comandas na mesa, torneios e liga, crediário.
- **Pedir à loja:** autorização por escrito para usar nome e dados, tempo de existência, nº de funcionários, como era antes do sistema.
- **Não inventar** números, entrevistas nem reuniões.

### Etapa 2: Planejamento da solução (1,0 · 2 a 3 páginas)
Pede: problema, objetivos, público-alvo, proposta de valor, benefícios e diferenciais.
- **Público:** dono e equipe da loja; clientes jogadores.
- **Diferenciais reais:** liga com telão e celular, Pix integrado ao Inter, Vigia do sistema (alertas), app da Liga.
- **Requisitos:** usar pedidos reais da loja (ver histórico em `docs/planejamento/BACKLOG.md`), não "entrevistas hipotéticas".
- **Evolução desde o PIM III:** Pix e CI/CD eram trabalhos futuros e hoje existem.

### Etapa 3: Responsabilidade social e diversidade (0,5 · 2 páginas)
Pede: combate à discriminação, diversidade, recursos inclusivos, acessibilidade e cidadania.
- **Existe:** VLibras (ligável em `/admin/configuracoes`), tema claro e escuro, "reduzir movimento", LGPD (consentimento, direitos do titular, anonimização).
- **Não existe no sistema:** combate à discriminação e valorização da diversidade. Escrever **como proposta**, por exemplo código de conduta nos torneios com canal de denúncia, nome social no cadastro e linguagem inclusiva.
- Relacionar com a disciplina de relações étnico-raciais, com referências.

### Etapa 4: Solução Web (2,0 · 5 a 6 páginas)
Pede: arquitetura, APIs REST, autenticação, segurança, estrutura administrativa e integração entre módulos.
- **Arquitetura:** API ASP.NET Core (.NET 10), front Next.js 15, PostgreSQL + MongoDB, SignalR.
- **API:** lista completa em `docs/mapa/ENDPOINTS.md` (usar o total do dia da entrega).
- **Autenticação:** JWT em cookie HttpOnly + refresh token, bloqueio por senha errada.
- **Segurança:** perfis e permissões, rate limiting, auditoria, CodeQL, Cloudflare.
- **Admin:** PDV, estoque, financeiro, crediário, liga, relatórios.
- **Integração:** pedido no site → Pix → venda → estoque → financeiro; comanda → crediário e pontos; campeonato → Liga Mensal.
- **Perguntar ao professor** se o front em Next.js é aceito, já que a disciplina é "Web com .NET".

### Etapa 5: Solução Mobile (2,0 · 4 a 5 páginas)
Pede: telas, fluxo de navegação, autenticação, sincronização e integração com APIs.
- **App Android em Flutter**, pasta `mobile/`. Telas: login, torneios, mesa, ranking da Liga e conta.
- **Autenticação:** os mesmos cookies da API, guardados no aparelho e renovados sozinhos.
- **Sincronização** (em finalização, confirmar antes de fechar o texto):
  - A mesa atualiza por SignalR (`/hubs/torneio`). O hub só avisa que algo mudou e o app busca os dados na API.
  - Sem o hub, consulta a API a cada 30 s.
  - As leituras ficam salvas no aparelho. Sem conexão, o app mostra a última cópia com a data.
  - Sair da conta apaga as cópias.
- **Não afirmar:** que ações feitas offline ficam na fila (o app exige conexão para lançar resultado) nem que há versão para iPhone ou notificação no app.
- Incluir diagrama do fluxo de navegação e prints.

### Etapa 6: Arquitetura de Software (2 a 3 páginas)
Pede: orientação a objetos, camadas e modularização.
- **Camadas:** `Controllers` → `Services` (`Interfaces` + `Implementations`) → `Data` (EF Core) → `Models` e `DTOs`.
- **OO:** injeção de dependência e interfaces.
- **Módulos:** `Services/Liga`, `Vigia`, `Pedidos`, `Crediarios`, `Campeonatos`.
- **Testes:** usar o total do dia da entrega (`dotnet test`).
- **A fazer:** diagrama de camadas e diagrama de classes de um módulo (sugestão: Liga).

### Etapa 7: Banco de Dados (1,0 · 3 a 4 páginas)
Pede: modelo lógico, físico, MER, procedures, triggers e script completo.
- **Arquivos em `docs/pim/banco`** (hoje na branch `feat/banco-checks-procedure`, PR 164): `modelo-logico.md`, `modelo-fisico.md`, `mer.html`, `schema-completo.sql`.
- **Números, valendo com o PR 164 aprovado:** 40 tabelas, 37 chaves estrangeiras, 11 CHECKs, 14 triggers, 5 funções e 2 procedures, no PostgreSQL 16.
- **Procedures:** `pr_manutencao_banco` e `pr_conferir_integridade`.
- **Explicar no texto:**
  - As 23 referências sem chave estrangeira (lista no fim do modelo lógico): histórico e autoria sobrevivem à exclusão do registro.
  - Por que há MongoDB, e que ele não entra no script.
- **Não afirmar** que o banco inteiro está na 3ª forma normal: há colunas com JSON ou listas (ex.: `decks.cards_json`). Tratar como exceção consciente.

### Etapa 8: Nuvem e DevOps (0,5 · 2 páginas)
Pede: plano com arquitetura em nuvem, serviços, containers, CI/CD, monitoramento, escalabilidade e segurança.
- **Infra:** VPS (IaaS) com Cloudflare na frente.
- **Containers:** nginx, frontend, API, PostgreSQL e MongoDB (`deploy/docker-compose.prod.yml`).
- **CI/CD:** GitHub Actions com testes, Postgres real, carga e CodeQL. Depois do merge com CI verde o deploy é **automático**, sem aprovação manual; faz backup e troca sem queda.
- **Monitoramento:** robô de smoke a cada 30 min e Vigia do sistema.
- **Escalabilidade:** é **proposta**, não existe hoje. Exemplos: banco gerenciado, réplicas da API atrás de balanceador.

### Etapa 9: Gerenciamento Ágil (1,0 · 3 páginas)
Pede: Product Backlog, Sprint Backlog, cronograma, Kanban e definição das entregas.
- **Product Backlog:** `docs/planejamento/BACKLOG.md`.
- **Entregas:** `frontend/public/CHANGELOG.md`, com versões e datas.
- **Sprints:** usar ciclos semanais, em continuidade ao "Ciclo Sábado" do PIM III. Montar o cronograma a partir das datas do changelog e apresentar como reconstrução, sem inventar reuniões.
- **A fazer:** Sprint Backlog e quadro Kanban. Definir papéis verdadeiros de cada integrante.

## Pendências

| Item | Quem | Situação |
|---|---|---|
| Autorização e dados da loja | Grupo | Aberto |
| Explicação do nome fictício → loja real | Grupo | Aberto |
| Papéis de cada integrante | Grupo | Aberto |
| Aceite do front Next.js | Grupo, com o professor | Aberto |
| MER em imagem para o Word | Desenvolvimento | Aberto |
| Diagramas de camadas, classes e navegação | Desenvolvimento | Aberto |
| Sprint Backlog e Kanban | Grupo | Aberto |
| Merge do PR 164 (banco) | Taino | Aguardando |
| App: tempo real, cópia local e APK | Desenvolvimento | Em andamento |
