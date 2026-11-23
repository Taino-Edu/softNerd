# Procedures, funções e triggers — PIM IV, etapa 7

Gerado de `pg_trigger`/`pg_proc` do PostgreSQL real por `scripts/gerar-modelo-dados.py`. Tudo é **aditivo**: nenhuma regra de venda, estoque ou crediário depende destes objetos; a aplicação continua funcionando se eles forem removidos.

## Onde está o código

- Criação: bloco "PROCEDURES, FUNÇÕES E TRIGGERS" no fim de `CardGameStore/Data/Inicializacao/postgres.sql` (idempotente: `CREATE OR REPLACE`, `IF NOT EXISTS`).
- Reverter: `scripts/reverter-procedures-triggers.sql` (a tabela `estoque_movimentos` fica, para não perder histórico).
- Testes: `tests/sql/procedures-triggers.sql` (ASSERTs dentro de `BEGIN … ROLLBACK`, roda no CI contra o Postgres real).
- Uso pela API: `RelatoriosBancoController`, rotas `/api/relatorios/banco/*` (somente leitura; a manutenção é só do dono; 501 no SQLite de dev).

## Funções e procedures (6)

| Nome | Tipo | Argumentos | Retorno | O que faz |
|---|---|---|---|---|
| `fn_auditar_estoque` | função | `—` | `trigger` | Função de trigger: grava em `estoque_movimentos` o estoque antes/depois quando `stock_quantity` muda. |
| `fn_carimbar_updated_at` | função | `—` | `trigger` | Função de trigger: coloca `now()` em `updated_at` antes de todo UPDATE. |
| `fn_estoque_baixo` | função | `—` | `TABLE(product_id uuid, nome character varying, categoria character varying, estoque integer, minimo integer, faltam integer)` | Produtos ativos com estoque no mínimo ou abaixo, do mais urgente ao menos. |
| `fn_fechamento_comandas` | função | `p_dia date` | `TABLE(forma_pagamento text, comandas integer, total_centavos bigint)` | Comandas fechadas num dia (calendário de Brasília) por forma de pagamento; ignora estornadas e trata pagamento dividido. |
| `fn_saldo_crediario` | função | `p_user_id uuid DEFAULT NULL::uuid` | `TABLE(crediario_id uuid, user_id uuid, cliente character varying, valor_centavos integer, pago_centavos integer, saldo_centavos integer, vencimento timestamp with time zone, vencido boolean)` | Crediários em aberto com valor, pago, saldo e se já venceram (de um cliente ou de todos). |
| `pr_manutencao_banco` | procedure | `IN p_dias_sessoes integer DEFAULT 30, IN p_dias_movimentos integer DEFAULT 365` | `—` | Procedure: apaga sessões de login mortas e movimentos de estoque antigos; registra o resultado em `marcos_operacao`. |

## Triggers (14)

**`updated_at` automático — 12 triggers** (`BEFORE UPDATE`, função `fn_carimbar_updated_at`), um em cada tabela que tem a coluna:

`announcements`, `card_listings`, `crediario_aviso_config`, `decks`, `external_transactions`, `integration_configs`, `liga_mensal_manual_entries`, `product_variants`, `products`, `site_config`, `timers`, `users`

**Auditoria de estoque:**

| Trigger | Tabela | Definição |
|---|---|---|
| `trg_product_variants_auditar_estoque` | `product_variants` | `trg_product_variants_auditar_estoque AFTER UPDATE OF stock_quantity ON public.product_variants FOR EACH ROW WHEN ((old.stock_quantity IS DISTINCT FROM new.stock_quantity)) EXECUTE FUNCTION fn_auditar_estoque()` |
| `trg_products_auditar_estoque` | `products` | `trg_products_auditar_estoque AFTER UPDATE OF stock_quantity ON public.products FOR EACH ROW WHEN ((old.stock_quantity IS DISTINCT FROM new.stock_quantity)) EXECUTE FUNCTION fn_auditar_estoque()` |

## Decisões

- **Só PostgreSQL.** O SQLite de desenvolvimento não tem PL/pgSQL; por isso o código vive em `postgres.sql` e as rotas respondem 501 no SQLite.
- **Sem chave estrangeira em `estoque_movimentos`:** o histórico precisa sobreviver à exclusão do produto.
- **Trigger só quando o estoque muda de fato** (`WHEN OLD IS DISTINCT FROM NEW`), para não gravar linha à toa.
- **Dia do fechamento** no calendário de Brasília (`America/Sao_Paulo`), como o resto do sistema.
