# PIM IV × softNerd (Santuário Nerd) — o que já atende e o que falta

> **DESATUALIZADA desde 09/11/2026.** Para escrever o trabalho, use [GUIA-ESCRITA-PIM-IV.md](GUIA-ESCRITA-PIM-IV.md).
> Aqui ficam só o histórico e as decisões técnicas de 23/10.

> Análise de 23/10/2026 contra o `manual-pim-iv.md` (extraído de `Manual_PIM_IV_ADS_v2.docx`, nesta pasta),
> **revisada em 07/11/2026** (ver "O que mudou desde 23/10" logo abaixo — o texto das etapas já está corrigido).
> Só levantamento: nada foi implementado por causa do PIM ainda.
> ✅ atende · 🔸 atende em parte · ❌ falta

## O que mudou desde 23/10 (conferido no `main` em 07/11/2026)

O sistema andou e **algumas coisas que esta análise citava deixaram de existir**. O trabalho escrito só pode
descrever o que está no código de hoje.

| Assunto | 23/10 | 07/11 |
|---|---|---|
| Plataforma da API | ASP.NET Core 8 (suporte acaba em 10/11) | **.NET 10 LTS** em produção (v1.70.0) |
| Front | Next.js 15 | Next.js 15 (`15.5.x`) |
| Endpoints REST | 286 | **252** (lista em `docs/mapa/ENDPOINTS.md`) |
| **NFC-e / fiscal** | citado como diferencial | **removido do sistema** (v1.71.0, 26/10). Não citar no texto |
| WhatsApp automático, OFX, Mercado Pago | existiam | **removidos** (v1.73.0). Não citar |
| Tenant-ERP (SaaS multi-loja) | em andamento | **fora do repositório** (v1.71.0) |
| Testes de unidade | "mais de 620" | **608 casos** (605 passam, 3 ignorados) |
| Procedures / triggers no PostgreSQL | 0 | **0** (continua o maior buraco do Banco) |
| Bancos | PostgreSQL + MongoDB | PostgreSQL + MongoDB; **retirada do Mongo planejada** (Mongo ainda em 6 arquivos). Deixar pra descrever a arquitetura final, com um banco só |
| Tempo real | SignalR | SignalR; **corrida de reconexão corrigida** (v1.84.1) e telas com rede de segurança |
| Painel de venda e comanda | — | rascunho dos modais, Esc, uso no celular (v1.85.0) |

**Para o trabalho escrito:** o que sobrou de funcionalidade é pedido do site → Pix → venda → estoque → financeiro;
comanda por mesa (QR), crediário, pré-venda, Liga/Liguinha com telão, Vigia do sistema, LGPD e acessibilidade (VLibras).

## Resumo

| # | Etapa (disciplina) | Pontos | Situação |
|---|---|---|---|
| — | Formatação ABNT | 1,0 | ❌ o trabalho escrito ainda não existe |
| 1 | Caracterização da organização | 1,0 | 🔸 temos o material, falta escrever (e conferir se é a mesma empresa do PIM III) |
| 2 | Planejamento da solução (Empreendedorismo em TI) | 1,0 | 🔸 a solução existe e está em produção; falta o texto de negócio |
| 3 | Responsabilidade social e diversidade (Rel. étnico-raciais) | 0,5 | 🔸 acessibilidade forte; diversidade e combate à discriminação não estão explícitos |
| 4 | Solução Web (Desenvolvimento Web com .NET) | 2,0 | ✅ API ASP.NET Core + painel web completo |
| 5 | Solução Mobile (Desenvolvimento Mobile) | 2,0 | ❌/🔸 só existe PWA/site responsivo — **não há aplicativo móvel** |
| 6 | Arquitetura de Software (Programação Aplicada em .NET) | — | ✅ camadas, OO e módulos (já em .NET 10); faltam os diagramas |
| 7 | Banco de Dados (Programação de BD) | 1,0 | 🔸 físico pronto; **faltam MER, modelo lógico, procedures e triggers** |
| 8 | Nuvem e DevOps (Cloud Computing e DevOps) | 0,5 | ✅ containers, CI/CD, monitoramento — falta escrever o plano |
| 9 | Gerenciamento Ágil (Gerenc. de Projetos Ágil) | 1,0 | 🔸 backlog e entregas existem; faltam sprints e Kanban formais |

Maiores buracos em pontos: **Mobile (2,0)**, **trabalho escrito/ABNT (1,0 + ele é a base de todas as outras notas)** e **Banco (MER, procedures, triggers)**.

## Etapa por etapa

### Etapa 1 — Caracterização da organização 🔸
- **Já temos:** Santuário Nerd, loja de TCG (Pokémon, One Piece, Riftbound…) em José Bonifácio-SP, do Maikon: venda no balcão e no site, pré-venda, comandas na mesa, campeonatos/liguinha semanais, crediário. *(NFC-e saiu do sistema em 26/10.)*
- **Falta:** o texto com segmento, produtos/serviços, estrutura organizacional, processos, problemas e oportunidades.
- **Atenção:** o tema é **continuação do PIM III** ("desenvolvimento das aplicações definidas no PIM III"). Precisa ser a **mesma organização** estudada no PIM III — confirmar.

### Etapa 2 — Planejamento da solução 🔸
- **Já temos:** problema real resolvido (controle de estoque/caixa/pré-venda/torneios que antes era manual), público (Maikon/equipe e clientes jogadores), diferenciais (liguinha com telão e celular, Pix integrado ao Inter, Vigia do sistema, Pokémon preferido). *(NFC-e não é mais diferencial: foi removida.)*
- **Falta:** escrever problema, objetivos, público-alvo, proposta de valor, benefícios e diferenciais no formato do manual.

### Etapa 3 — Responsabilidade social e diversidade 🔸
- **Já temos:**
  - **Acessibilidade**: VLibras (Libras) em todo o site, tema claro/escuro com contraste, "reduzir movimento" respeitado nas animações, textos com piso de 12 px na home.
  - **LGPD**: consentimento de cookies, direitos do titular, retificação e anonimização da conta.
  - **Cidadania/comunidade**: liguinha aberta, inscrição grátis, Pokémon preferido/perfil público.
- **Falta (explícito no manual):** **combate à discriminação** e **valorização da diversidade**. Ideias pro texto ou pequenas adições: código de conduta dos torneios (com denúncia), nome social no cadastro, linguagem inclusiva.
- **Pendente no backlog:** auditoria de acessibilidade.

### Etapa 4 — Solução Web (.NET) ✅
- **Arquitetura:** API **ASP.NET Core (.NET 10 LTS)** + front **Next.js 15**; PostgreSQL (+ MongoDB, em retirada); SignalR (tempo real).
- **APIs REST:** 252 endpoints (lista em `docs/mapa/ENDPOINTS.md`).
- **Autenticação:** JWT em cookie **HttpOnly** + refresh token, bloqueio por senha errada, login rápido por QR da mesa.
- **Segurança:** perfis e permissões de operador, rate limiting, CodeQL, auditoria, chaves de funcionalidade, firewall só Cloudflare.
- **Estrutura administrativa:** painel `/admin` (PDV, estoque, financeiro, crediário, liguinha, relatórios).
- **Integração entre módulos:** pedido do site → Pix → venda → estoque → financeiro; comanda → crediário/pontos; campeonato → Liga Mensal.
- **Observação:** a disciplina é "Desenvolvimento Web com .NET". A API é .NET, mas as telas são Next.js (React). Vale confirmar com o professor se isso conta ou se ele espera telas em .NET (Razor/Blazor/MVC).
- **Versão:** ✅ migrado pro .NET 10 LTS (v1.70.0), antes do fim do suporte do .NET 8 (10/11/2026).

### Etapa 5 — Solução Mobile ❌/🔸 (vale 2,0)
- **Já temos:** site 100% responsivo, **PWA** (manifest `standalone` + service worker, instala na tela inicial) e push no celular. A parte do jogador da liguinha é praticamente um app (código → deck → mesa → resultado → ranking).
- **Falta:** o manual pede **aplicativo móvel integrado**: telas principais, fluxo de navegação, autenticação, **sincronização de dados** e integração com as APIs. PWA pode não ser aceito como "aplicativo".
- **Caminhos possíveis** (decidir antes de fazer):
  1. **.NET MAUI** — app nativo em C#, combina com o curso (.NET), consome a mesma API.
  2. **React Native (Expo)** — reaproveita o conhecimento do front.
  3. Defender o **PWA** como app (mais barato, mas arriscado na nota).
- Escopo sugerido do app: login, minha conta (pontos, pedidos, Pokémon preferido), liguinha (entrar com código, minha mesa, lançar resultado, ranking) e pré-venda — com cache offline e sincronização.

### Etapa 6 — Arquitetura de Software ✅
- **Já temos:**
  - **Camadas**: `Controllers` → `Services` (`Interfaces` + `Implementations`) → `Data` (EF Core) → `Models`/`DTOs`.
  - **OO**: injeção de dependência, interfaces, `Common`, `Validation`, `Middleware`.
  - **Módulos**: `Services/Liga`, `Services/Vigia`, `Services/Pedidos`, `Services/Crediarios`, `Services/Campeonatos`, Pix.
  - **Testes**: 608 casos de teste de unidade (605 passam, 3 ignorados) + CI com Postgres de verdade e carga.
- **Falta:** diagramas — de camadas/componentes e de classes de um módulo (ex.: Liga).

### Etapa 7 — Banco de Dados 🔸
- **Já temos:**
  - **Modelo físico**: 32+ tabelas (`CardGameStore/Data/Inicializacao/postgres.sql` + EF Core); lista em `docs/mapa/BACKEND.md`.
  - **Índices**, chaves únicas e regras de concorrência (ex.: Pix, homologar).
- **Falta:**
  - **MER** e **modelo lógico** (diagramas).
  - **Procedures**: hoje **0**.
  - **Triggers**: hoje **0** — toda a regra mora no C#.
  - **Script completo** num arquivo só, pras APIs/Web/Mobile: hoje o banco nasce do EF + `postgres.sql`. Dá pra gerar com `pg_dump --schema-only`.
- **Sugestão (sem quebrar o sistema):**
  - **Triggers**: `updated_at` automático, ou auditoria de mudança de estoque.
  - **Procedures/functions**: fechamento do caixa do dia, ranking da Liga Mensal, relatório de vendas por período.
  - Criar no `postgres.sql` (idempotente, como a regra da casa) e chamar de algum relatório, pra mostrar em uso.

### Etapa 8 — Nuvem e DevOps ✅ (só pede o plano)
- **Já temos:**
  - **Containers**: Docker para API, front, nginx, Postgres e Mongo (`deploy/docker-compose.prod.yml`).
  - **CI/CD**: GitHub Actions com testes, Postgres de verdade, carga, CodeQL e build das imagens. Deploy com aprovação, backup antes e **troca sem queda**.
  - **Monitoramento**: robô de smoke a cada 30 min, **Vigia do sistema** (alertas), logs guardados por 30 dias.
  - **Segurança**: Cloudflare na frente, firewall, chaves fora do código, atualizações de segurança (Node 24, nginx 1.30).
- **Falta:**
  - Escrever o plano: arquitetura em nuvem, serviços, escalabilidade.
  - **Atenção**: hoje é uma **VPS** (Hostinger) + Cloudflare. Pro texto, descrever como IaaS e propor a evolução (ex.: Postgres gerenciado, réplica da API atrás de balanceador) como plano de escalabilidade.

### Etapa 9 — Gerenciamento Ágil 🔸
- **Já temos:** **Product Backlog** vivo (`docs/planejamento/BACKLOG.md`), entregas por versão (CHANGELOG com datas), fluxo branch → PR → CI → deploy, "esperando alguém" / "na fila" / "feito".
- **Falta:** **Sprint Backlog**, **cronograma das sprints** e **quadro Kanban**. Dá pra montar retroativo a partir do CHANGELOG (ex.: sprints de 2 semanas) e um Kanban no GitHub Projects.

### Trabalho escrito (ABNT) ❌
- Obrigatórios: Capa, Resumo (150–500 palavras), Abstract, Sumário, Introdução, **Desenvolvimento (20 a 30 páginas)**, Conclusão, Referências ABNT.
- Formatação: A4, margens 3/2 cm, Arial ou Times 12, espaçamento 1,5, numeração a partir da Introdução.
- **Plágio:** o texto precisa ser autoral e com citação. A UNIP passa em software de similaridade.
- Grupo de até 6 integrantes, postagem pelo líder no sistema da UNIP no prazo.

## Decisões (23/10/2026)
- Organização do PIM III: **Santuário Nerd** ✅ (mesma empresa).
- Por enquanto o Taino faz sozinho (divide com o grupo depois).
- Mobile: **Flutter**.

### O sistema aguenta um app Flutter? Sim, com 3 cuidados
1. **Login**: a API guarda o token em **cookie HttpOnly** e não devolve o token no corpo (`SafeAuthResponse`). Num app nativo isso funciona com um "pote de cookies" (`dio` + `cookie_jar` persistente): o login grava os cookies e o app manda de volta em toda chamada; o `/api/auth/refresh` já aceita o cookie. Alternativa mais "de app": um login específico pro mobile que devolve o token pra mandar no cabeçalho `Authorization: Bearer` (a API já aceita Bearer quando não há cookie).
2. **Tempo real** (liguinha ao vivo): o hub SignalR `/hubs/torneio` tem cliente Flutter (`signalr_netcore`); manda o cookie no cabeçalho da conexão.
3. **Notificação no celular**: hoje é Web Push (navegador). App nativo precisa de **Firebase Cloud Messaging** — integração nova no backend (opcional pro PIM).

### Procedures e triggers no PostgreSQL: dá, com as regras da casa
- Entram no `postgres.sql` de inicialização **idempotentes**: `CREATE OR REPLACE FUNCTION/PROCEDURE` e `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`; subir a API local no Postgres antes de commitar.
- O SQLite de desenvolvimento e os testes de unidade **não têm procedure** (SQLite não suporta); por isso nenhuma regra de negócio crítica pode depender delas — trigger de auditoria/`updated_at` e funções de relatório. Teste delas no job do CI que usa **Postgres de verdade**.
- Com o EF Core no Postgres, trigger que muda a própria linha (ex.: `updated_at`) não atrapalha; o EF só não "vê" o valor novo até recarregar.

## Perguntas em aberto
1. O professor de "Web com .NET" aceita front em Next.js com API em .NET?
2. Prazo de entrega.
