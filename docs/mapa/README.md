# Mapa do sistema — onde mexer

Guia pra saber **onde fica cada coisa** e, principalmente, **o que mais precisa mudar junto** quando você
alterar algo. A parte de listas (endpoints, telas, componentes, tabelas) é gerada do código:

| Arquivo | O que tem |
|---|---|
| [ENDPOINTS.md](ENDPOINTS.md) | Todas as rotas da API: método, quem pode chamar, função do front que chama e as telas que usam |
| [FRONTEND.md](FRONTEND.md) | Páginas (URL → arquivo), componentes e onde cada um é usado, o que cada `lib/` exporta |
| [BACKEND.md](BACKEND.md) | Tabelas do banco (e se o startup cria), robôs em segundo plano, serviços |

Pra atualizar as listas depois de criar/mudar endpoint, tela, componente ou tabela:

```bash
python scripts/gerar-mapa.py
```

Este README é escrito à mão — o script não mexe nele. Quando descobrir uma regra nova do tipo
"mudou X, tem que mudar Y também", anote aqui.

---

## Visão geral

| Parte | Onde | Observação |
|---|---|---|
| API (C#/.NET 8) | `CardGameStore/` | Controllers em `Controllers/`, regra de negócio em `Services/Implementations/` |
| Front (Next.js 14) | `frontend/` | Telas em `app/`, peças reutilizáveis em `components/`, chamadas à API em `lib/api.ts` |
| Banco principal | PostgreSQL | Modelos em `CardGameStore/Models/PostgreSQL/`, configuração em `Data/AppDbContext.cs` |
| Vendas do balcão | MongoDB | `Models/MongoDB/VendaAvulsa.cs` |
| Testes | `tests/unit/CardGameStore.Tests/` | `dotnet test tests/unit/CardGameStore.Tests` (SQLite em memória) |
| Deploy | `deploy/` | `update.sh` na VPS; compose em `deploy/docker-compose.prod.yml` |
| Histórico de versões | `frontend/public/CHANGELOG.md` | Lido pela tela `/admin/sobre` — atualizar a cada versão |

---

## Mudou X? Mude também Y

### Banco de dados (tabela ou coluna nova)
O banco usa `EnsureCreated`, **sem migrations**. Em produção o banco já existe, então:
1. Crie/altere o modelo em `CardGameStore/Models/PostgreSQL/` e registre em `Data/AppDbContext.cs`.
2. Adicione o SQL no bloco de inicialização de `CardGameStore/Program.cs`:
   - bloco do **Postgres** (`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`);
   - bloco do **SQLite** (dev) — coluna nova vai na lista de `ALTER TABLE` que engole "duplicate column".
3. Correção de dados que só pode rodar uma vez: use o padrão `app_migrations` (veja `crediario_vencimento_fim_do_dia` no `Program.cs`).
4. **Nunca use `{` ou `}` nesse SQL, nem em comentário** — o EF trata como parâmetro e a API não sobe
   (derruba o site no deploy). Build e testes não pegam isso: suba a API local antes de commitar.

A coluna "No startup" do [BACKEND.md](BACKEND.md) mostra quais tabelas já têm SQL no startup.

### Datas e horário (fuso de Brasília)
O servidor roda em UTC; a loja vive em Brasília. Toda data "do dia" tem que ser de Brasília.
- **Back**: `CrediarioLancamentos.HojeBrasil()`, `ParaBrasilia(utc)`, `VencimentoFimDoDia(data)`.
  Vários serviços têm a própria cópia de `BrazilZone`/`DiaBrasil` (ComandaService, VendaAvulsaService,
  AnalyticsController, RelatoriosController, FiscalController, LigaMensalController, CurrencyService,
  FiscalXmlExportBackgroundService) — se mudar a regra, mude em todas.
- **Front**: `new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())`.
  **Nunca** `new Date().toISOString().slice(0, 10)` — das 21h à meia-noite dá o dia seguinte.
- Vencimento escolhido como data vale até 23:59:59 de Brasília.

### Formas de pagamento
A mesma lista aparece em vários lugares — forma nova precisa entrar em todos:
- Back: `Models/MongoDB/VendaAvulsa.cs` → `PaymentMethod` (valida comanda e PDV);
  `CrediarioLancamentos.FormasDePagamento` (o que quita crediário — só dinheiro de verdade).
- Front (`lib/api.ts`): `PAYMENT_METHODS`, `SECOND_PAYMENT_METHODS`, `COMANDA_PAYMENT_METHODS`,
  `PAYMENT_NEEDS_USER`, `FORMAS_PAGAMENTO_CREDIARIO`.
- Rótulos em PDF: `lib/relatorio.ts`, `lib/sumula-crediario.ts`, `components/cliente/ContaCrediarioCliente.tsx`.

### Visual: tema claro e escuro
- O tema claro é feito sobrescrevendo classes do Tailwind em `frontend/app/globals.css` (bloco `html.light`).
  **Classe que não está lá fica com a cor do tema escuro** — foi o que deixou linha preta no hover
  (`hover:bg-surface-600`) e opção marcada apagada (`text-brand-200`). Antes de usar uma cor nova, confira
  se ela tem versão em `html.light`.
- Texto de alerta/ok/erro com contraste nos dois temas: classes `txt-alerta`, `txt-ok`, `txt-erro`.
- No tema escuro `text-gray-600`/`700` são invisíveis — mínimo `text-gray-400`.
- Botão de liga/desliga: **sempre** `components/ui/Switch.tsx`. Não faça outro à mão.
- Cabeçalho de página do admin: `components/ui/PageHeader.tsx`.

### Permissões
- Back: políticas em `Program.cs` — `AdminOnly` (admin + operador), `OwnerOnly` (só admin),
  `CustomerOrAdmin`. A coluna "Quem" do [ENDPOINTS.md](ENDPOINTS.md) mostra a de cada rota.
- Front: menu filtra por `hasPermission` (`lib/auth.ts`, usado em `components/admin/Sidebar.tsx`).
  Perfis e permissões: tela `/admin/perfis`.
- Endpoint novo de admin sem `[Authorize]` fica **público** — confira a coluna "Quem".

### Pix (Banco Inter)
- Fala com o banco: `Services/Implementations/InterSyncService.cs` (criar, consultar, cancelar cobrança).
- Dá baixa quando pagou: `PixReconciliationService.cs` — um `case` por origem (comanda, crediário,
  campeonato, reserva). Origem nova de cobrança = `case` novo aqui.
- Robô que confere a cada 5 min: `PixReconciliationBackgroundService.cs`.
- Crediário tem regra própria (reaproveitar cobrança, pagar parte, pagar tudo): `CrediarioPixService.cs`.

### Crediário
| O quê | Onde |
|---|---|
| Conta, compras, pagamentos, avisos (modelos) | `Models/PostgreSQL/Crediario.cs`, `CrediarioLancamento.cs`, `PagamentoCrediario.cs`, `CrediarioAviso.cs` |
| Telas do admin | `frontend/app/admin/crediario/page.tsx`, `components/admin/CrediarioAvisos.tsx` |
| Tela do cliente | aba Dívida em `app/cliente/perfil/page.tsx` → `components/cliente/ContaCrediarioCliente.tsx` |
| Página de pagamento (sem login) | `app/pagar/[token]/page.tsx` + `Controllers/PagamentoCrediarioController.cs` |
| Abrir conta / somar compra | `ComandaService.CloseComandaAsync` e `VendaAvulsaService` (os dois criam `CrediarioLancamento`) |
| Estorno | `ComandaService.EstornarComandaFechadaAsync`, `VendaAvulsaService.EstornarAsync` → regras em `CrediarioLancamentos` |
| Avisos de vencimento | `CrediarioAvisoService.cs` + `CrediarioAvisoBackgroundService.cs` |
| Súmula/extrato PDF | `frontend/lib/sumula-crediario.ts` |
| Itens somados | `frontend/lib/crediario.ts` (`agruparItens`) |

Mudou como uma compra entra no crediário? Mexa em **comanda e PDV juntos** — os dois têm o mesmo fluxo.

### Notificações pro cliente/admin
- Sininho: tabela `notifications` (`Models/PostgreSQL/Notification.cs`).
- Push no celular: `IPushService`. E-mail: `IEmailService` (`EmailService.cs`).
- WhatsApp da loja: `IWhatsAppGateway` (Evolution API) — só sai se o celular estiver pareado.

### Faturamento e relatórios
- Faturamento soma **comanda `Fechada`** + venda do balcão não estornada. Estorno marca, não apaga.
- Pagamento de crediário entra no **extrato** (caixa), não na **receita** — senão a venda conta duas vezes.
- Telas: `/admin/financeiro` e `/admin/relatorios`; contas em `AnalyticsController` e `RelatoriosController`.

---

## Antes de subir

1. `dotnet build CardGameStore` e `dotnet test tests/unit/CardGameStore.Tests`
2. `npx tsc --noEmit -p frontend`
3. Mexeu no `Program.cs`? Suba a API local e veja se ela inicia.
4. Atualize `frontend/public/CHANGELOG.md`.
5. Mexeu em endpoint/tela/componente/tabela? `python scripts/gerar-mapa.py`.
6. Na VPS (`srv1696954`): `cd /opt/santuarionerd && git pull origin main && bash deploy/update.sh`
