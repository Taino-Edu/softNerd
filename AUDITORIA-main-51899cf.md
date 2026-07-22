# Auditoria de Código — SoftNerd / CardGameStore

- **Escopo:** diff `bee61c7..51899cf` (17 commits) + estado atual dos arquivos afetados, branch `main` @ `51899cf`
- **Tipo:** READ-ONLY (nenhum arquivo de código foi alterado)
- **Data da auditoria:** 2026-06-24
- **Arquivos no diff:** 38 (backend C#, frontend Next.js/TS, deploy, testes) — +2.657 / −511 linhas

---

## Sumário de severidade

| Severidade | Quantidade |
|---|---|
| 🔴 Crítico | 1 |
| 🟠 Alto | 5 |
| 🟡 Médio | 10 |
| 🔵 Baixo | 9 |

---

# 🔴 CRÍTICO

## C1. Chave JWT placeholder commitada + script na raiz que forja token de Admin com exatamente essa chave

**Arquivos:**
- `CardGameStore/appsettings.json:22-24`
- `gen-test-token.cs` (untracked, raiz do repo)
- `CardGameStore/Program.cs:113-127`

**Problema:** O `appsettings.json` commitado carrega `"SecretKey": "SUBSTITUA_ESTA_CHAVE_POR_UMA_STRING_SECRETA_E_FORTE_EM_PRODUCAO"`, com `Issuer: "https://localhost:5001"` e `Audience: "CardGameStore-Frontend"`. O script solto `gen-test-token.cs` (não rastreado, na raiz) gera um JWT com claim `"role": "Admin"` usando **exatamente** essa mesma chave, issuer e audience. A aplicação sobe silenciosamente com esses valores caso a variável de ambiente de override (`JwtSettings__SecretKey`) não esteja configurada no deploy — não há nenhum fail-fast em `Program.cs` rejeitando a chave placeholder.

**Impacto:** Se a VPS rodar com a config commitada (override ausente, quebrado ou perdido num redeploy), qualquer pessoa com acesso a este repositório forja um token de Admin válido por 8h e opera todos os endpoints `AdminOnly` (estoque, crediários, usuários, fiscal, vendas). É comprometimento total da API.

**Recomendação:**
1. Deletar `gen-test-token.cs`, `test-emissao-sefaz.cs`, `test-sefaz.cs` da raiz (são lixo de dev — ver seção Código Morto).
2. Adicionar fail-fast no startup: se `SecretKey` for o placeholder ou tiver < 32 bytes de entropia em ambiente Production, abortar o boot.
3. Confirmar no `deploy/.env` da VPS que `JwtSettings__SecretKey` está definido e diverso do placeholder; se houver dúvida de que já rodou exposta, **rotacionar a chave** (invalida tokens ativos).

---

# 🟠 ALTO

## A1. Reconciliação Pix sem idempotência em nível de banco — corrida entre robô, tela e GET duplica baixas

**Arquivos:**
- `CardGameStore/Services/Implementations/PixReconciliationService.cs:37-93` (guarda `PagoEm`), `:100-118` (comanda), `:121-156` (crediário), `:183-201` (ExternalTransaction)
- `CardGameStore/Services/Implementations/PixReconciliationBackgroundService.cs:66-86`
- `CardGameStore/Controllers/ReservationController.cs:662-666` (GET que também reconcilia)
- `CardGameStore/Data/AppDbContext.cs:55` (sem índice único em `ExternalTransactions`)

**Problema:** Todas as guardas de idempotência são *check-then-act* em snapshots isolados: `if (pix.PagoEm is not null) return`, a releitura de status da comanda, `crediario.Status == Pago`, e o `AnyAsync(x => x.Source == "inter" && x.ExternalId == pix.TxId)`. O robô (escopo próprio por cobrança), o `…/pix/verificar` da tela e o `GET …/pix` (que reconcilia em leitura!) podem executar **concorrentemente** para a mesma cobrança, cada um com seu `DbContext`. Dois fluxos vendo `PagoEm == null` ao mesmo tempo:
- **Comanda:** ambos leem status `Aberta` e chamam `CloseComandaAsync` — o comentário em `:100-101` admite que o método não valida status; fechar duas vezes **duplica pontos de fidelidade e notificações**.
- **Crediário:** ambos leem o mesmo `SaldoRestanteEmCentavos`, ambos inserem `PagamentoCrediario` e incrementam `ValorPagoEmCentavos` — **pagamento registrado em dobro**.
- **Reserva:** ambos passam no `AnyAsync` e inserem duas linhas idênticas em `ExternalTransactions` — não existe índice único em `(source, external_id)` (verificado: os únicos índices únicos são users email/cpf, categories name, products barcode, naturezas padrão, notas fiscais chave, championship participants, pix txid).

**Impacto:** Integridade financeira: receita duplicada no financeiro, crediário quitado com valor a maior, pontos de fidelidade em dobro. Janela de corrida real: o robô roda a cada 5 min e a tela faz polling de verificação com o cliente olhando o QR.

**Recomendação:** Tornar o "claim" da baixa atômico no banco antes de qualquer efeito:
```csharp
var claimed = await _db.PixCobrancas
    .Where(p => p.Id == pix.Id && p.PagoEm == null)
    .ExecuteUpdateAsync(s => s.SetProperty(p => p.PagoEm, DateTime.UtcNow));
if (claimed == 0) return /* já baixada por outro fluxo */;
```
E criar índice único `HasIndex(x => new { x.Source, x.ExternalId }).IsUnique().HasFilter("external_id IS NOT NULL")` em `ExternalTransaction` como segunda linha de defesa.

## A2. Cancelamento de reserva não é transacional — devolução de estoque em dobro e corrida com homologação

**Arquivo:** `CardGameStore/Controllers/ReservationController.cs:349-390` (`DevolverEstoqueAsync` + `Cancel`), `:448-489` (`UpdateStatus`), `:494-554` (`Homologar`)

**Problema:** O diff corrigiu exatamente esta classe de bug na **criação** (`CriarEPersistirAsync:120-153`, com execution strategy + transação), mas deixou os caminhos de **saída** sem a mesma proteção:
1. `Cancel` faz `DevolverEstoqueAsync` (ExecuteUpdate, auto-commit fora de transação) e **depois** `SaveChangesAsync` do status. Se o SaveChanges falhar, o estoque voltou mas a reserva continua `"active"` → um segundo cancel devolve o estoque **de novo**.
2. Duas requisições simultâneas (cliente cancelando + admin cancelando/homologando, ou double-click) passam na guarda `Status is "active" or "waiting"` lida antes de qualquer escrita — ambas devolvem estoque.
3. Corrida `Cancel` × `Homologar`: cancel lê `active`, homologar grava `fulfilled` + registra venda, cancel devolve estoque e grava `cancelled` — **venda registrada e estoque devolvido**, ou seja, o item "volta" para a loja tendo sido vendido.

**Impacto:** Estoque inflado silenciosamente (venda de item inexistente) ou venda sem lastro de estoque — o mesmo incidente de "estoque some" que o commit `9e2b3fb` corrigiu, agora no sentido inverso.

**Recomendação:** Envolver devolução + mudança de status na mesma transação dentro da execution strategy (padrão já usado em `CriarEPersistirAsync`), e fazer a transição de status de forma condicional/atômica — `UPDATE product_reservations SET status='cancelled' … WHERE id=@id AND status IN ('active','waiting')` — abortando a devolução se 0 linhas forem afetadas. Aplicar o mesmo claim em `Homologar`.

## A3. `ProcessarChegadaFilaAsync`: decremento atômico + SaveChanges soltos (sem transação), ignora `VariantId` e tem corrida de dupla conversão

**Arquivo:** `CardGameStore/Services/Implementations/ProductService.cs` (~linhas 140-200, alterado neste diff)

**Problema:** Três defeitos no método que converte fila em pré-venda:
1. **Sem transação:** o `ExecuteUpdateAsync` de decremento (auto-commit) acontece antes do `SaveChangesAsync` que marca `Kind/Status`. Crash ou falha entre os dois = estoque some e a fila não converte — *a mesma classe de bug que o diff corrigiu no controller*.
2. **Variantes ignoradas:** a fila pode ter `VariantId` (criada em `CriarItemAsync`, `ReservationController.cs:339-345`), mas a conversão decrementa sempre `Products.StockQuantity` — nunca `ProductVariants.StockQuantity`. Para produto com grade, o estoque da variante fica intacto e o do produto-pai (que pode nem ser usado nesse fluxo) é baixado: **divergência permanente de estoque**.
3. **Corrida de dupla conversão:** o método é chamado tanto pelo restock manual (`UpdateAsync`, `:120-128`) quanto por `ProcessarFilaSeguroAsync` (`ReservationController.cs:392-400`) após cancelamentos. Duas execuções concorrentes carregam a mesma fila `waiting` em memória; a guarda de status **não faz parte do update atômico** (o decremento é atômico no estoque, não na reserva) — com estoque suficiente, a mesma reserva é decrementada duas vezes.

**Impacto:** Estoque de grade errado, estoque negativo lógico, cliente convertido sem unidade reservada.

**Recomendação:** Inverter a ordem e "clamar" a reserva atomicamente antes de baixar estoque (`UPDATE product_reservations SET kind='pre_venda', status='active' WHERE id=@id AND status='waiting'` → só decrementa se 1 linha), direcionar o decremento para `ProductVariants` quando `VariantId` não for nulo, e envolver tudo em transação dentro da execution strategy.

## A4. Cobrança Pix da reserva não é vinculada aos itens: baixa "paga" itens que não estavam na cobrança e cobra itens já cancelados

**Arquivos:**
- `CardGameStore/Controllers/ReservationController.cs:563-617` (`GerarPixReserva`)
- `CardGameStore/Services/Implementations/PixReconciliationService.cs:172-202` (`BaixarReservaAsync`)

**Problema:** A cobrança é gerada somando as pré-vendas **do momento** (`:586`), mas a baixa limpa `ExpiresAt` de **todos** os itens `pre_venda/active` do grupo naquele instante (`:178-181`). Como o grupo não é congelado:
1. Carrinho com item A (pré-venda) + item B (fila, via `AllowFilaFallback=true`). Pix gerado só com o valor de A. O estoque de B chega, B vira `pre_venda/active` **no mesmo grupo**. Cliente paga o Pix de A → `BaixarReservaAsync` marca **A e B como pagos** — B nunca foi cobrado.
2. Cliente gera o Pix (A+C) e depois cancela C (o endpoint `Cancel` não verifica se há cobrança ativa no grupo). O código copia-e-cola continua valendo A+C; ao pagar, o cliente é cobrado por um item cancelado e o financeiro lança o valor cheio.

**Impacto:** Item dado de graça (estoque baixado + marcado pago sem receita) ou cobrança a maior de cliente — ambos com divergência no `ExternalTransactions`.

**Recomendação:** Persistir o snapshot dos itens cobrados (ex.: tabela de junção `PixCobrancaItens` ou `ReservationIds` na cobrança) e limitar a baixa a eles; invalidar/recusar cobrança ATIVA quando a composição do grupo mudar (item cancelado ou fila convertida); bloquear `Cancel` de item com cobrança ATIVA no grupo (ou cancelar a cobrança junto).

## A5. `VendaAvulsaService.RegisterAsync` e `ComandaService` sem transação — baixa parcial de estoque sem venda

**Arquivos:**
- `CardGameStore/Services/Implementations/VendaAvulsaService.cs:55-135` (alterado neste diff — evento SignalR)
- `CardGameStore/Services/Implementations/ComandaService.cs:930-985`

**Problema:** Verificado: não existe `BeginTransaction`/`CreateExecutionStrategy` em **nenhum** desses serviços. Em `RegisterAsync`, o primeiro loop *lê* o estoque (validação não atômica) e o segundo loop faz os decrementos atômicos item a item — entre a leitura e o decremento, outra venda pode tomar o estoque; se o item N falha, os N−1 anteriores **já foram commitados** e não há venda registrada. Agravante: o decremento no PostgreSQL e o insert da venda no MongoDB são inerentemente não atômicos entre si — falha no Mongo após a baixa deixa estoque sem lastro.

**Impacto:** Baixa parcial de estoque sem venda correspondente (vazamento silencioso), sob carga de PDV simultâneo.

**Recomendação:** Envolver os decrementos + persistência relacional em transação única na execution strategy (mesmo padrão do carrinho atômico), e tratar a escrita no Mongo com compensação (retry/outbox ou reverter decrementos em catch).

---

# 🟡 MÉDIO

## M1. Geração de cobrança Pix sem idempotência nem limite — múltiplas cobranças ativas pelo mesmo valor

**Arquivos:** `ReservationController.cs:563-617`; `CardGameStore/Services/Implementations/InterSyncService.cs:144-170`; `frontend/components/PixReservaModal.tsx:29-46`

**Problema:** Cada chamada a `GerarPixReserva` cria uma cobrança nova no PSP (`txid = Guid.NewGuid()` — não há reutilização de cobrança ATIVA do grupo). O modal gera uma nova sempre que a ATIVA existente não tiver `pixCopiaCola`. Não há rate limit específico (cai no global de 300 req/min). Se o cliente pagar duas cobranças diferentes (QR antigo + novo), o robô baixa **as duas**: para reserva, o dedup por txid não protege (txids distintos) → duas receitas em `ExternalTransactions`; para crediário, dois `PagamentoCrediario` (limitados apenas pelo `Math.Min` com o saldo).

**Recomendação:** Reutilizar a cobrança ATIVA existente do grupo/origem (só gerar nova se expirada/removida); índice único parcial garantindo 1 cobrança ATIVA por `(origem, grupo)`; rate limit `auth`-like nos endpoints de geração de cobrança.

## M2. Sem nenhum TTL, pré-vendas impagas prendem estoque indefinidamente (incluindo legadas)

**Arquivos:** `ReservationController.cs:316-326`; `ProductReservation.cs:71-77`; remoção do `PreVendaExpiryBackgroundService` (`Program.cs:364-368`)

**Problema:** A remoção do timer de expiração foi decisão de negócio (admin cancela manualmente), mas não ficou **nenhuma** higiene: reservas criadas antes do deploy com `ExpiresAt` no passado e novas reservas de clientes que somem ficam `"active"` para sempre, com o estoque bloqueado, exibidas como "Aguardando pagamento". Não há relatório, alerta ou auto-cancel.

**Recomendação:** Job leve de higiene (não de expiração cega): listar/auto-sinalizar pré-vendas paradas > N dias sem Pix pago, com ação de cancelamento em lote pelo admin; ou reintroduzir expiração somente para reservas sem cobrança Pix gerada.

## M3. Pix da reserva cobra preço cheio enquanto o site exibe preço promocional

**Arquivos:** `ReservationController.cs:586` vs `frontend/app/produtos/[id]/page.tsx` (`precoUnit` = `discountPriceInReais ?? priceInReais`) e `VendaAvulsaService.cs:110` (`IsOnPromo ? DiscountPriceInCents : PriceInCents`)

**Problema:** `GerarPixReserva` soma `(r.Variant?.PriceInCents ?? r.Product.PriceInCents) * r.Quantity` — ignora `IsOnPromo`/`DiscountPriceInCents`. O carrinho e o botão de reserva mostram o preço promocional; a cobrança Pix vem com o preço cheio. PDV e comanda usam o promocional corretamente — só o Pix da reserva diverge.

**Impacto:** Cliente cobrado a maior que o anunciado — reclamação, chargeback e divergência com o valor esperado no financeiro.

**Recomendação:** Replicar a regra de preço efetivo usada em `VendaAvulsaService`/`ComandaService` (promo do produto, depois override da variante) no cálculo da cobrança.

## M4. Cancelamento de pré-venda já paga devolve estoque sem nenhum estorno

**Arquivo:** `ReservationController.cs:362-390`

**Problema:** `Cancel` não distingue pré-venda paga (`ExpiresAt == null`, dinheiro já recebido e lançado no financeiro) de não paga: devolve o estoque, marca `cancelled` e segue. Não há registro de estorno, crédito para o cliente nem bloqueio. Com o Pix da reserva agora no fluxo (self-service pelo perfil), o cenário "pagou e cancelou" fica a um clique do cliente.

**Recomendação:** Para pré-venda paga: bloquear o cancel self-service (exigir admin) e/ou gerar registro de estorno pendente + crédito na conta do cliente, com auditoria.

## M5. `backup-drive.sh`: retenção remota sem filtro de padrão e remote não validado como `crypt`

**Arquivo:** `deploy/backup-drive.sh:66-67, 123-132`

**Problema:**
1. A pré-checagem valida apenas que o remote **existe** (`rclone listremotes | grep`), não que ele é do tipo `crypt`. Se `BACKUP_REMOTE` apontar para um remote não criptografado (misconfig), o script sobe `deploy/.env`, `.env` raiz (ENCRYPTION_KEY, senhas) e os certificados mTLS do Inter **em claro** para o Drive — exatamente os segredos que o design promete proteger.
2. `rclone delete "$REMOTE" --min-age 30d` (linha 132) não usa os `--include` do copy: apaga **qualquer** arquivo com mais de 30 dias na pasta do Drive, inclusive algo que alguém tenha colocado lá manualmente.

**Recomendação:** Validar o tipo do remote (`rclone config show "$REMOTE_NAME" | grep -q 'type = crypt'` ou `rclone backend features`) antes de subir; aplicar os mesmos `--include "postgres_*.sql.gz"` / `mongo_*.archive.gz` / `extras_*.tar.gz` no `rclone delete` (ou usar `rclone cleanup`/retention por prefixo).

## M6. Token de reset de senha armazenado em claro no banco

**Arquivo:** `CardGameStore/Services/Implementations/AuthService.cs:341-351`

**Problema:** O token de 32 bytes (bem gerado, via `RandomNumberGenerator`, expira em 2h) é persistido em texto puro em `PasswordResetToken`. Um vazamento de leitura do banco (backup, dump, SQLi futuro) permite takeover de qualquer conta dentro da janela de 2h. O fluxo em si está bom: anti-enumeração com timing equalization (`:327-338`), invalidação de refresh token no reset (`:365-366`).

**Recomendação:** Persistir apenas o hash (SHA-256) do token e comparar hash-com-hash na validação.

## M7. `stopHub()` derruba a conexão SignalR singleton compartilhada por outras telas

**Arquivos:** `frontend/lib/signalr.ts` (`connection` módulo-global); `frontend/app/admin/estoque/page.tsx:826-843` (novo); mesmo padrão em `admin/dashboard/page.tsx:1661` e `cliente/page.tsx:479`

**Problema:** O hub é um singleton de módulo. O cleanup da tela de estoque chama `stopHub()`, que para a conexão e zera a referência — mesmo que outro componente ainda montado (dashboard, área do cliente) esteja usando a mesma conexão. O diff replica um padrão pré-existente, mas a nova tela de estoque aumenta a frequência do cenário (admin alternando entre abas/telas admin).

**Recomendação:** Contagem de referência no `signalr.ts` (`startHub` incrementa, `stopHub` decrementa e só para quando chega a 0) ou nunca parar a conexão no unmount de páginas.

## M8. Hub adiciona ao grupo Admin apenas `role == "Admin"` — Operators não recebem `StockChanged`

**Arquivos:** `CardGameStore/Hubs/ComandaHub.cs:45-55`; `CardGameStore/Program.cs:155` (`AdminOnly` = Admin **+ Operator**)

**Problema:** A policy `AdminOnly` permite Admin e Operator, e a tela de estoque é acessível a operadores, mas `OnConnectedAsync` só adiciona ao `AdminGroup` quem tem role exatamente `"Admin"`. Operadores com a tela de estoque aberta não recebem `StockChanged` (nem os eventos de comanda, pré-existente).

**Recomendação:** `if (role is "Admin" or "Operator")` — alinhando o grupo do hub à policy.

## M9. Corrida de dois admins homologando a mesma pré-venda → venda registrada em dobro

**Arquivo:** `ReservationController.cs:494-554`

**Problema:** `Homologar` lê `Status == "active"` e só grava `fulfilled` ao final, após chamar `RegisterAsync`/`AdminAddItemAsync`. Duas requisições concorrentes passam na guarda e registram **duas vendas** (PDV) para a mesma unidade reservada. O `SkipStockDecrement` evita baixa dupla de estoque, mas duplica receita, NFC-e e pontos.

**Recomendação:** Claim atômico de status (`UPDATE … SET status='fulfilled' WHERE id=@id AND status='active'`) **antes** de registrar a venda, abortando se 0 linhas.

## M10. N+1 queries na listagem de reservas

**Arquivo:** `ReservationController.cs:86-91` (`GetMine`), `:431-435` (`GetAll`)

**Problema:** Um `CountAsync` por item para calcular posição na fila — com `pageSize` até 200, são até 200 queries extras por página admin. Calculável em uma query única com `GROUP BY`/`ROW_NUMBER` ou um único fetch das filas `waiting` relevantes ordenadas.

---

# 🔵 BAIXO

| # | Achado | Arquivo:linha | Recomendação |
|---|---|---|---|
| B1 | Comentários/documentação mortos citando a "verificação final da expiração de pré-vendas", que não existe mais | `Program.cs:364-368`; `IPixReconciliationService.cs:2-6,18`; `PixReconciliationService.cs:1-8`; `ComandaController.cs:388-390`; `ReservationController.cs:637-638` | Atualizar os comentários para o modelo real (sem expiração) |
| B2 | Copy de UI defasada mencionando expiração/48h | `frontend/app/produtos/[id]/page.tsx` ("…na retirada em até 48h."); `frontend/app/admin/reservas/page.tsx` (NovaPreVendaModal: "Regra de expiração normal.") | Ajustar textos ao modelo sem expiração |
| B3 | `ExpiresAt = DateTime.UtcNow` usado como sentinela "não pago" — semântica confusa num campo de data de expiração | `ReservationController.cs:325`; `ProductService.cs` (`r.ExpiresAt = DateTime.UtcNow`) | Campo dedicado (`PagoEm`/`StatusPagamento`) ou renomear a semântica com migração |
| B4 | `CreateCart` retorna 400 para erros de item enquanto `Create` mapeia `conflict`→409 — contrato inconsistente | `ReservationController.cs:188-192` vs `:135-140` | Uniformizar códigos de erro |
| B5 | Background service sem `CancellationToken` nas queries EF — shutdown pode esperar ciclo longo | `PixReconciliationBackgroundService.cs:57-86` | Propagar `ct` para `ToListAsync`/`FindAsync` e no loop |
| B6 | TOCTOU na verificação "já está na fila" — double-submit cria duas entradas | `ReservationController.cs:333-337` | Índice único parcial `(user_id, product_id, variant_id) WHERE kind='fila' AND status='waiting'` |
| B7 | `AdminCreate`/fila sem teto de quantidade no backend (frontend limita a 10, backend aceita qualquer `int`) | `ReservationController.cs:240-246, 329-345` | `[Range(1, 99)]` ou clamp server-side |
| B8 | GET com efeito colateral: `GET …/pix` reconcilia e pode fechar comanda/baixar crediário | `ReservationController.cs:646-669`; `CrediariosController.cs:503-504` | Manter por pragmatismo, mas documentar; idealmente só o POST verificar teria efeito |
| B9 | `CompleteProfile` não confirma posse do e-mail — typo trava a conta (reset vai para o e-mail errado) | `AuthService.cs:256-279`; `frontend/components/CompleteProfileGuard.tsx` | E-mail de confirmação ou, no mínimo, campo "confirme o e-mail" na UI |

---

# Código morto — verificações executadas (com evidência)

Verificado via `git grep` em todo o repo (backend, frontend, tests, deploy, DI no `Program.cs`):

| Item | Status | Evidência |
|---|---|---|
| `PreVendaExpiryBackgroundService` | ✅ **Removido corretamente.** Única referência restante é o teste de regressão que garante que o tipo não existe mais (`tests/.../ReservationControllerTests.cs:245-250`) — intencional, manter | `git grep PreVendaExpiry` → só o teste |
| Referências à "expiração/verificação dupla" em comentários | ⚠️ **Mortas** (ver B1) — 5 locais citam um fluxo que não existe mais | `Program.cs:366`, `IPixReconciliationService.cs`, `PixReconciliationService.cs`, `ComandaController.cs:389`, `ReservationController.cs:637` |
| Endpoint `…/extend` (+48h) | ✅ **Limpo** — removido do backend e do `frontend/lib/api.ts` (`reservationApi.extend` e `handleExtend` também sumiram da página admin) | `git grep extend` → só comentário Pokémon |
| `IsExpired` ([NotMapped]) e `isExpired` nos DTOs/tipos | ✅ **Limpo** — removido do modelo, do `ToDto` e dos tipos TS; ocorrências restantes são `profile.pointsExpired` (pontos de fidelidade, não relacionado) | `git grep isExpired` |
| `IPixReconciliationService` | ✅ **Não é código morto** — o único método `ReconciliarAsync` é chamado por 4 controllers (Reservation ×2, Comanda, Crediarios, Championship) e pelo robô. A hipótese de "métodos declarados e nunca chamados" **não se confirma** | `git grep ReconciliarAsync` |
| `PixReservaModal`, `CompleteProfileGuard` | ✅ Referenciados (reservas admin, perfil, carrinho; `app/cliente/layout.tsx`) | `git grep` |
| `timeUntil` / `progressPct` (admin reservas) | ✅ Removidos junto com seus usos | diff |
| `ProductReservation.ExpiresAt` | ⚠️ **Não morto, mas ressignificado** — virou sentinela "não pago" (B3); campo mantido sem migration nova (mudança foi só de comentários + remoção do `[NotMapped] IsExpired`) | diff do modelo |
| `gen-test-token.cs`, `test-emissao-sefaz.cs`, `test-sefaz.cs` (untracked, raiz) | 🗑️ **Lixo de dev a remover** — `gen-test-token.cs` é o achado C1 (forja token Admin). Os dois de SEFAZ não contêm segredos hardcoded, mas executam emissão real contra homologação se rodados na VPS; não pertencem à raiz do repo | `git status` |
| `using` desnecessários | Nenhum óbvio introduzido pelo diff (usings novos — SignalR em `VendaAvulsaService`, `CardGameStore.Hubs` — são usados) | leitura |

---

# Pontos positivos (vale registrar)

1. **Carrinho atômico é realmente transacional:** `CriarEPersistirAsync`/`CreateCart` (`ReservationController.cs:120-233`) usam `CreateExecutionStrategy` + `BeginTransactionAsync` corretamente, com rollback devolvendo estoque — inclui o fix correto do Npgsql retry (transação manual dentro da strategy), replicado também em `FiscalController.cs:191-258`.
2. **Decremento de estoque anti-corrida** com `ExecuteUpdateAsync … WHERE StockQuantity >= qty` em todos os caminhos de baixa.
3. **Reset de senha sem user enumeration** + timing equalization + invalidação de refresh tokens (`AuthService.cs:327-368`); frontend atualizado com a mesma mensagem neutra.
4. **Centralização da baixa Pix** num único serviço usado por tela, robô e controllers — elimina a divergência de 4 implementações duplicadas (o problema é a falta de claim atômico, ver A1, não o desenho).
5. **Robô bem comportado:** escopo por cobrança, erro em uma não derruba as demais, janela de 24h coerente com a expiração de 1h da cobrança, re-leitura de status antes de consultar o PSP.
6. **Segurança de borda sólida:** rate limiting global + `auth` (5/min) usando `CF-Connecting-IP`, CORS por config com credenciais (sem wildcard), JWT via cookie HttpOnly com `ClockSkew = Zero`, autorização `AdminOnly` presente em todos os endpoints admin novos/alterados (verificado em Reservation, Crediarios, User, Fiscal).
7. **SQL injection:** nenhuma ocorrência — tudo via EF Core/LINQ parametrizado ou `ExecuteUpdateAsync` fortemente tipado.
8. **Testes novos com boa cobertura:** 9 facts para `PixReconciliationService` (incl. idempotência por `PagoEm` e dedup de `ExternalTransaction` em fluxo sequencial) e 6 facts para reservas, incluindo o teste de regressão da remoção do serviço de expiração. Os testes de concorrência (A1/A2/A3) são justamente os que faltam.
9. **Auditoria da reserva manual** (`CriouReservaManual`) com payload estruturado — bom rastro para movimentação de estoque em nome de terceiro.

---

# Prioridades de refinamento (ordem sugerida de ataque)

1. **(C1) Segredos:** deletar os 3 scripts soltos da raiz; fail-fast no boot se `SecretKey` for o placeholder; confirmar/rotacionar a chave na VPS.
2. **(A1) Idempotência Pix:** claim atômico `UPDATE pix_cobrancas SET pago_em WHERE pago_em IS NULL` antes de qualquer efeito + índice único `(source, external_id)` em `ExternalTransactions`.
3. **(A2/A3) Transações de saída:** mesmo padrão do carrinho atômico em `Cancel`, `UpdateStatus`, `Homologar` e `ProcessarChegadaFilaAsync`, com transição de status condicional (`WHERE status=…`) como claim.
4. **(A3) Variantes na fila:** direcionar decremento para `ProductVariants` quando `VariantId` não for nulo na conversão fila→pré-venda.
5. **(A4/M1) Vínculo cobrança↔itens:** snapshot dos itens na cobrança, reutilização de cobrança ATIVA, invalidação ao mudar o grupo, bloqueio de cancel com Pix ativo.
6. **(M3) Preço promocional no Pix da reserva** — alinhar com a regra de preço efetivo do PDV.
7. **(M4) Fluxo de estorno** para pré-venda paga cancelada (bloqueio self-service + registro de estorno/crédito).
8. **(M5) Hardening do backup:** validar remote `crypt` antes do upload e aplicar filtros na retenção remota.
9. **(M2) Higiene de reservas paradas:** relatório/alerta de pré-vendas > N dias sem pagamento (substitui o "seguro" que o timer de expiração dava).
10. **(M6-M10, B1-B9) Pacote de baixo risco:** hash do token de reset, N+1, refcount do hub SignalR, grupo Operator no hub, atualização de comentários/copies mortos, limites de quantidade server-side.

---

*Auditoria executada de forma READ-ONLY sobre `main @ 51899cf`. Nenhum arquivo de código foi modificado; este relatório é o único artefato gerado.*
