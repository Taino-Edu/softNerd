-- Reverte as procedures, funções e triggers de CardGameStore/Data/Inicializacao/postgres.sql (PIM IV, etapa 7).
-- Seguro: nenhuma regra de negócio depende deles. Mas atenção: enquanto o postgres.sql da versão atual estiver na API,
-- eles são recriados no próximo startup. Para desligar de vez, remova o bloco do postgres.sql e publique.
-- A tabela estoque_movimentos (histórico) NÃO é apagada aqui; para apagar: DROP TABLE estoque_movimentos;

DO $do$
DECLARE r record;
BEGIN
    FOR r IN SELECT conrelid::regclass::text AS tabela, conname::text AS nome FROM pg_constraint
             WHERE contype = 'c' AND connamespace = 'public'::regnamespace AND conname LIKE 'chk\_%'
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabela, r.nome);
    END LOOP;
END
$do$;
DROP PROCEDURE IF EXISTS pr_conferir_integridade();
DROP PROCEDURE IF EXISTS pr_manutencao_banco(integer, integer);
DROP FUNCTION  IF EXISTS fn_saldo_crediario(uuid);
DROP FUNCTION  IF EXISTS fn_fechamento_comandas(date);
DROP FUNCTION  IF EXISTS fn_estoque_baixo();
DROP TRIGGER   IF EXISTS trg_product_variants_auditar_estoque ON product_variants;
DROP TRIGGER   IF EXISTS trg_products_auditar_estoque ON products;
DROP FUNCTION  IF EXISTS fn_auditar_estoque();

DO $do$
DECLARE r record;
BEGIN
    FOR r IN SELECT event_object_table AS tabela, trigger_name AS nome
             FROM information_schema.triggers
             WHERE trigger_schema = 'public' AND trigger_name LIKE 'trg\_%\_updated\_at'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', r.nome, r.tabela);
    END LOOP;
END
$do$;
DROP FUNCTION IF EXISTS fn_carimbar_updated_at();
