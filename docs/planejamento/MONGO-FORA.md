# Roteiro: tirar o MongoDB do softNerd

> Escrito em 07/11/2026 para o Codex. Pedido do Taino: um banco só (PostgreSQL), menos infraestrutura
> (backup duplo, healthcheck, container, driver). **Lê tudo antes de mexer.** Tem cliente real em produção.

## O achado que muda o risco

O Mongo **não é só cache de cartas**. Ele guarda **dado financeiro de produção**:

| Coleção / uso | O que é | Risco |
|---|---|---|
| `vendas_avulsas` (`Models/MongoDB/VendaAvulsa.cs`) | **Todas as vendas do PDV** e as vendas geradas ao homologar pedido/reserva do site (itens, total, forma de pagamento, desconto, cliente, origem, estorno) | **Alto.** É o histórico de vendas do Maikon. Alimenta Financeiro, Relatórios, Analytics, "minhas compras" e Pix |
| `CardCache` (`Models/MongoDB/CardCache.cs`, `TcgService`) | Cache de cartas das APIs de TCG | Baixo. Dá pra recriar |

Tabelas do Postgres já apontam pra venda por **string**: `crediario_lancamentos.VendaAvulsaId`,
`product_reservations.VendaAvulsaId`, `pix_cobrancas.VendaAvulsaId`. Isso precisa continuar funcionando.

**Não é "apagar um cache". É migrar o histórico de vendas.** Trate como a mudança grande que é
(CLAUDE.md: "Mudança grande: sempre com volta", chave em `Configuration/Funcionalidades.cs`).

## Inventário (conferido em 07/11 no `main`)

**Código** (arquivos com mais pontos de uso de `vendas_avulsas`/`VendaAvulsa`):
`Services/Implementations/VendaAvulsaService.cs` (79), `PedidoVendaService.cs` (24), `Services/Pedidos/PedidoAndamentoService.cs` (23),
`Controllers/VendaAvulsaController.cs` (16), `RelatoriosController.cs` (12, usa `IMongoCollection<VendaAvulsa>` direto),
`AnalyticsController.cs` (12), `MinhasComprasController.cs`, `UserController.cs`, `GeminiChatService.cs`.
Cache de cartas: `Services/Implementations/TcgService.cs`.
Outros: `Program.cs` (cliente Mongo, `MongoHealthCheck`), `Data/InicializacaoBanco.cs` (`VendaAvulsaService.CorrigirFormasLegadasAsync`),
`Configuration/Settings.cs` (`MongoDbSettings`), `HealthChecks/MongoHealthCheck.cs`.

**Namespace enganoso:** o catálogo de formas de pagamento mora em `Models/PaymentMethod.cs` mas no namespace
`CardGameStore.Models.MongoDB` (~20 arquivos usam). Não tem a ver com o banco. **Renomear pra `CardGameStore.Models` é o
primeiro PR**, mecânico e sem risco.

**Infra / CI:** `deploy/docker-compose.prod.yml` (serviço `mongo`, volume, `MongoDbSettings__*`, `depends_on`), `docker-compose.dev.yml`,
`deploy/backup.sh` e `deploy/backup-drive.sh` (dump `mongo_*.archive.gz`), `deploy/migrate-mongo-auth.sh`,
`.github/workflows/ci.yml` (serviço `mongo:7`), `appsettings*.json`, `CardGameStore.csproj` (`MongoDB.Driver`).
**Testes que tocam Mongo:** `Services/VendaAvulsaServiceTests.cs`, `Services/PixReconciliationServiceTests.cs`.

## Fase A — cache de cartas (decisão do Taino pendente)

O Taino ainda vai decidir o que fazer com o cache ("penso melhor depois"). **Não escolha por ele.** Opções, da mais simples:
1. tabela `card_cache` no Postgres (colunas das buscas + `jsonb` pro resto);
2. `IMemoryCache`/cache em disco, buscando na API do TCG quando faltar;
3. sem cache (mais lento e gasta cota das APIs de TCG).
Pergunte antes de implementar. Pode ficar por último: **a Fase B é a que importa.**

## Fase B — vendas avulsas pro Postgres (com volta)

Ordem obrigatória. **Cada passo é um PR separado**, com CI verde e aprovação do Taino antes do deploy.

0. **PR mecânico:** trocar o namespace `Models.MongoDB` → `Models` nos arquivos do catálogo de pagamento. Zero mudança de comportamento.
1. **Baseline antes de tocar em dados** (script só de leitura, guardar a saída no PR): total de vendas, soma de `TotalInCents`,
   soma por forma de pagamento, soma por mês, quantidade de vendas estornadas (`CanceladaEm != null`), quantidade com `Origem == "Reserva"`.
2. **Tabelas novas** em `Data/Inicializacao/postgres.sql` (e `sqlite.sql`), **idempotentes**: `vendas_avulsas` e `venda_avulsa_itens`
   com todos os campos do model (inclusive estorno, `Origem`, `ReservationId`, `ReservationGroupId`, `ProductIsPreVenda`, `CrediarioId`,
   `UnitCostInCents` do item — o custo é snapshot e alimenta a margem do Financeiro). Coluna **`mongo_id` única** (o ObjectId antigo):
   é ela que torna a cópia idempotente e que mantém válidos os `VendaAvulsaId` string das outras tabelas. Subir a API local no Postgres
   antes de commitar (regra do CLAUDE.md).
3. **Camada de acesso única:** uma interface (ex.: `IVendasAvulsasStore`) com duas implementações, Mongo (a de hoje) e Postgres, escolhidas pela
   chave de funcionalidade `vendas-no-postgres` (**desligada** por padrão; tela `/admin/funcionalidades`). Os controllers e services deixam de
   falar com `IMongoCollection` direto (hoje `RelatoriosController` fala).
4. **Cópia idempotente** Mongo → Postgres (comando de admin, com trava contra rodar em paralelo): `upsert` por `mongo_id`, pode rodar de novo
   sem duplicar. Termina com **relatório de conferência**: mesmas contagens e somas do baseline (passo 1) **+ amostra de 50 vendas comparadas
   campo a campo**. Divergência de 1 centavo = para.
5. **Escrita dupla por 1–2 dias** (escreve nos dois; o Mongo continua sendo a verdade) e um comparador diário. Só passa quando der zero divergência.
6. **Virar a leitura** pro Postgres (ligar a chave). O Mongo continua recebendo escrita (é a volta). Observar um ciclo de fechamento de caixa e o Vigia.
7. **Remover**, só depois de um período de segurança aprovado pelo Taino: parar a escrita no Mongo, tirar `MongoDB.Driver`, `MongoHealthCheck`,
   `MongoDbSettings`, serviço do `docker-compose.prod.yml`/dev/CI, `mongo_*` do `backup.sh`/`backup-drive.sh`, `migrate-mongo-auth.sh`,
   `CorrigirFormasLegadasAsync` e os testes antigos. **Antes de apagar o container: um dump final guardado.**

Com a Fase B pronta e a Fase A resolvida, o Mongo sai por completo.

## Cuidados que já quebraram ou podem quebrar

- **Estorno:** venda não se apaga; `CanceladaEm` filtra o Financeiro inteiro. Perder esse filtro infla a receita.
- **Fuso:** datas "do dia" no calendário de Brasília (CLAUDE.md). O `SoldAt` é UTC; cuidado ao agrupar por dia/mês.
- **Dinheiro:** use `Common.Dinheiro.Brl` em texto; valores seguem em centavos (`int`).
- **Pix/reserva:** `PixReconciliationService` e a homologação de reserva gravam venda e apontam `VendaAvulsaId`; testar esses caminhos.
- **Rota de admin nova** (comando de cópia): prefixo em `Permissao.RotasPrefixo`, senão operador leva 403.
- **CHANGELOG, `docs/planejamento/BACKLOG.md` e `python scripts/gerar-mapa.py`** em cada PR (o CI confere o mapa).

## Quando NÃO mergear

- Contagem ou soma diferente do baseline; qualquer divergência na amostra.
- Fechamento do dia ou Financeiro diferente entre as duas leituras.
- Backup do Mongo e do Postgres feitos antes **não** confirmados.
- Sem aprovação do Taino para o deploy (o deploy abre sozinho e espera ele).

## Prazo

O PIM é entregue em **14/11/2026**. Este trabalho **não pode ficar no caminho crítico**: se os passos 1–6 não estiverem validados até
**11/11**, adiar pra depois da entrega. O texto do trabalho descreve o estado real (PostgreSQL + MongoDB) enquanto isso.
