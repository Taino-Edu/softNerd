-- =============================================================================
-- Teste das procedures, funções e triggers (PIM IV, etapa 7)
--
-- Roda contra um Postgres que JÁ teve o postgres.sql aplicado (a API subiu uma vez).
-- Tudo acontece numa transação que termina em ROLLBACK: não deixa dado nenhum.
-- Uso:  psql -v ON_ERROR_STOP=1 -f tests/sql/procedures-triggers.sql
-- Falhou uma afirmação (ASSERT) = psql sai com erro e o CI fica vermelho.
-- =============================================================================
BEGIN;

DO $teste$
DECLARE
    v_user      uuid;
    v_prod      uuid := gen_random_uuid();
    v_var       uuid := gen_random_uuid();
    v_antes     timestamptz;
    v_qtd       integer;
    v_linha     record;
    v_msg       text;
BEGIN
    SELECT id INTO v_user FROM users LIMIT 1;
    ASSERT v_user IS NOT NULL, 'precisa de pelo menos um usuário (a API cria o admin no startup)';

    -- ── Trigger: updated_at automático ────────────────────────────────────────────────
    INSERT INTO products (id, name, category, cost_price_in_cents, price_in_cents, stock_quantity, minimum_stock,
                          image_urls, is_active, is_featured, show_on_site, show_on_marketplace, is_pre_venda, has_variants,
                          created_at, updated_at)
    VALUES (v_prod, 'Produto de teste SQL', 'Teste', 100, 200, 10, 5, ARRAY[]::text[], true, false, true, false, false, false,
            '2000-01-01', '2000-01-01');
    UPDATE products SET name = 'Produto de teste SQL (editado)' WHERE id = v_prod;
    SELECT updated_at INTO v_antes FROM products WHERE id = v_prod;
    ASSERT v_antes > '2020-01-01', format('updated_at deveria ter sido carimbado pelo trigger, ficou %s', v_antes);
    RAISE NOTICE 'OK trigger updated_at';

    -- ── Trigger: auditoria de estoque ─────────────────────────────────────────────────
    SELECT count(*) INTO v_qtd FROM estoque_movimentos WHERE product_id = v_prod;
    ASSERT v_qtd = 0, 'mudar só o nome não pode gerar movimento de estoque';

    UPDATE products SET stock_quantity = 7 WHERE id = v_prod;
    SELECT * INTO v_linha FROM estoque_movimentos WHERE product_id = v_prod AND variant_id IS NULL;
    ASSERT v_linha.estoque_antes = 10 AND v_linha.estoque_depois = 7 AND v_linha.delta = -3 AND v_linha.origem = 'products',
           format('movimento do produto errado: %s', v_linha);

    UPDATE products SET stock_quantity = 7 WHERE id = v_prod;   -- mesmo valor: não registra
    SELECT count(*) INTO v_qtd FROM estoque_movimentos WHERE product_id = v_prod;
    ASSERT v_qtd = 1, 'atualizar o estoque com o mesmo valor não pode gerar movimento';

    INSERT INTO product_variants (id, product_id, size, stock_quantity, created_at, updated_at)
    VALUES (v_var, v_prod, 'M', 4, NOW(), NOW());
    UPDATE product_variants SET stock_quantity = 1 WHERE id = v_var;
    SELECT * INTO v_linha FROM estoque_movimentos WHERE variant_id = v_var;
    ASSERT v_linha.product_id = v_prod AND v_linha.delta = -3 AND v_linha.origem = 'product_variants',
           format('movimento da variante errado: %s', v_linha);
    RAISE NOTICE 'OK trigger auditoria de estoque';

    -- ── Função: estoque baixo ─────────────────────────────────────────────────────────
    ASSERT EXISTS (SELECT 1 FROM fn_estoque_baixo() WHERE product_id = v_prod AND estoque = 7 AND minimo = 5) IS FALSE,
           'estoque 7 com mínimo 5 não é baixo';
    UPDATE products SET stock_quantity = 2 WHERE id = v_prod;
    SELECT * INTO v_linha FROM fn_estoque_baixo() WHERE product_id = v_prod;
    ASSERT v_linha.estoque = 2 AND v_linha.minimo = 5 AND v_linha.faltam = 3, format('estoque baixo errado: %s', v_linha);
    UPDATE products SET is_active = false WHERE id = v_prod;
    ASSERT NOT EXISTS (SELECT 1 FROM fn_estoque_baixo() WHERE product_id = v_prod), 'produto inativo não entra no estoque baixo';
    RAISE NOTICE 'OK fn_estoque_baixo';

    -- ── Função: fechamento de comandas (dia 15/06/2021, fuso de Brasília) ──────────────
    INSERT INTO comandas (id, user_id, status, opened_at, closed_at, payment_method, second_payment_method,
                          second_payment_amount_in_cents, total_in_cents, points_applied, discount_in_cents) VALUES
      (gen_random_uuid(), v_user, 'Fechada',   '2021-06-15 10:00-03', '2021-06-15 12:00-03', 'Pix',      NULL,  0,    10000, 0, 0),
      (gen_random_uuid(), v_user, 'Fechada',   '2021-06-15 11:00-03', '2021-06-15 13:00-03', 'Dinheiro', 'Pix', 2000,  5000,  0, 0),
      (gen_random_uuid(), v_user, 'Estornada', '2021-06-15 11:00-03', '2021-06-15 14:00-03', 'Pix',      NULL,  0,    99999, 0, 0),
      (gen_random_uuid(), v_user, 'Fechada',   '2021-06-16 10:00-03', '2021-06-16 12:00-03', 'Pix',      NULL,  0,     7777, 0, 0),
      -- 23:30 em Brasília de 15/01 já é 16/01 em UTC: tem que entrar no dia 15, não no 16
      (gen_random_uuid(), v_user, 'Fechada',   '2021-06-15 22:00-03', '2021-06-15 23:30-03', 'Pix',      NULL,  0,     1000, 0, 0);
    SELECT total_centavos, comandas INTO v_linha FROM fn_fechamento_comandas('2021-06-15') WHERE forma_pagamento = 'Pix';
    ASSERT v_linha.total_centavos = 13000 AND v_linha.comandas = 3,
           format('Pix do dia 15: esperava 13000 em 3 comandas (10000 + 2000 da divisão + 1000), veio %s', v_linha);
    SELECT total_centavos, comandas INTO v_linha FROM fn_fechamento_comandas('2021-06-15') WHERE forma_pagamento = 'Dinheiro';
    ASSERT v_linha.total_centavos = 3000 AND v_linha.comandas = 1,
           format('Dinheiro do dia 15: esperava 3000 (5000 - 2000), veio %s', v_linha);
    SELECT count(*) INTO v_qtd FROM fn_fechamento_comandas('2021-06-15');
    ASSERT v_qtd = 2, 'só Pix e Dinheiro no dia 15 (estornada e outro dia ficam de fora)';
    RAISE NOTICE 'OK fn_fechamento_comandas';

    -- ── Função: saldo do crediário ────────────────────────────────────────────────────
    INSERT INTO crediarios (id, user_id, valor_em_centavos, valor_pago_em_centavos, data_abertura, data_vencimento, status, aberto_por_admin_id) VALUES
      (gen_random_uuid(), v_user, 10000, 2500, NOW() - interval '40 days', NOW() - interval '10 days', 'Aberto', v_user),
      (gen_random_uuid(), v_user,  5000, 5000, NOW() - interval '40 days', NOW() - interval '10 days', 'Pago',   v_user);
    SELECT * INTO v_linha FROM fn_saldo_crediario(v_user) WHERE valor_centavos = 10000;
    ASSERT v_linha.saldo_centavos = 7500 AND v_linha.vencido IS TRUE, format('saldo do crediário errado: %s', v_linha);
    ASSERT NOT EXISTS (SELECT 1 FROM fn_saldo_crediario(v_user) WHERE valor_centavos = 5000), 'crediário Pago não aparece no saldo';
    RAISE NOTICE 'OK fn_saldo_crediario';

    -- ── Procedure: manutenção ─────────────────────────────────────────────────────────
    INSERT INTO user_sessions (id, user_id, token_hash, expires_at, created_at, last_used_at) VALUES
      (gen_random_uuid(), v_user, 'teste-sql-velha', NOW() - interval '100 days', NOW() - interval '130 days', NOW() - interval '130 days'),
      (gen_random_uuid(), v_user, 'teste-sql-viva',  NOW() + interval '10 days',  NOW(), NOW());
    INSERT INTO estoque_movimentos (product_id, estoque_antes, estoque_depois, origem, quando)
    VALUES (v_prod, 1, 2, 'products', NOW() - interval '800 days');

    CALL pr_manutencao_banco(30, 365);

    ASSERT NOT EXISTS (SELECT 1 FROM user_sessions WHERE token_hash = 'teste-sql-velha'), 'sessão expirada há 100 dias devia ter sido apagada';
    ASSERT EXISTS     (SELECT 1 FROM user_sessions WHERE token_hash = 'teste-sql-viva'),  'sessão viva não pode ser apagada';
    ASSERT NOT EXISTS (SELECT 1 FROM estoque_movimentos WHERE quando < NOW() - interval '700 days'), 'movimento de 800 dias devia ter sido apagado';
    ASSERT EXISTS     (SELECT 1 FROM estoque_movimentos WHERE product_id = v_prod AND quando > NOW() - interval '1 day'), 'movimento recente não pode ser apagado';
    SELECT detalhe INTO v_msg FROM marcos_operacao WHERE chave = 'manutencao-banco';
    ASSERT v_msg LIKE 'sessões removidas: %', format('marco de manutenção ausente ou estranho: %s', v_msg);

    BEGIN
        CALL pr_manutencao_banco(0, 10);
        ASSERT false, 'prazos inválidos deviam dar erro';
    EXCEPTION WHEN raise_exception THEN
        NULL;   -- esperado
    END;
    RAISE NOTICE 'OK pr_manutencao_banco';
    RAISE NOTICE 'TODOS OS TESTES DE PROCEDURES E TRIGGERS PASSARAM';
END
$teste$;

ROLLBACK;
