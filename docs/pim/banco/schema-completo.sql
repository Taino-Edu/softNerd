--
-- PostgreSQL database dump
--

\restrict NXQ8KEbcgFRy35EehQVBaoEvpwy9hfsBpwquiD96fxQXeaSysrOL0zJ8Ud1lIyk

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: fn_auditar_estoque(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_auditar_estoque() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_TABLE_NAME = 'products' THEN
        INSERT INTO estoque_movimentos (product_id, variant_id, estoque_antes, estoque_depois, origem)
        VALUES (NEW.id, NULL, OLD.stock_quantity, NEW.stock_quantity, 'products');
    ELSE
        INSERT INTO estoque_movimentos (product_id, variant_id, estoque_antes, estoque_depois, origem)
        VALUES (NEW.product_id, NEW.id, OLD.stock_quantity, NEW.stock_quantity, 'product_variants');
    END IF;
    RETURN NULL;
END
$$;


--
-- Name: fn_carimbar_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_carimbar_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END
$$;


--
-- Name: fn_estoque_baixo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_estoque_baixo() RETURNS TABLE(product_id uuid, nome character varying, categoria character varying, estoque integer, minimo integer, faltam integer)
    LANGUAGE sql STABLE
    AS $$
    SELECT p.id, p.name, p.category, p.stock_quantity, p.minimum_stock,
           GREATEST(p.minimum_stock - p.stock_quantity, 0)
    FROM products p
    WHERE p.is_active AND p.stock_quantity <= p.minimum_stock
    ORDER BY (p.stock_quantity - p.minimum_stock), p.name
$$;


--
-- Name: fn_fechamento_comandas(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_fechamento_comandas(p_dia date) RETURNS TABLE(forma_pagamento text, comandas integer, total_centavos bigint)
    LANGUAGE sql STABLE
    AS $$
    WITH dia AS (
        SELECT c.id, c.payment_method, c.second_payment_method,
               c.total_in_cents, c.second_payment_amount_in_cents
        FROM comandas c
        WHERE c.status = 'Fechada'
          AND c.estornada_em IS NULL
          AND c.closed_at IS NOT NULL
          AND (c.closed_at AT TIME ZONE 'America/Sao_Paulo')::date = p_dia
    ), partes AS (
        SELECT d.id, COALESCE(d.payment_method, '(sem forma)') AS forma,
               (d.total_in_cents - d.second_payment_amount_in_cents)::bigint AS valor
        FROM dia d
        UNION ALL
        SELECT d.id, d.second_payment_method, d.second_payment_amount_in_cents::bigint
        FROM dia d
        WHERE d.second_payment_method IS NOT NULL AND d.second_payment_amount_in_cents > 0
    )
    SELECT forma::text, COUNT(DISTINCT id)::integer, SUM(valor)::bigint
    FROM partes
    GROUP BY forma
    ORDER BY SUM(valor) DESC, forma
$$;


--
-- Name: fn_saldo_crediario(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_saldo_crediario(p_user_id uuid DEFAULT NULL::uuid) RETURNS TABLE(crediario_id uuid, user_id uuid, cliente character varying, valor_centavos integer, pago_centavos integer, saldo_centavos integer, vencimento timestamp with time zone, vencido boolean)
    LANGUAGE sql STABLE
    AS $$
    SELECT c.id, c.user_id, u.name, c.valor_em_centavos, c.valor_pago_em_centavos,
           c.valor_em_centavos - c.valor_pago_em_centavos,
           c.data_vencimento, c.data_vencimento < NOW()
    FROM crediarios c
    JOIN users u ON u.id = c.user_id
    WHERE c.status = 'Aberto'
      AND (p_user_id IS NULL OR c.user_id = p_user_id)
    ORDER BY c.data_vencimento, u.name
$$;


--
-- Name: pr_conferir_integridade(); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.pr_conferir_integridade()
    LANGUAGE plpgsql
    AS $$
DECLARE
    r            record;
    v_qtd        bigint;
    v_orfaos     bigint := 0;
    v_invalidas  bigint := 0;
    v_detalhes   text[] := ARRAY[]::text[];
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('announcements',              'created_by_admin_id',    'users'),
            ('championship_participants',  'deck_id',                'decks'),
            ('championship_preinscricoes', 'deck_id',                'decks'),
            ('championships',              'created_by_admin_id',    'users'),
            ('comanda_items',              'variant_id',             'product_variants'),
            ('comanda_items',              'added_by_user_id',       'users'),
            ('comandas',                   'estornada_por_admin_id', 'users'),
            ('crediario_avisos',           'enviado_por_admin_id',   'users'),
            ('crediario_lancamentos',      'comanda_id',             'comandas'),
            ('crediarios',                 'aberto_por_admin_id',    'users'),
            ('crediarios',                 'pago_por_admin_id',      'users'),
            ('estoque_movimentos',         'product_id',             'products'),
            ('estoque_movimentos',         'variant_id',             'product_variants'),
            ('funcionalidades',            'alterada_por_id',        'users'),
            ('liga_mensal_manual_entries', 'created_by_admin_id',    'users'),
            ('pagamentos_crediario',       'admin_id',               'users'),
            ('perfis',                     'criado_por_admin_id',    'users'),
            ('pix_cobrancas',              'criado_por_admin_id',    'users'),
            ('timers',                     'championship_id',        'championships'),
            ('torneio_partidas',           'deck_a_id',              'decks'),
            ('torneio_partidas',           'deck_b_id',              'decks'),
            ('torneio_partidas',           'resolvido_por_admin_id', 'users')
        ) AS v(tabela, coluna, alvo)
    LOOP
        EXECUTE format('SELECT count(*) FROM %I f WHERE f.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %I a WHERE a.id = f.%I)',
                       r.tabela, r.coluna, r.alvo, r.coluna) INTO v_qtd;
        IF v_qtd > 0 THEN
            v_orfaos := v_orfaos + v_qtd;
            v_detalhes := v_detalhes || format('%s.%s=%s', r.tabela, r.coluna, v_qtd);
        END IF;
    END LOOP;

    FOR r IN
        SELECT c.conrelid::regclass::text AS tabela, c.conname::text AS nome, pg_get_expr(c.conbin, c.conrelid) AS regra
        FROM pg_constraint c
        WHERE c.contype = 'c' AND c.connamespace = 'public'::regnamespace AND c.conname LIKE 'chk\_%'
    LOOP
        EXECUTE format('SELECT count(*) FROM %s WHERE (%s) IS FALSE', r.tabela, r.regra) INTO v_qtd;
        IF v_qtd > 0 THEN
            v_invalidas := v_invalidas + v_qtd;
            v_detalhes := v_detalhes || format('%s=%s', r.nome, v_qtd);
        END IF;
    END LOOP;

    INSERT INTO marcos_operacao (chave, quando, detalhe)
    VALUES ('conferencia-integridade', NOW(),
            left(format('referências órfãs: %s; linhas fora das regras: %s; %s', v_orfaos, v_invalidas, array_to_string(v_detalhes, ', ')), 500))
    ON CONFLICT (chave) DO UPDATE SET quando = EXCLUDED.quando, detalhe = EXCLUDED.detalhe;
END
$$;


--
-- Name: pr_manutencao_banco(integer, integer); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.pr_manutencao_banco(IN p_dias_sessoes integer DEFAULT 30, IN p_dias_movimentos integer DEFAULT 365)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_sessoes    integer;
    v_movimentos integer;
BEGIN
    IF p_dias_sessoes < 1 OR p_dias_movimentos < 30 THEN
        RAISE EXCEPTION 'Prazos inválidos: sessões >= 1 dia e movimentos >= 30 dias (recebi % e %)', p_dias_sessoes, p_dias_movimentos;
    END IF;

    DELETE FROM user_sessions
    WHERE expires_at < NOW() - make_interval(days => p_dias_sessoes)
       OR (revoked_at IS NOT NULL AND revoked_at < NOW() - make_interval(days => p_dias_sessoes));
    GET DIAGNOSTICS v_sessoes = ROW_COUNT;

    DELETE FROM estoque_movimentos WHERE quando < NOW() - make_interval(days => p_dias_movimentos);
    GET DIAGNOSTICS v_movimentos = ROW_COUNT;

    INSERT INTO marcos_operacao (chave, quando, detalhe)
    VALUES ('manutencao-banco', NOW(),
            format('sessões removidas: %s; movimentos de estoque removidos: %s', v_sessoes, v_movimentos))
    ON CONFLICT (chave) DO UPDATE SET quando = EXCLUDED.quando, detalhe = EXCLUDED.detalhe;
END
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alertas_sistema; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alertas_sistema (
    id uuid NOT NULL,
    codigo character varying(60) NOT NULL,
    chave character varying(200) NOT NULL,
    gravidade character varying(10) NOT NULL,
    titulo character varying(200) NOT NULL,
    detalhe character varying(2000) NOT NULL,
    link character varying(300),
    ocorrencias integer NOT NULL,
    criado_em timestamp with time zone NOT NULL,
    ultima_vez_em timestamp with time zone NOT NULL,
    resolvido_em timestamp with time zone,
    resolvido_por character varying(120)
);


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id uuid NOT NULL,
    title character varying(200) NOT NULL,
    body character varying(2000),
    image_url character varying(500),
    link_url character varying(500),
    type integer NOT NULL,
    is_active boolean NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    created_by_admin_id uuid NOT NULL
);


--
-- Name: app_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_migrations (
    key text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id text NOT NULL,
    actor_user_id text,
    actor_user_name character varying(200),
    action character varying(50) NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id character varying(100),
    details text,
    ip_hash character varying(64) NOT NULL,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: card_listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_listings (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    card_name character varying(200) NOT NULL,
    card_game character varying(100),
    card_image_url character varying(500),
    price_in_cents integer NOT NULL,
    condition character varying(50) NOT NULL,
    description character varying(1000),
    status character varying(20) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: championship_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.championship_participants (
    id uuid NOT NULL,
    championship_id uuid NOT NULL,
    user_id uuid NOT NULL,
    player_number integer NOT NULL,
    deck_name character varying(200),
    deck_id uuid,
    placement integer,
    registered_at timestamp with time zone NOT NULL,
    entry_fee_paid_at timestamp with time zone,
    inscricao_expira_em timestamp with time zone,
    entry_fee_payment_method character varying(20),
    comanda_id uuid,
    check_in_em timestamp with time zone,
    desistiu_na_rodada integer
);


--
-- Name: championship_preinscricoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.championship_preinscricoes (
    id uuid NOT NULL,
    championship_id uuid NOT NULL,
    nome character varying(200) NOT NULL,
    whatsapp character varying(30) NOT NULL,
    deck_id uuid,
    deck_name character varying(200),
    is_lista_espera boolean NOT NULL,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: championships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.championships (
    id uuid NOT NULL,
    name character varying(200) NOT NULL,
    description character varying(1000),
    game character varying(100) NOT NULL,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone,
    registration_deadline timestamp with time zone,
    max_participants integer,
    entry_fee_in_cents integer NOT NULL,
    minutos_para_pagar integer NOT NULL,
    status text NOT NULL,
    formato text NOT NULL,
    modalidade character varying(20) NOT NULL,
    codigo_entrada character varying(8),
    melhor_de integer NOT NULL,
    minutos_rodada integer NOT NULL,
    numero_rodadas integer,
    rodada_atual integer NOT NULL,
    lugares integer NOT NULL,
    image_url character varying(500),
    created_at timestamp with time zone NOT NULL,
    created_by_admin_id uuid NOT NULL,
    podio_json character varying(1000)
);


--
-- Name: comanda_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comanda_items (
    id uuid NOT NULL,
    comanda_id uuid NOT NULL,
    product_id uuid,
    card_cache_id character varying(100),
    variant_id uuid,
    item_name_snapshot character varying(200) NOT NULL,
    unit_price_in_cents integer NOT NULL,
    cost_price_snapshot_in_cents integer NOT NULL,
    quantity integer NOT NULL,
    subtotal_in_cents integer NOT NULL,
    added_at timestamp with time zone NOT NULL,
    added_by_user_id uuid NOT NULL
);


--
-- Name: comandas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comandas (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    table_identifier character varying(50),
    status text NOT NULL,
    opened_at timestamp with time zone NOT NULL,
    closed_at timestamp with time zone,
    payment_method character varying(30),
    second_payment_method character varying(30),
    second_payment_amount_in_cents integer NOT NULL,
    championship_id uuid,
    total_in_cents integer NOT NULL,
    points_applied integer NOT NULL,
    discount_in_cents integer NOT NULL,
    notes character varying(500),
    estornada_em timestamp with time zone,
    estornada_por_admin_id uuid,
    motivo_estorno character varying(300)
);


--
-- Name: cookie_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cookie_consents (
    id text NOT NULL,
    user_id uuid,
    ip_hash character varying(64) NOT NULL,
    user_agent character varying(500) NOT NULL,
    accepted boolean NOT NULL,
    policy_version character varying(10) NOT NULL,
    consent_at timestamp with time zone NOT NULL
);


--
-- Name: crediario_aviso_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crediario_aviso_config (
    id uuid NOT NULL,
    ativo boolean NOT NULL,
    hora_envio integer NOT NULL,
    marcos_json text NOT NULL,
    canal_app boolean NOT NULL,
    canal_email boolean NOT NULL,
    resumo_admin boolean NOT NULL,
    mensagem_extra character varying(300),
    ultimo_resumo_em timestamp with time zone,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: crediario_avisos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crediario_avisos (
    id uuid NOT NULL,
    crediario_id uuid NOT NULL,
    marco integer,
    vencimento_referencia timestamp with time zone NOT NULL,
    canais character varying(60) NOT NULL,
    falhas character varying(500),
    enviado_por_admin_id uuid,
    enviado_em timestamp with time zone NOT NULL
);


--
-- Name: crediario_lancamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crediario_lancamentos (
    id uuid NOT NULL,
    crediario_id uuid NOT NULL,
    origem character varying(20) NOT NULL,
    comanda_id uuid,
    venda_avulsa_id character varying(50),
    valor_em_centavos integer NOT NULL,
    itens_json text,
    descricao character varying(500),
    created_at timestamp with time zone NOT NULL,
    estornado_em timestamp with time zone
);


--
-- Name: crediarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crediarios (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    comanda_id uuid,
    valor_em_centavos integer NOT NULL,
    valor_pago_em_centavos integer NOT NULL,
    data_abertura timestamp with time zone NOT NULL,
    data_vencimento timestamp with time zone NOT NULL,
    data_pagamento timestamp with time zone,
    status text NOT NULL,
    observacao character varying(500),
    aberto_por_admin_id uuid NOT NULL,
    pago_por_admin_id uuid,
    pagamento_token character varying(64),
    itens_json text
);


--
-- Name: decks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.decks (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    game character varying(50) NOT NULL,
    format character varying(20) NOT NULL,
    cards_json text NOT NULL,
    is_public boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: estoque_movimentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estoque_movimentos (
    id bigint NOT NULL,
    product_id uuid NOT NULL,
    variant_id uuid,
    estoque_antes integer NOT NULL,
    estoque_depois integer NOT NULL,
    delta integer GENERATED ALWAYS AS ((estoque_depois - estoque_antes)) STORED,
    origem character varying(20) NOT NULL,
    quando timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: estoque_movimentos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.estoque_movimentos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.estoque_movimentos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: external_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.external_transactions (
    id uuid NOT NULL,
    source character varying(30) NOT NULL,
    external_id character varying(200),
    type character varying(10) NOT NULL,
    amount numeric(10,2) NOT NULL,
    description character varying(500) NOT NULL,
    due_date timestamp with time zone,
    paid_at timestamp with time zone,
    status character varying(20) NOT NULL,
    category character varying(100),
    supplier character varying(200),
    nfe_key character varying(44),
    notes character varying(2000),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: funcionalidades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funcionalidades (
    codigo character varying(60) NOT NULL,
    ligada boolean NOT NULL,
    alterada_em timestamp with time zone NOT NULL,
    alterada_por_id uuid
);


--
-- Name: integration_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_configs (
    id uuid NOT NULL,
    source character varying(30) NOT NULL,
    access_token character varying(2000),
    refresh_token character varying(2000),
    client_id character varying(200),
    client_secret character varying(200),
    expires_at timestamp with time zone,
    is_active boolean NOT NULL,
    cnpj character varying(18),
    pix_key character varying(100),
    last_sync_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: lgpd_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lgpd_requests (
    id text NOT NULL,
    user_id uuid,
    requester_name character varying(200) NOT NULL,
    requester_email character varying(255) NOT NULL,
    requester_cpf character varying(11) NOT NULL,
    request_type character varying(20) NOT NULL,
    description character varying(2000),
    status character varying(15) NOT NULL,
    admin_response character varying(4000),
    created_at timestamp with time zone NOT NULL,
    responded_at timestamp with time zone,
    deadline timestamp with time zone NOT NULL,
    anexo_nome character varying(255),
    anexo_dados bytea
);


--
-- Name: liga_mensal_manual_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.liga_mensal_manual_entries (
    id uuid NOT NULL,
    ano integer NOT NULL,
    mes integer NOT NULL,
    player_name character varying(200) NOT NULL,
    total_points integer NOT NULL,
    decks character varying(500),
    observacao character varying(500),
    created_by_admin_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: listing_interests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_interests (
    id uuid NOT NULL,
    listing_id uuid NOT NULL,
    user_id uuid NOT NULL,
    message character varying(500),
    share_contact boolean NOT NULL,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: marcos_operacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marcos_operacao (
    chave character varying(60) NOT NULL,
    quando timestamp with time zone NOT NULL,
    detalhe character varying(500)
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    title character varying(120) NOT NULL,
    body character varying(500) NOT NULL,
    link character varying(300),
    image_url character varying(500),
    created_at timestamp with time zone NOT NULL,
    read_at timestamp with time zone
);


--
-- Name: pagamentos_crediario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagamentos_crediario (
    id uuid NOT NULL,
    crediario_id uuid NOT NULL,
    valor_em_centavos integer NOT NULL,
    forma_pagamento character varying(50) NOT NULL,
    observacao character varying(500),
    admin_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: perfis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.perfis (
    id uuid NOT NULL,
    nome character varying(100) NOT NULL,
    permissoes_json text NOT NULL,
    criado_por_admin_id uuid NOT NULL,
    criado_em timestamp with time zone NOT NULL,
    atualizado_em timestamp with time zone NOT NULL
);


--
-- Name: pix_cobrancas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pix_cobrancas (
    id uuid NOT NULL,
    origem text NOT NULL,
    crediario_id uuid,
    comanda_id uuid,
    venda_avulsa_id character varying(50),
    championship_participant_id uuid,
    reservation_group_id uuid,
    reservation_item_ids text,
    tx_id character varying(35) NOT NULL,
    valor_em_centavos integer NOT NULL,
    desconto_em_centavos integer,
    status character varying(40) NOT NULL,
    pix_copia_cola text,
    imagem_qrcode text,
    nome_devedor character varying(200),
    crediario_ids_json text,
    criado_por_admin_id uuid NOT NULL,
    criado_em timestamp with time zone NOT NULL,
    expira_em timestamp with time zone,
    pago_em timestamp with time zone
);


--
-- Name: product_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_categories (
    id uuid NOT NULL,
    name character varying(100) NOT NULL,
    emoji character varying(10),
    pix_discount_percent numeric,
    display_order integer NOT NULL,
    is_active boolean NOT NULL,
    parent_category_id uuid,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: product_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_reservations (
    id uuid NOT NULL,
    reservation_group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    product_id uuid NOT NULL,
    variant_id uuid,
    quantity integer NOT NULL,
    kind character varying(20) NOT NULL,
    status character varying(20) NOT NULL,
    notes character varying(500),
    payment_method character varying(20),
    reserved_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone,
    fulfilled_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    unit_price_in_cents integer,
    venda_avulsa_id character varying(80)
);


--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variants (
    id uuid NOT NULL,
    product_id uuid NOT NULL,
    size character varying(50),
    color character varying(100),
    stock_quantity integer NOT NULL,
    price_in_cents integer,
    sku character varying(100),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: product_waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    user_id uuid,
    name character varying(150) NOT NULL,
    whatsapp character varying(20) NOT NULL,
    "position" integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notified_at timestamp with time zone
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid NOT NULL,
    name character varying(200) NOT NULL,
    description character varying(500),
    category character varying(100) NOT NULL,
    barcode character varying(100),
    cost_price_in_cents integer NOT NULL,
    price_in_cents integer NOT NULL,
    stock_quantity integer NOT NULL,
    minimum_stock integer NOT NULL,
    image_url character varying(500),
    image_urls text[] NOT NULL,
    full_description text,
    is_active boolean NOT NULL,
    is_featured boolean NOT NULL,
    show_on_site boolean NOT NULL,
    show_on_marketplace boolean NOT NULL,
    discount_price_in_cents integer,
    is_pre_venda boolean NOT NULL,
    max_installments integer,
    pix_discount_percent numeric,
    has_variants boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    prevenda_release_date date
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    endpoint character varying(600) NOT NULL,
    p256dh character varying(300) NOT NULL,
    auth character varying(150) NOT NULL,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: site_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_config (
    id uuid NOT NULL,
    site_name character varying(100) NOT NULL,
    hero_subtitle character varying(400) NOT NULL,
    address_line character varying(150) NOT NULL,
    contact_person_name character varying(60) NOT NULL,
    logo_url character varying(300),
    favicon_url character varying(300),
    pwa_icon_url character varying(300),
    hero_image_url character varying(300),
    admin_icon_url character varying(300),
    hero_eyebrow character varying(80) NOT NULL,
    aviso_topo character varying(120) NOT NULL,
    whatsapp_number character varying(20) NOT NULL,
    contact_email character varying(150) NOT NULL,
    nav_torneios_label character varying(40) NOT NULL,
    nav_produtos_label character varying(40) NOT NULL,
    nav_mercado_label character varying(40) NOT NULL,
    nav_pontos_label character varying(40) NOT NULL,
    nav_liga_label character varying(40) NOT NULL,
    cta_ver_eventos_label character varying(40) NOT NULL,
    cta_ver_torneios_label character varying(40) NOT NULL,
    cta_ver_produtos_label character varying(40) NOT NULL,
    torneios_eyebrow character varying(60) NOT NULL,
    torneios_title character varying(80) NOT NULL,
    produtos_eyebrow character varying(60) NOT NULL,
    produtos_title character varying(80) NOT NULL,
    pontos_eyebrow character varying(60) NOT NULL,
    pontos_title character varying(80) NOT NULL,
    pontos_paragraph character varying(400) NOT NULL,
    color_primary character varying(9) NOT NULL,
    color_accent character varying(9) NOT NULL,
    color_navy character varying(9) NOT NULL,
    color_hero character varying(9) NOT NULL,
    color_background character varying(9) NOT NULL,
    color_card character varying(9) NOT NULL,
    border_radius_style character varying(20) NOT NULL,
    pix_discount_percent numeric NOT NULL,
    max_installments integer NOT NULL,
    min_installment_in_cents integer NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: timers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timers (
    id uuid NOT NULL,
    name character varying(100) NOT NULL,
    duration_seconds integer NOT NULL,
    paused_remaining integer,
    state integer NOT NULL,
    started_at timestamp with time zone,
    sound_preset character varying(50) NOT NULL,
    warn_at_seconds integer NOT NULL,
    championship_id uuid,
    rodada integer,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: torneio_partidas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.torneio_partidas (
    id uuid NOT NULL,
    rodada_id uuid NOT NULL,
    mesa integer NOT NULL,
    participante_a_id uuid NOT NULL,
    participante_b_id uuid,
    deck_a_id uuid,
    deck_a_nome character varying(200),
    deck_b_id uuid,
    deck_b_nome character varying(200),
    report_a text,
    report_b text,
    resultado text,
    vitorias_a integer NOT NULL,
    vitorias_b integer NOT NULL,
    resolvido_por_admin_id uuid,
    fechada_em timestamp with time zone,
    pronto_a_em timestamp with time zone,
    pronto_b_em timestamp with time zone
);


--
-- Name: torneio_rodadas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.torneio_rodadas (
    id uuid NOT NULL,
    championship_id uuid NOT NULL,
    numero integer NOT NULL,
    status text NOT NULL,
    iniciada_em timestamp with time zone NOT NULL,
    fechada_em timestamp with time zone,
    comecada_em timestamp with time zone
);


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    rotated_at timestamp with time zone,
    revoked_at timestamp with time zone,
    user_agent character varying(300),
    ip_address character varying(45),
    created_at timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    name character varying(150) NOT NULL,
    email character varying(255),
    password_hash text,
    whatsapp character varying(20),
    cpf character varying(11),
    profile_image_url character varying(500),
    pokemon_favorito character varying(45),
    pokemon_favorito_shiny boolean NOT NULL,
    role character varying(20) NOT NULL,
    refresh_token text,
    refresh_token_expiry timestamp with time zone,
    password_reset_token text,
    password_reset_token_expiry timestamp with time zone,
    google_sub character varying(64),
    falhas_login integer NOT NULL,
    login_bloqueado_ate timestamp with time zone,
    points_balance integer NOT NULL,
    points_expires_at timestamp with time zone,
    balance_in_cents integer NOT NULL,
    preferences_json text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    is_active boolean NOT NULL,
    deleted_at timestamp with time zone,
    consent_at timestamp with time zone,
    perfil_id uuid
);


--
-- Name: alertas_sistema PK_alertas_sistema; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alertas_sistema
    ADD CONSTRAINT "PK_alertas_sistema" PRIMARY KEY (id);


--
-- Name: announcements PK_announcements; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT "PK_announcements" PRIMARY KEY (id);


--
-- Name: audit_logs PK_audit_logs; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT "PK_audit_logs" PRIMARY KEY (id);


--
-- Name: card_listings PK_card_listings; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_listings
    ADD CONSTRAINT "PK_card_listings" PRIMARY KEY (id);


--
-- Name: championship_participants PK_championship_participants; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.championship_participants
    ADD CONSTRAINT "PK_championship_participants" PRIMARY KEY (id);


--
-- Name: championship_preinscricoes PK_championship_preinscricoes; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.championship_preinscricoes
    ADD CONSTRAINT "PK_championship_preinscricoes" PRIMARY KEY (id);


--
-- Name: championships PK_championships; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.championships
    ADD CONSTRAINT "PK_championships" PRIMARY KEY (id);


--
-- Name: comanda_items PK_comanda_items; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comanda_items
    ADD CONSTRAINT "PK_comanda_items" PRIMARY KEY (id);


--
-- Name: comandas PK_comandas; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comandas
    ADD CONSTRAINT "PK_comandas" PRIMARY KEY (id);


--
-- Name: cookie_consents PK_cookie_consents; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cookie_consents
    ADD CONSTRAINT "PK_cookie_consents" PRIMARY KEY (id);


--
-- Name: crediario_aviso_config PK_crediario_aviso_config; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crediario_aviso_config
    ADD CONSTRAINT "PK_crediario_aviso_config" PRIMARY KEY (id);


--
-- Name: crediario_avisos PK_crediario_avisos; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crediario_avisos
    ADD CONSTRAINT "PK_crediario_avisos" PRIMARY KEY (id);


--
-- Name: crediario_lancamentos PK_crediario_lancamentos; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crediario_lancamentos
    ADD CONSTRAINT "PK_crediario_lancamentos" PRIMARY KEY (id);


--
-- Name: crediarios PK_crediarios; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crediarios
    ADD CONSTRAINT "PK_crediarios" PRIMARY KEY (id);


--
-- Name: decks PK_decks; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decks
    ADD CONSTRAINT "PK_decks" PRIMARY KEY (id);


--
-- Name: external_transactions PK_external_transactions; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_transactions
    ADD CONSTRAINT "PK_external_transactions" PRIMARY KEY (id);


--
-- Name: funcionalidades PK_funcionalidades; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funcionalidades
    ADD CONSTRAINT "PK_funcionalidades" PRIMARY KEY (codigo);


--
-- Name: integration_configs PK_integration_configs; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_configs
    ADD CONSTRAINT "PK_integration_configs" PRIMARY KEY (id);


--
-- Name: lgpd_requests PK_lgpd_requests; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lgpd_requests
    ADD CONSTRAINT "PK_lgpd_requests" PRIMARY KEY (id);


--
-- Name: liga_mensal_manual_entries PK_liga_mensal_manual_entries; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liga_mensal_manual_entries
    ADD CONSTRAINT "PK_liga_mensal_manual_entries" PRIMARY KEY (id);


--
-- Name: listing_interests PK_listing_interests; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_interests
    ADD CONSTRAINT "PK_listing_interests" PRIMARY KEY (id);


--
-- Name: marcos_operacao PK_marcos_operacao; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcos_operacao
    ADD CONSTRAINT "PK_marcos_operacao" PRIMARY KEY (chave);


--
-- Name: notifications PK_notifications; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "PK_notifications" PRIMARY KEY (id);


--
-- Name: pagamentos_crediario PK_pagamentos_crediario; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagamentos_crediario
    ADD CONSTRAINT "PK_pagamentos_crediario" PRIMARY KEY (id);


--
-- Name: perfis PK_perfis; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfis
    ADD CONSTRAINT "PK_perfis" PRIMARY KEY (id);


--
-- Name: pix_cobrancas PK_pix_cobrancas; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_cobrancas
    ADD CONSTRAINT "PK_pix_cobrancas" PRIMARY KEY (id);


--
-- Name: product_categories PK_product_categories; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT "PK_product_categories" PRIMARY KEY (id);


--
-- Name: product_reservations PK_product_reservations; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reservations
    ADD CONSTRAINT "PK_product_reservations" PRIMARY KEY (id);


--
-- Name: product_variants PK_product_variants; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT "PK_product_variants" PRIMARY KEY (id);


--
-- Name: products PK_products; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT "PK_products" PRIMARY KEY (id);


--
-- Name: push_subscriptions PK_push_subscriptions; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT "PK_push_subscriptions" PRIMARY KEY (id);


--
-- Name: site_config PK_site_config; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_config
    ADD CONSTRAINT "PK_site_config" PRIMARY KEY (id);


--
-- Name: timers PK_timers; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timers
    ADD CONSTRAINT "PK_timers" PRIMARY KEY (id);


--
-- Name: torneio_partidas PK_torneio_partidas; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.torneio_partidas
    ADD CONSTRAINT "PK_torneio_partidas" PRIMARY KEY (id);


--
-- Name: torneio_rodadas PK_torneio_rodadas; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.torneio_rodadas
    ADD CONSTRAINT "PK_torneio_rodadas" PRIMARY KEY (id);


--
-- Name: user_sessions PK_user_sessions; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT "PK_user_sessions" PRIMARY KEY (id);


--
-- Name: users PK_users; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_users" PRIMARY KEY (id);


--
-- Name: app_migrations app_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_migrations
    ADD CONSTRAINT app_migrations_pkey PRIMARY KEY (key);


--
-- Name: championships chk_championships_status; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.championships
    ADD CONSTRAINT chk_championships_status CHECK ((status = ANY (ARRAY['Planejado'::text, 'Inscricoes'::text, 'EmAndamento'::text, 'Finalizado'::text, 'Cancelado'::text]))) NOT VALID;


--
-- Name: comanda_items chk_comanda_items_quantidade; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.comanda_items
    ADD CONSTRAINT chk_comanda_items_quantidade CHECK ((quantity > 0)) NOT VALID;


--
-- Name: comanda_items chk_comanda_items_valores; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.comanda_items
    ADD CONSTRAINT chk_comanda_items_valores CHECK (((unit_price_in_cents >= 0) AND (subtotal_in_cents >= 0))) NOT VALID;


--
-- Name: comandas chk_comandas_status; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.comandas
    ADD CONSTRAINT chk_comandas_status CHECK ((status = ANY (ARRAY['Aberta'::text, 'EmAndamento'::text, 'Fechada'::text, 'Cancelada'::text, 'Estornada'::text]))) NOT VALID;


--
-- Name: comandas chk_comandas_valores; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.comandas
    ADD CONSTRAINT chk_comandas_valores CHECK (((discount_in_cents >= 0) AND (points_applied >= 0))) NOT VALID;


--
-- Name: crediarios chk_crediarios_status; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.crediarios
    ADD CONSTRAINT chk_crediarios_status CHECK ((status = ANY (ARRAY['Aberto'::text, 'Pago'::text]))) NOT VALID;


--
-- Name: crediarios chk_crediarios_valores; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.crediarios
    ADD CONSTRAINT chk_crediarios_valores CHECK (((valor_em_centavos >= 0) AND (valor_pago_em_centavos >= 0))) NOT VALID;


--
-- Name: pagamentos_crediario chk_pagamentos_crediario_valor; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.pagamentos_crediario
    ADD CONSTRAINT chk_pagamentos_crediario_valor CHECK ((valor_em_centavos >= 0)) NOT VALID;


--
-- Name: pix_cobrancas chk_pix_cobrancas_valor; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.pix_cobrancas
    ADD CONSTRAINT chk_pix_cobrancas_valor CHECK ((valor_em_centavos >= 0)) NOT VALID;


--
-- Name: products chk_products_precos; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.products
    ADD CONSTRAINT chk_products_precos CHECK (((price_in_cents >= 0) AND (cost_price_in_cents >= 0))) NOT VALID;


--
-- Name: torneio_rodadas chk_torneio_rodadas_status; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.torneio_rodadas
    ADD CONSTRAINT chk_torneio_rodadas_status CHECK ((status = ANY (ARRAY['Aberta'::text, 'Fechada'::text]))) NOT VALID;


--
-- Name: estoque_movimentos estoque_movimentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estoque_movimentos
    ADD CONSTRAINT estoque_movimentos_pkey PRIMARY KEY (id);


--
-- Name: product_waitlist pk_product_waitlist; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_waitlist
    ADD CONSTRAINT pk_product_waitlist PRIMARY KEY (id);


--
-- Name: IX_card_listings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_card_listings_user_id" ON public.card_listings USING btree (user_id);


--
-- Name: IX_championship_participants_comanda_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_championship_participants_comanda_id" ON public.championship_participants USING btree (comanda_id);


--
-- Name: IX_championship_participants_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_championship_participants_user_id" ON public.championship_participants USING btree (user_id);


--
-- Name: IX_championship_preinscricoes_championship_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_championship_preinscricoes_championship_id" ON public.championship_preinscricoes USING btree (championship_id);


--
-- Name: IX_comanda_items_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_comanda_items_product_id" ON public.comanda_items USING btree (product_id);


--
-- Name: IX_cookie_consents_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_cookie_consents_user_id" ON public.cookie_consents USING btree (user_id);


--
-- Name: IX_crediarios_comanda_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_crediarios_comanda_id" ON public.crediarios USING btree (comanda_id);


--
-- Name: IX_lgpd_requests_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_lgpd_requests_user_id" ON public.lgpd_requests USING btree (user_id);


--
-- Name: IX_listing_interests_listing_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_listing_interests_listing_id" ON public.listing_interests USING btree (listing_id);


--
-- Name: IX_listing_interests_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_listing_interests_user_id" ON public.listing_interests USING btree (user_id);


--
-- Name: IX_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_notifications_user_id" ON public.notifications USING btree (user_id);


--
-- Name: IX_pix_cobrancas_championship_participant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_pix_cobrancas_championship_participant_id" ON public.pix_cobrancas USING btree (championship_participant_id);


--
-- Name: IX_product_reservations_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_product_reservations_product_id" ON public.product_reservations USING btree (product_id);


--
-- Name: IX_product_reservations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_product_reservations_user_id" ON public.product_reservations USING btree (user_id);


--
-- Name: IX_product_reservations_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_product_reservations_variant_id" ON public.product_reservations USING btree (variant_id);


--
-- Name: IX_product_variants_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_product_variants_product_id" ON public.product_variants USING btree (product_id);


--
-- Name: IX_push_subscriptions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_push_subscriptions_user_id" ON public.push_subscriptions USING btree (user_id);


--
-- Name: IX_torneio_partidas_participante_a_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_torneio_partidas_participante_a_id" ON public.torneio_partidas USING btree (participante_a_id);


--
-- Name: IX_torneio_partidas_participante_b_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_torneio_partidas_participante_b_id" ON public.torneio_partidas USING btree (participante_b_id);


--
-- Name: IX_users_perfil_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_users_perfil_id" ON public.users USING btree (perfil_id);


--
-- Name: ix_alertas_sistema_abertos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_alertas_sistema_abertos ON public.alertas_sistema USING btree (codigo, chave) WHERE (resolvido_em IS NULL);


--
-- Name: ix_alertas_sistema_ultima; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_alertas_sistema_ultima ON public.alertas_sistema USING btree (ultima_vez_em DESC);


--
-- Name: ix_audit_logs_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_actor ON public.audit_logs USING btree (actor_user_id);


--
-- Name: ix_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_created_at ON public.audit_logs USING btree (created_at);


--
-- Name: ix_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: ix_card_listings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_card_listings_status ON public.card_listings USING btree (status);


--
-- Name: ix_card_listings_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_card_listings_user ON public.card_listings USING btree (user_id);


--
-- Name: ix_championship_participants_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_championship_participants_unique ON public.championship_participants USING btree (championship_id, user_id);


--
-- Name: ix_championships_start_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_championships_start_date ON public.championships USING btree (start_date);


--
-- Name: ix_championships_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_championships_status ON public.championships USING btree (status);


--
-- Name: ix_comanda_items_comanda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_comanda_items_comanda ON public.comanda_items USING btree (comanda_id);


--
-- Name: ix_comandas_championship; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_comandas_championship ON public.comandas USING btree (championship_id);


--
-- Name: ix_comandas_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_comandas_status ON public.comandas USING btree (status);


--
-- Name: ix_comandas_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_comandas_user_status ON public.comandas USING btree (user_id, status);


--
-- Name: ix_cookie_consents_consent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cookie_consents_consent_at ON public.cookie_consents USING btree (consent_at);


--
-- Name: ix_crediario_avisos_crediario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_crediario_avisos_crediario ON public.crediario_avisos USING btree (crediario_id);


--
-- Name: ix_crediario_lancamentos_comanda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_crediario_lancamentos_comanda ON public.crediario_lancamentos USING btree (comanda_id);


--
-- Name: ix_crediario_lancamentos_crediario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_crediario_lancamentos_crediario ON public.crediario_lancamentos USING btree (crediario_id);


--
-- Name: ix_crediario_lancamentos_venda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_crediario_lancamentos_venda ON public.crediario_lancamentos USING btree (venda_avulsa_id);


--
-- Name: ix_crediarios_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_crediarios_status ON public.crediarios USING btree (status);


--
-- Name: ix_crediarios_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_crediarios_user_status ON public.crediarios USING btree (user_id, status);


--
-- Name: ix_decks_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_decks_user ON public.decks USING btree (user_id);


--
-- Name: ix_decks_user_public; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_decks_user_public ON public.decks USING btree (user_id, is_public);


--
-- Name: ix_estoque_movimentos_produto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_estoque_movimentos_produto ON public.estoque_movimentos USING btree (product_id, quando DESC);


--
-- Name: ix_estoque_movimentos_quando; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_estoque_movimentos_quando ON public.estoque_movimentos USING btree (quando);


--
-- Name: ix_ext_tx_source_external_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_ext_tx_source_external_id ON public.external_transactions USING btree (source, external_id) WHERE (external_id IS NOT NULL);


--
-- Name: ix_lgpd_requests_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_lgpd_requests_email ON public.lgpd_requests USING btree (requester_email);


--
-- Name: ix_lgpd_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_lgpd_requests_status ON public.lgpd_requests USING btree (status);


--
-- Name: ix_liga_mensal_manual_entries_ano_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_liga_mensal_manual_entries_ano_mes ON public.liga_mensal_manual_entries USING btree (ano, mes);


--
-- Name: ix_listing_interests_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_listing_interests_listing ON public.listing_interests USING btree (listing_id);


--
-- Name: ix_listing_interests_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_listing_interests_user ON public.listing_interests USING btree (user_id);


--
-- Name: ix_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notifications_user ON public.notifications USING btree (user_id);


--
-- Name: ix_pagamentos_crediario_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pagamentos_crediario_created_at ON public.pagamentos_crediario USING btree (created_at);


--
-- Name: ix_pagamentos_crediario_crediario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pagamentos_crediario_crediario ON public.pagamentos_crediario USING btree (crediario_id);


--
-- Name: ix_perfis_nome; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_perfis_nome ON public.perfis USING btree (nome);


--
-- Name: ix_pix_cobrancas_comanda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pix_cobrancas_comanda ON public.pix_cobrancas USING btree (comanda_id);


--
-- Name: ix_pix_cobrancas_crediario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pix_cobrancas_crediario ON public.pix_cobrancas USING btree (crediario_id);


--
-- Name: ix_pix_cobrancas_reservation_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pix_cobrancas_reservation_group ON public.pix_cobrancas USING btree (reservation_group_id);


--
-- Name: ix_pix_cobrancas_tx_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_pix_cobrancas_tx_id ON public.pix_cobrancas USING btree (tx_id);


--
-- Name: ix_product_categories_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_product_categories_name ON public.product_categories USING btree (name);


--
-- Name: ix_product_categories_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_product_categories_parent ON public.product_categories USING btree (parent_category_id);


--
-- Name: ix_product_reservations_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_product_reservations_group ON public.product_reservations USING btree (reservation_group_id);


--
-- Name: ix_product_reservations_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_product_reservations_kind ON public.product_reservations USING btree (kind);


--
-- Name: ix_product_reservations_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_product_reservations_product ON public.product_reservations USING btree (product_id);


--
-- Name: ix_product_reservations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_product_reservations_status ON public.product_reservations USING btree (status);


--
-- Name: ix_product_reservations_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_product_reservations_user ON public.product_reservations USING btree (user_id);


--
-- Name: ix_product_variants_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_product_variants_product ON public.product_variants USING btree (product_id);


--
-- Name: ix_product_waitlist_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_product_waitlist_product ON public.product_waitlist USING btree (product_id);


--
-- Name: ix_product_waitlist_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_product_waitlist_user ON public.product_waitlist USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: ix_products_barcode; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_products_barcode ON public.products USING btree (barcode) WHERE (barcode IS NOT NULL);


--
-- Name: ix_products_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_products_category ON public.products USING btree (category);


--
-- Name: ix_products_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_products_is_active ON public.products USING btree (is_active);


--
-- Name: ix_push_subscriptions_endpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_push_subscriptions_endpoint ON public.push_subscriptions USING btree (endpoint);


--
-- Name: ix_torneio_partidas_rodada; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_torneio_partidas_rodada ON public.torneio_partidas USING btree (rodada_id);


--
-- Name: ix_user_sessions_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_user_sessions_token_hash ON public.user_sessions USING btree (token_hash);


--
-- Name: ix_user_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_sessions_user ON public.user_sessions USING btree (user_id);


--
-- Name: ix_users_cpf; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_users_cpf ON public.users USING btree (cpf) WHERE (cpf IS NOT NULL);


--
-- Name: ix_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email) WHERE (email IS NOT NULL);


--
-- Name: ix_users_whatsapp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_users_whatsapp ON public.users USING btree (whatsapp);


--
-- Name: ux_championships_codigo_entrada; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_championships_codigo_entrada ON public.championships USING btree (codigo_entrada) WHERE (codigo_entrada IS NOT NULL);


--
-- Name: ux_crediario_avisos_marco; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_crediario_avisos_marco ON public.crediario_avisos USING btree (crediario_id, marco, vencimento_referencia) WHERE (marco IS NOT NULL);


--
-- Name: ux_crediarios_pagamento_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_crediarios_pagamento_token ON public.crediarios USING btree (pagamento_token) WHERE (pagamento_token IS NOT NULL);


--
-- Name: ux_torneio_rodadas_numero; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_torneio_rodadas_numero ON public.torneio_rodadas USING btree (championship_id, numero);


--
-- Name: ux_users_cpf_digitos; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_users_cpf_digitos ON public.users USING btree (regexp_replace((cpf)::text, '\D'::text, ''::text, 'g'::text)) WHERE (cpf IS NOT NULL);


--
-- Name: ux_users_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_users_email_lower ON public.users USING btree (lower((email)::text)) WHERE (email IS NOT NULL);


--
-- Name: ux_users_google_sub; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_users_google_sub ON public.users USING btree (google_sub) WHERE (google_sub IS NOT NULL);


--
-- Name: announcements trg_announcements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_announcements_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.fn_carimbar_updated_at();


--
-- Name: card_listings trg_card_listings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_card_listings_updated_at BEFORE UPDATE ON public.card_listings FOR EACH ROW EXECUTE FUNCTION public.fn_carimbar_updated_at();


--
-- Name: crediario_aviso_config trg_crediario_aviso_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_crediario_aviso_config_updated_at BEFORE UPDATE ON public.crediario_aviso_config FOR EACH ROW EXECUTE FUNCTION public.fn_carimbar_updated_at();


--
-- Name: decks trg_decks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_decks_updated_at BEFORE UPDATE ON public.decks FOR EACH ROW EXECUTE FUNCTION public.fn_carimbar_updated_at();


--
-- Name: external_transactions trg_external_transactions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_external_transactions_updated_at BEFORE UPDATE ON public.external_transactions FOR EACH ROW EXECUTE FUNCTION public.fn_carimbar_updated_at();


--
-- Name: integration_configs trg_integration_configs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_integration_configs_updated_at BEFORE UPDATE ON public.integration_configs FOR EACH ROW EXECUTE FUNCTION public.fn_carimbar_updated_at();


--
-- Name: liga_mensal_manual_entries trg_liga_mensal_manual_entries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_liga_mensal_manual_entries_updated_at BEFORE UPDATE ON public.liga_mensal_manual_entries FOR EACH ROW EXECUTE FUNCTION public.fn_carimbar_updated_at();


--
-- Name: product_variants trg_product_variants_auditar_estoque; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_product_variants_auditar_estoque AFTER UPDATE OF stock_quantity ON public.product_variants FOR EACH ROW WHEN ((old.stock_quantity IS DISTINCT FROM new.stock_quantity)) EXECUTE FUNCTION public.fn_auditar_estoque();


--
-- Name: product_variants trg_product_variants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_product_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.fn_carimbar_updated_at();


--
-- Name: products trg_products_auditar_estoque; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_products_auditar_estoque AFTER UPDATE OF stock_quantity ON public.products FOR EACH ROW WHEN ((old.stock_quantity IS DISTINCT FROM new.stock_quantity)) EXECUTE FUNCTION public.fn_auditar_estoque();


--
-- Name: products trg_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.fn_carimbar_updated_at();


--
-- Name: site_config trg_site_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_site_config_updated_at BEFORE UPDATE ON public.site_config FOR EACH ROW EXECUTE FUNCTION public.fn_carimbar_updated_at();


--
-- Name: timers trg_timers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_timers_updated_at BEFORE UPDATE ON public.timers FOR EACH ROW EXECUTE FUNCTION public.fn_carimbar_updated_at();


--
-- Name: users trg_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.fn_carimbar_updated_at();


--
-- Name: card_listings FK_card_listings_users_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_listings
    ADD CONSTRAINT "FK_card_listings_users_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: championship_participants FK_championship_participants_championships_championship_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.championship_participants
    ADD CONSTRAINT "FK_championship_participants_championships_championship_id" FOREIGN KEY (championship_id) REFERENCES public.championships(id) ON DELETE CASCADE;


--
-- Name: championship_participants FK_championship_participants_comandas_comanda_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.championship_participants
    ADD CONSTRAINT "FK_championship_participants_comandas_comanda_id" FOREIGN KEY (comanda_id) REFERENCES public.comandas(id) ON DELETE SET NULL;


--
-- Name: championship_participants FK_championship_participants_users_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.championship_participants
    ADD CONSTRAINT "FK_championship_participants_users_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: championship_preinscricoes FK_championship_preinscricoes_championships_championship_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.championship_preinscricoes
    ADD CONSTRAINT "FK_championship_preinscricoes_championships_championship_id" FOREIGN KEY (championship_id) REFERENCES public.championships(id) ON DELETE CASCADE;


--
-- Name: comanda_items FK_comanda_items_comandas_comanda_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comanda_items
    ADD CONSTRAINT "FK_comanda_items_comandas_comanda_id" FOREIGN KEY (comanda_id) REFERENCES public.comandas(id) ON DELETE CASCADE;


--
-- Name: comanda_items FK_comanda_items_products_product_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comanda_items
    ADD CONSTRAINT "FK_comanda_items_products_product_id" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: comandas FK_comandas_championships_championship_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comandas
    ADD CONSTRAINT "FK_comandas_championships_championship_id" FOREIGN KEY (championship_id) REFERENCES public.championships(id) ON DELETE SET NULL;


--
-- Name: comandas FK_comandas_users_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comandas
    ADD CONSTRAINT "FK_comandas_users_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: cookie_consents FK_cookie_consents_users_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cookie_consents
    ADD CONSTRAINT "FK_cookie_consents_users_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: crediario_avisos FK_crediario_avisos_crediarios_crediario_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crediario_avisos
    ADD CONSTRAINT "FK_crediario_avisos_crediarios_crediario_id" FOREIGN KEY (crediario_id) REFERENCES public.crediarios(id) ON DELETE CASCADE;


--
-- Name: crediario_lancamentos FK_crediario_lancamentos_crediarios_crediario_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crediario_lancamentos
    ADD CONSTRAINT "FK_crediario_lancamentos_crediarios_crediario_id" FOREIGN KEY (crediario_id) REFERENCES public.crediarios(id) ON DELETE CASCADE;


--
-- Name: crediarios FK_crediarios_comandas_comanda_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crediarios
    ADD CONSTRAINT "FK_crediarios_comandas_comanda_id" FOREIGN KEY (comanda_id) REFERENCES public.comandas(id) ON DELETE RESTRICT;


--
-- Name: crediarios FK_crediarios_users_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crediarios
    ADD CONSTRAINT "FK_crediarios_users_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: decks FK_decks_users_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decks
    ADD CONSTRAINT "FK_decks_users_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: lgpd_requests FK_lgpd_requests_users_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lgpd_requests
    ADD CONSTRAINT "FK_lgpd_requests_users_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: listing_interests FK_listing_interests_card_listings_listing_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_interests
    ADD CONSTRAINT "FK_listing_interests_card_listings_listing_id" FOREIGN KEY (listing_id) REFERENCES public.card_listings(id) ON DELETE CASCADE;


--
-- Name: listing_interests FK_listing_interests_users_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_interests
    ADD CONSTRAINT "FK_listing_interests_users_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications FK_notifications_users_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "FK_notifications_users_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pagamentos_crediario FK_pagamentos_crediario_crediarios_crediario_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagamentos_crediario
    ADD CONSTRAINT "FK_pagamentos_crediario_crediarios_crediario_id" FOREIGN KEY (crediario_id) REFERENCES public.crediarios(id) ON DELETE RESTRICT;


--
-- Name: pix_cobrancas FK_pix_cobrancas_championship_participants_championship_partic~; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_cobrancas
    ADD CONSTRAINT "FK_pix_cobrancas_championship_participants_championship_partic~" FOREIGN KEY (championship_participant_id) REFERENCES public.championship_participants(id);


--
-- Name: pix_cobrancas FK_pix_cobrancas_comandas_comanda_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_cobrancas
    ADD CONSTRAINT "FK_pix_cobrancas_comandas_comanda_id" FOREIGN KEY (comanda_id) REFERENCES public.comandas(id) ON DELETE CASCADE;


--
-- Name: pix_cobrancas FK_pix_cobrancas_crediarios_crediario_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_cobrancas
    ADD CONSTRAINT "FK_pix_cobrancas_crediarios_crediario_id" FOREIGN KEY (crediario_id) REFERENCES public.crediarios(id) ON DELETE CASCADE;


--
-- Name: product_categories FK_product_categories_product_categories_parent_category_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT "FK_product_categories_product_categories_parent_category_id" FOREIGN KEY (parent_category_id) REFERENCES public.product_categories(id) ON DELETE SET NULL;


--
-- Name: product_reservations FK_product_reservations_product_variants_variant_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reservations
    ADD CONSTRAINT "FK_product_reservations_product_variants_variant_id" FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: product_reservations FK_product_reservations_products_product_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reservations
    ADD CONSTRAINT "FK_product_reservations_products_product_id" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_reservations FK_product_reservations_users_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reservations
    ADD CONSTRAINT "FK_product_reservations_users_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: product_variants FK_product_variants_products_product_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT "FK_product_variants_products_product_id" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions FK_push_subscriptions_users_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT "FK_push_subscriptions_users_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: torneio_partidas FK_torneio_partidas_championship_participants_participante_a_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.torneio_partidas
    ADD CONSTRAINT "FK_torneio_partidas_championship_participants_participante_a_id" FOREIGN KEY (participante_a_id) REFERENCES public.championship_participants(id) ON DELETE CASCADE;


--
-- Name: torneio_partidas FK_torneio_partidas_championship_participants_participante_b_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.torneio_partidas
    ADD CONSTRAINT "FK_torneio_partidas_championship_participants_participante_b_id" FOREIGN KEY (participante_b_id) REFERENCES public.championship_participants(id) ON DELETE CASCADE;


--
-- Name: torneio_partidas FK_torneio_partidas_torneio_rodadas_rodada_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.torneio_partidas
    ADD CONSTRAINT "FK_torneio_partidas_torneio_rodadas_rodada_id" FOREIGN KEY (rodada_id) REFERENCES public.torneio_rodadas(id) ON DELETE CASCADE;


--
-- Name: torneio_rodadas FK_torneio_rodadas_championships_championship_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.torneio_rodadas
    ADD CONSTRAINT "FK_torneio_rodadas_championships_championship_id" FOREIGN KEY (championship_id) REFERENCES public.championships(id) ON DELETE CASCADE;


--
-- Name: user_sessions FK_user_sessions_users_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT "FK_user_sessions_users_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users FK_users_perfis_perfil_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "FK_users_perfis_perfil_id" FOREIGN KEY (perfil_id) REFERENCES public.perfis(id) ON DELETE SET NULL;


--
-- Name: product_waitlist product_waitlist_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_waitlist
    ADD CONSTRAINT product_waitlist_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_waitlist product_waitlist_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_waitlist
    ADD CONSTRAINT product_waitlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict NXQ8KEbcgFRy35EehQVBaoEvpwy9hfsBpwquiD96fxQXeaSysrOL0zJ8Ud1lIyk

