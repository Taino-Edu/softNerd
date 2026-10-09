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
| Front (Next.js 14) | `frontend/` | Telas em `app/`, peças reutilizáveis em `components/`, chamadas à API em `lib/api/` (um arquivo por assunto; as telas importam de `@/lib/api`) |
| Banco principal | PostgreSQL | Modelos em `CardGameStore/Models/PostgreSQL/`, configuração em `Data/AppDbContext.cs` |
| Vendas do balcão | MongoDB | `Models/MongoDB/VendaAvulsa.cs` |
| Testes | `tests/unit/CardGameStore.Tests/` | `dotnet test tests/unit/CardGameStore.Tests` (SQLite em memória) |
| Deploy | `deploy/` | `update.sh` na VPS; compose em `deploy/docker-compose.prod.yml` |
| Histórico de versões | `frontend/public/CHANGELOG.md` | Lido pela tela `/admin/sobre` — atualizar a cada versão |

---

## Mudança grande: sempre com volta

Mudança grande de comportamento (regra de negócio, cálculo, permissão, fluxo de tela inteiro) entra
**atrás de uma chave de funcionalidade**, com o jeito antigo guardado. Se der problema em produção, o dono
desliga em **/admin/funcionalidades** ("Mudanças com volta", menu Configuração) e o sistema volta na hora,
sem deploy e sem esperar CI.

| Peça | Onde |
|---|---|
| Catálogo (fonte da verdade: código, textos, padrão, versão, data de revisão) | `CardGameStore/Configuration/Funcionalidades.cs` |
| Consultar no back | `FuncionalidadesService.LigadaAsync(Funcionalidades.X)` (cache de 30 s, limpo ao mudar) |
| Consultar no front | `useFuncionalidade('codigo')` em `frontend/lib/useFuncionalidade.ts` (`undefined` enquanto carrega; `false` se a API falhar) |
| Estado mudado à mão | tabela `funcionalidades` (sem linha = padrão do catálogo); toda mudança vai pra auditoria |
| Tela do dono | `frontend/app/admin/funcionalidades/page.tsx` |

Como fazer:
1. Crie a chave no catálogo (`Padrao: true` — a volta é pra emergência, não pra testar em produção),
   com `OQueMuda` e `SeDesligar` escritos pra quem vai apertar o botão, e `RevisarEm` (~2 meses).
2. Deixe o novo e o antigo **lado a lado** num lugar só, com o antigo copiado sem mudança e marcado
   `// FALLBACK da chave "x" — apagar junto com a chave`. Ex.: `LigaMensalService.RankingPorJogador` ×
   `RankingLegadoPorNome`; `OperatorPermissionMiddleware.Decidir(..., acessoPeloMenu)`.
3. Teste **os dois caminhos** — e, quando fizer sentido, que dão o mesmo resultado no caso comum
   (`CaminhoNovoEFallback_DaoOMesmoResultado_NoCasoComum`).
4. Passou o `RevisarEm` sem problema: um PR apaga o antigo, a chave do catálogo e os testes do fallback.
   A tela avisa quando chega a data.

O que **não** precisa de chave: correção pequena e óbvia, texto, visual pontual, código novo que nada usa
ainda. Mudança de banco não tem volta por chave — o SQL de inicialização só adiciona (nunca apaga
coluna), então o código antigo continua funcionando com o banco novo.

---

## Mudou X? Mude também Y

### Banco de dados (tabela ou coluna nova)
O banco usa `EnsureCreated`, **sem migrations**. Em produção o banco já existe, então:
1. Crie/altere o modelo em `CardGameStore/Models/PostgreSQL/` e registre em `Data/AppDbContext.cs`.
2. Adicione o SQL em `CardGameStore/Data/Inicializacao/` (roda a cada startup, via `Data/InicializacaoBanco.cs`):
   - `postgres.sql` (produção) — `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`;
   - `sqlite.sql` (dev) — tabela nova; coluna nova vai na lista `ColunasSqlite` do `InicializacaoBanco.cs`
     (SQLite não tem `ADD COLUMN IF NOT EXISTS`, o erro de coluna duplicada é engolido).
3. Correção de dados que só pode rodar uma vez: use o padrão `app_migrations` (veja `crediario_vencimento_fim_do_dia` no `postgres.sql`).
4. Tudo precisa ser idempotente — o mesmo SQL roda em todo restart. Os `.sql` vão embutidos na DLL e
   rodam direto na conexão, então `{` `}` não quebram mais (antes, dentro do `Program.cs`, derrubavam a API).
   Mesmo assim: suba a API local antes de commitar — build e testes não executam o `postgres.sql`.

A coluna "No startup" do [BACKEND.md](BACKEND.md) mostra quais tabelas já têm SQL no startup.

### Datas e horário (fuso de Brasília)
O servidor roda em UTC; a loja vive em Brasília. Toda data "do dia" tem que ser de Brasília.
- **Back**: `CardGameStore/Common/Brasilia.cs` — `Brasilia.Zona`, `Hoje()`, `Agora()`, `ParaBrasilia(utc)`,
  `DiaUtc(dia)` (intervalo UTC de um dia de Brasília). Era copiado em 11 arquivos; não crie outro
  `FindSystemTimeZoneById`. Vencimento escolhido como data: `CrediarioLancamentos.VencimentoFimDoDia`.
- **Front**: `frontend/lib/format.ts` — `hojeBrasil()`, `dataISOBrasil()`, `somarDias()`, `dataBR()`, `dataHoraBR()`.
  **Nunca** `new Date().toISOString().slice(0, 10)` — das 21h à meia-noite dá o dia seguinte.
- Vencimento escolhido como data vale até 23:59:59 de Brasília.

### Formas de pagamento
Catálogo **único** em dois espelhos — forma nova ou regra mudada é uma linha em cada:
- Back: `CardGameStore/Models/PaymentMethod.cs` (`PaymentMethod.Catalogo`: código, rótulo, entra no caixa,
  precisa cliente, usa saldo do cliente). Regras perguntam ao catálogo: `EntraNoCaixa`, `PrecisaCliente`,
  `UsaSaldoDoCliente`, `QuitamCrediario`, `Normalizar` (nome legado → código).
- Front: `frontend/lib/pagamentos.ts` (`FORMAS_PAGAMENTO`, `rotuloPagamento`, `rotuloCurtoPagamento`,
  `opcoesPagamento`). As listas de cada tela em `lib/api/comandas.ts` e `lib/api/crediario.ts` (`PAYMENT_METHODS`, `COMANDA_PAYMENT_METHODS`,
  `SECOND_PAYMENT_METHODS`, `FORMAS_PAGAMENTO_CREDIARIO`) são recortes dele — não escreva lista nova à mão.
- O teste `PaymentMethodTests.CatalogoDoFront_EIgualAoDoBack` falha se os dois divergirem.
- A validação fica no serviço (`VendaAvulsaService.RegisterAsync`), não só no controller: qualquer caminho
  que registre venda (PDV, homologação de reserva) passa por ela.
- Ícones e cores por forma continuam em cada tela (são visual da tela, não regra).

### Dinheiro na tela
- **Sempre** `brl(valor)` / `brlDeCentavos(centavos)` de `frontend/lib/format.ts` ("R$ 1.234,56").
  Não escreva `toFixed(2).replace('.', ',')` nem `fmt` local — eram 17 cópias e ~100 soltos, alguns
  mostrando "R$ 12.50" com ponto. `numeroBR(n)` quando precisar do número sem o "R$".
- Campo de digitação de valor (input) é outra coisa: lá o texto é lido de volta, não use `brl`.

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

### Liguinha (torneio suíço)
Arquitetura e APIs em [docs/liguinha.md](../liguinha.md). Camada em cima do campeonato: inscrição e Pix seguem
no `ChampionshipController`; rodadas e partidas ficam em `Services/Liga/` (`Suico.cs` = motor puro com testes,
`TorneioService.cs` = regras e concorrência). Ao encerrar, a classificação vira `Placement` e a Liga Mensal soma.
- Telas: `/liga/jogar` (jogador), `/liga/torneio/[id]` (telão), `/admin/campeonatos/[id]/torneio` (organizador).
- Tempo real: `Hubs/TorneioHub.cs` + `frontend/lib/useTorneioAoVivo.ts`. **Não troque por polling**: a loja
  inteira sai pelo mesmo IP e o limite de requisições é por IP.
- Timer: `timers.championship_id` — a liguinha reinicia o timer do campeonato a cada rodada.

### Liga Mensal
- Regra em `Services/Liga/LigaMensalService.cs` (controller só recebe e responde); testes em `LigaMensalServiceTests`.
- Pontos 10/7/5/3/1 por `Placement`; o mês é o de Brasília. A liguinha soma sozinha ao encerrar
  (teste `TorneioEncerrado_SomaNaLigaMensal_ComOsPontosDaColocacao`).
- Uma linha **por jogador** (id), não por nome; lançamento manual entra no jogador de mesmo nome só se houver um.
  Chave `liga-mensal-por-jogador` (fallback: o cálculo antigo por nome).

### Permissões do operador
- `Middleware/OperatorPermissionMiddleware.cs` + `Permissao.RotasPrefixo` (`Models/PostgreSQL/Perfil.cs`).
- Só **rota de admin** (`AdminOnly` / papel Operator) é conferida no mapa; rota pública ou de cliente vale pro
  operador como pra qualquer logado. Chave `operador-acesso-pelo-menu` (fallback: tudo fora do mapa dava 403).
- **Rota de admin nova**: ponha o prefixo no mapa da permissão da tela, ou — se for só do dono — na lista
  `SoODonoDeProposito` do teste `TodaRotaAdminOnly_TemPermissaoQueAbre_OuEstaNaListaDoDono`. O teste falha
  se esquecer (era assim que Liga Mensal, Pré-vendas e Mensageria davam "Sem permissão" pro operador).

### Visitas do cliente
- Visita = **dia** (Brasília) com comanda fechada **ou** compra no PDV: `Services/Implementations/VisitasDoCliente.cs`.
  Histórico do cliente e "clientes ativos" do painel contam os dois; antes só comanda.

### Limite de requisições (rate limit)
Em `CardGameStore/Program.cs`, seção 6. Regras que já quebraram:
- **Nunca `AddFixedWindowLimiter`**: ele cria UM balde pro site inteiro (era assim: 5 logins/min somando todos
  os clientes). Use `AddPolicy` com partição por IP ou por usuário.
- A loja inteira sai pelo mesmo IP (wi-fi): limite de quem está logado é por usuário. `UseRateLimiter` fica
  **depois** de `UseAuthentication`, senão ninguém está identificado e tudo cai no IP.
- Senha errada: o bloqueio é **por conta** (`Services/Implementations/ProtecaoLogin.cs`, colunas
  `users.falhas_login` / `login_bloqueado_ate`), com cookie de "dispositivo conhecido" que nunca trava. O limite
  por IP de login (`"login"`, 100/min) é só teto contra robô. Login novo com senha? Use `ConferirSenhaAsync`.
- **Entrar com Google**: `Services/Implementations/LoginGoogle.cs` + `AuthService.LoginGoogleAsync`; botão em
  `frontend/components/GoogleLoginButton.tsx` (some sozinho sem Client ID). Liga com `GoogleAuth:ClientId`
  (prod: `GOOGLE_CLIENT_ID` no `.env` da VPS). Só clientes; liga a conta pelo e-mail verificado (`users.google_sub`).
- **QR Code da mesa** (`QuickLoginAsync`): nunca entra em conta com senha nem da equipe, exige WhatsApp (e CPF, se o
  cadastro tiver) iguais ao cadastro e não sobrescreve nada. Quem tem senha abre comanda por `POST /api/comanda/abrir-na-mesa`.
- Teste: `python scripts/carga-liguinha.py --jogadores 32` (só localhost; cria e apaga o campeonato de teste).

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

### Cadeia de proteção (GitHub)
| Onde | O quê | Arquivo |
|---|---|---|
| Todo PR | testes do back, TypeScript + build do front, mapa atualizado | `.github/workflows/ci.yml` |
| Todo PR | **API sobe num Postgres de verdade** (2×, prova que o SQL de inicialização é idempotente), smoke e torneio de carga com 16 jogadores | `ci.yml` → `integracao` |
| Todo PR | imagens Docker de produção constroem; nenhuma dependência nova com vulnerabilidade alta | `ci.yml` → `docker`, `dependencias` |
| PR, main e toda segunda | varredura de segurança do código (C# e TS) | `.github/workflows/codeql.yml` |
| Toda semana | PRs de atualização de dependências (agrupados) | `.github/dependabot.yml` |
| `main` | só entra por PR com o CI verde; sem push direto nem `--force` (vale pro admin também) | proteção de branch |
| Deploy | **abre sozinho** quando o CI do `main` passa e espera a aprovação (aprovar = escolher a hora; também dá pra rodar à mão); só sobe a última versão do `main` com CI verde; `update.sh` faz **backup dos bancos antes** (sem backup, sem deploy), troca sem queda, e o vigia mede pedido a pedido; depois `/health` e smoke | `.github/workflows/deploy.yml`, `deploy/update.sh`, `deploy/rollout.sh` |
| Produção | **robô de smoke a cada 30 min**; se cair, abre alerta (issue `smoke`, chega por e-mail) e fecha quando volta | `.github/workflows/smoke.yml`, `scripts/smoke.py` |
| Repositório | varredura de segredos com bloqueio do push; alertas e correções automáticas de dependências | configuração do GitHub |

### Troca sem queda (azul-verde)
O deploy não derruba mais o site: `deploy/update.sh` constrói as imagens com o site no ar e chama
`deploy/rollout.sh` pra `api` e `frontend` — a cópia nova sobe **ao lado** da antiga, o rollout pergunta
direto a ela (`/health`, `/manifest.json`) até responder (máx. 45 s; senão apaga a nova e para, com a antiga
no ar), espera o nginx enxergar a nova e só então desliga a antiga com calma (até 35 s pra terminar o que
estava fazendo). O nginx reenvia pra outra cópia o pedido que bater numa que está saindo.

Regras que isso cria:
- **Robô novo espera ≥ 1 min antes da primeira volta** (`await Task.Delay(TimeSpan.FromMinutes(1), ct)`
  antes do `while`). As duas cópias ficam juntas por menos de 1 min; assim nunca rodam robô em dobro.
  O teste `TodoRobo_EsperaPeloMenos1MinutoAntesDaPrimeiraVolta` falha se esquecer.
- **SQL de inicialização continua só adicionando** (já era regra): a cópia nova roda o SQL enquanto a antiga
  ainda atende com o código velho.
- `api` e `frontend` **não têm nome fixo de container**. Logs:
  `cd /opt/santuarionerd/deploy && docker compose -f docker-compose.prod.yml logs api --since 10m`.
- Telão e celulares da liguinha reconectam sozinhos na troca (o tempo real cai e volta em segundos).
- Medir uma troca: `python scripts/vigia-deploy.py --segundos 120` durante o deploy (só lê; pode em produção).
- Todo deploy faz backup dos bancos antes (`deploy/backup.sh` → `backups/`, 7 dias). Emergência sem backup:
  `SEM_BACKUP=1 bash deploy/update.sh`.
- **Nginx**: a pasta `deploy/nginx/` é montada inteira em `/etc/nginx/snippets`; o `conf.d/default.conf` é só
  `deploy/nginx/entrada.conf` (1 linha fixa que inclui `snippets/nginx.conf` — não mexer). Todo deploy faz `nginx -t` +
  `nginx -s reload`: troca a config sem derrubar conexão; config quebrada para o deploy e o nginx segue com a anterior.
  Mexa em `nginx.conf` (servers, resolver) e `locations.conf` (rotas).
- `/_next/image` está **fechado** (nginx 404 + `images.unoptimized` no `next.config.js`): falha crítica no Next 14.
  Reabrir só no Next 15.5.24+.
- Voltar uma versão: `bash deploy/update.sh <commit>` (sem argumento volta pro `main`).
  Voltar pro deploy antigo (derruba e sobe, ~15 s fora): `DEPLOY_AZUL_VERDE=0 bash deploy/update.sh`.

A chave do deploy só abre o porteiro `/usr/local/bin/santuario-ci` na VPS (aceita `ping`, `status`, `deploy`;
log em `/var/log/santuario-ci.log`). Deploy na mão continua igual:
`cd /opt/santuarionerd && git pull origin main && bash deploy/update.sh`.

1. `dotnet build CardGameStore` e `dotnet test tests/unit/CardGameStore.Tests`
2. `npx tsc --noEmit -p frontend`
3. Mexeu no `Program.cs` ou em `Data/Inicializacao/`? Suba a API local e veja se ela inicia.
4. Atualize `frontend/public/CHANGELOG.md`.
5. Mexeu em endpoint/tela/componente/tabela? `python scripts/gerar-mapa.py`.
6. Na VPS (`srv1696954`): `cd /opt/santuarionerd && git pull origin main && bash deploy/update.sh`
