-- =============================================================================
-- postgres.sql — roda em TODO startup da API em produção (Postgres)
--
-- O banco não usa migrations: EnsureCreated só cria tabelas num banco vazio.
-- Tabela/coluna nova num banco que já existe precisa vir aqui, sempre
-- idempotente (IF NOT EXISTS, ON CONFLICT DO NOTHING, guarda em app_migrations).
-- Mudou aqui? Mude também o sqlite.sql (dev) e suba a API local antes de commitar.
-- =============================================================================

-- Schemas isolados para os serviços de automação que compartilham
-- o mesmo PostgreSQL sem misturar tabelas com o domínio do ERP.
CREATE SCHEMA IF NOT EXISTS n8n;
CREATE SCHEMA IF NOT EXISTS evolution_api;

CREATE TABLE IF NOT EXISTS perfis (
    id                  UUID         NOT NULL DEFAULT gen_random_uuid(),
    nome                VARCHAR(100) NOT NULL,
    permissoes_json     TEXT         NOT NULL DEFAULT '[]',
    criado_por_admin_id UUID         NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    criado_em           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    atualizado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_perfis PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_perfis_nome ON perfis (nome);
ALTER TABLE users ADD COLUMN IF NOT EXISTS perfil_id                    UUID         REFERENCES perfis(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token        VARCHAR(200) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_expiry TIMESTAMPTZ  NULL;

CREATE TABLE IF NOT EXISTS product_variants (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    size            VARCHAR(50)  NULL,
    color           VARCHAR(100) NULL,
    stock_quantity  INTEGER      NOT NULL DEFAULT 0,
    price_in_cents  INTEGER      NULL,
    sku             VARCHAR(100) NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_product_variants_product ON product_variants (product_id);

ALTER TABLE comanda_items ADD COLUMN IF NOT EXISTS variant_id UUID NULL REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE lgpd_requests ADD COLUMN IF NOT EXISTS anexo_nome VARCHAR(255) NULL;
ALTER TABLE lgpd_requests ADD COLUMN IF NOT EXISTS anexo_dados BYTEA NULL;

CREATE TABLE IF NOT EXISTS decks (
    id          UUID         NOT NULL DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    game        VARCHAR(50)  NOT NULL DEFAULT 'Pokemon',
    format      VARCHAR(20)  NOT NULL DEFAULT 'Standard',
    cards_json  TEXT         NOT NULL DEFAULT '[]',
    is_public   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_decks PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_decks_user        ON decks (user_id);
CREATE INDEX IF NOT EXISTS ix_decks_user_public ON decks (user_id, is_public);

CREATE TABLE IF NOT EXISTS product_waitlist (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    product_id  UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
    name        VARCHAR(150) NOT NULL,
    whatsapp    VARCHAR(20)  NOT NULL,
    position    INT          NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    notified_at TIMESTAMPTZ,
    CONSTRAINT pk_product_waitlist PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_product_waitlist_product ON product_waitlist (product_id);
CREATE INDEX IF NOT EXISTS ix_product_waitlist_user    ON product_waitlist (user_id) WHERE user_id IS NOT NULL;

-- Deck em pré-inscrição e participante de campeonato
ALTER TABLE championship_preinscricoes ADD COLUMN IF NOT EXISTS deck_id   UUID         NULL;
ALTER TABLE championship_preinscricoes ADD COLUMN IF NOT EXISTS deck_name VARCHAR(200) NULL;
ALTER TABLE championship_participants   ADD COLUMN IF NOT EXISTS deck_id   UUID         NULL;

-- Timers de torneio
CREATE TABLE IF NOT EXISTS timers (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name             VARCHAR(100) NOT NULL DEFAULT 'Timer',
    duration_seconds INTEGER      NOT NULL DEFAULT 1800,
    paused_remaining INTEGER      NULL,
    state            INTEGER      NOT NULL DEFAULT 0,
    started_at       TIMESTAMPTZ  NULL,
    sound_preset     VARCHAR(50)  NOT NULL DEFAULT 'bell',
    warn_at_seconds  INTEGER      NOT NULL DEFAULT 60,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Marketplace de cartas entre usuários
CREATE TABLE IF NOT EXISTS card_listings (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_name      VARCHAR(200)  NOT NULL,
    card_game      VARCHAR(100)  NULL,
    card_image_url VARCHAR(500)  NULL,
    price_in_cents INTEGER       NOT NULL DEFAULT 0,
    condition      VARCHAR(50)   NOT NULL DEFAULT 'NM',
    description    VARCHAR(1000) NULL,
    status         VARCHAR(20)   NOT NULL DEFAULT 'Available',
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_card_listings_user   ON card_listings (user_id);
CREATE INDEX IF NOT EXISTS ix_card_listings_status ON card_listings (status);

CREATE TABLE IF NOT EXISTS listing_interests (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID         NOT NULL REFERENCES card_listings(id) ON DELETE CASCADE,
    user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message    VARCHAR(500) NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (listing_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_listing_interests_listing ON listing_interests (listing_id);
CREATE INDEX IF NOT EXISTS ix_listing_interests_user    ON listing_interests (user_id);

-- Consentimento LGPD: comprador autoriza expor WhatsApp ao vendedor
ALTER TABLE listing_interests ADD COLUMN IF NOT EXISTS share_contact BOOLEAN NOT NULL DEFAULT FALSE;

-- Variantes de produto (grade tamanho/cor para roupas e similares)
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_variants BOOLEAN NOT NULL DEFAULT FALSE;

-- Reservas de produtos via site (não usadas no PDV)
CREATE TABLE IF NOT EXISTS product_reservations (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id    UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id    UUID         NULL REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity      INTEGER      NOT NULL DEFAULT 1,
    status        VARCHAR(20)  NOT NULL DEFAULT 'active',
    notes         VARCHAR(500) NULL,
    reserved_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMPTZ  NOT NULL,
    fulfilled_at  TIMESTAMPTZ  NULL,
    cancelled_at  TIMESTAMPTZ  NULL
);
CREATE INDEX IF NOT EXISTS ix_product_reservations_user    ON product_reservations (user_id);
CREATE INDEX IF NOT EXISTS ix_product_reservations_product ON product_reservations (product_id);
CREATE INDEX IF NOT EXISTS ix_product_reservations_status  ON product_reservations (status);

-- ── Pré-venda/reserva unificadas (modelo da loja) ──────────────
-- Pré-venda = item EM ESTOQUE (baixa na hora, Pix em tudo, data de rua
-- opcional). Reserva = FILA de item que não chegou (sem estoque, sem prazo).
ALTER TABLE products ADD COLUMN IF NOT EXISTS prevenda_release_date DATE NULL;
ALTER TABLE product_reservations ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'pre_venda';
ALTER TABLE product_reservations ALTER COLUMN expires_at DROP NOT NULL;
CREATE INDEX IF NOT EXISTS ix_product_reservations_kind ON product_reservations (kind);

-- Intenção de pagamento declarada na reserva online (pix ou retirada)
ALTER TABLE product_reservations ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NULL;
-- Pedido do site no padrão e-commerce (v1.62.0): preço congelado e a venda que ele gerou
ALTER TABLE product_reservations ADD COLUMN IF NOT EXISTS unit_price_in_cents INTEGER NULL;
ALTER TABLE product_reservations ADD COLUMN IF NOT EXISTS venda_avulsa_id VARCHAR(80) NULL;
-- Snapshot JSON dos itens cobrados numa cobrança Pix de reserva (baixa vinculada)
ALTER TABLE pix_cobrancas ADD COLUMN IF NOT EXISTS reservation_item_ids TEXT NULL;

-- Registro de migrações únicas de dados (protege updates não-idempotentes)
CREATE TABLE IF NOT EXISTS app_migrations (
    key        TEXT        PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1) Lista de espera antiga vira fila (kind=fila, status=waiting)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM app_migrations WHERE key = 'waitlist_to_fila') THEN
        INSERT INTO product_reservations
            (reservation_group_id, user_id, product_id, quantity, status, kind, reserved_at, expires_at)
        SELECT gen_random_uuid(), w.user_id, w.product_id, 1, 'waiting', 'fila', w.created_at, NULL
        FROM product_waitlist w
        WHERE w.user_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM product_reservations r
              WHERE r.kind = 'fila' AND r.status = 'waiting'
                AND r.product_id = w.product_id AND r.user_id = w.user_id
          );
        DELETE FROM product_waitlist;
        INSERT INTO app_migrations (key) VALUES ('waitlist_to_fila');
    END IF;
END $$;

-- 2) Reservas ativas antigas (trava virtual de 48h) viram pré-venda de
--    verdade: baixa o estoque delas UMA única vez (produto ou variante).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM app_migrations WHERE key = 'reserva_to_prevenda_stock') THEN
        UPDATE products p
        SET stock_quantity = GREATEST(0, p.stock_quantity - sub.qty)
        FROM (
            SELECT product_id, SUM(quantity) AS qty
            FROM product_reservations
            WHERE kind = 'pre_venda' AND status = 'active'
              AND expires_at > NOW() AND variant_id IS NULL
            GROUP BY product_id
        ) sub
        WHERE p.id = sub.product_id;

        UPDATE product_variants v
        SET stock_quantity = GREATEST(0, v.stock_quantity - sub.qty)
        FROM (
            SELECT variant_id, SUM(quantity) AS qty
            FROM product_reservations
            WHERE kind = 'pre_venda' AND status = 'active'
              AND expires_at > NOW() AND variant_id IS NOT NULL
            GROUP BY variant_id
        ) sub
        WHERE v.id = sub.variant_id;

        INSERT INTO app_migrations (key) VALUES ('reserva_to_prevenda_stock');
    END IF;
END $$;

-- O módulo fiscal (NFC-e, SEFAZ, Tenant-ERP) saiu do sistema em 26/10/2026 e ficou guardado
-- na tag arquivo/nfce-v1.70.1. As tabelas dele (fiscal_config, naturezas_operacao,
-- notas_fiscais_emitidas, notas_destinadas) e as colunas products.ncm/cest/natureza_operacao_id
-- continuam nos bancos que já tinham — nada é apagado; só não são mais criadas nem usadas.

-- Financeiro: chave Pix cadastrada no Inter (para emitir cobrança via API)
ALTER TABLE integration_configs ADD COLUMN IF NOT EXISTS pix_key VARCHAR(100) NULL;

-- Financeiro: cobranças Pix imediatas (Crediário, Comanda ou Venda Avulsa)
CREATE TABLE IF NOT EXISTS pix_cobrancas (
    id                   UUID         NOT NULL DEFAULT gen_random_uuid(),
    origem               VARCHAR(20)  NOT NULL DEFAULT 'Crediario',
    crediario_id         UUID         NULL REFERENCES crediarios(id) ON DELETE CASCADE,
    comanda_id           UUID         NULL REFERENCES comandas(id) ON DELETE CASCADE,
    venda_avulsa_id      VARCHAR(50)  NULL,
    tx_id                VARCHAR(35)  NOT NULL,
    valor_em_centavos    INTEGER      NOT NULL DEFAULT 0,
    status               VARCHAR(40)  NOT NULL DEFAULT 'ATIVA',
    pix_copia_cola       TEXT         NULL,
    imagem_qrcode        TEXT         NULL,
    nome_devedor         VARCHAR(200) NULL,
    criado_por_admin_id  UUID         NOT NULL,
    criado_em            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expira_em            TIMESTAMPTZ  NULL,
    pago_em              TIMESTAMPTZ  NULL,
    CONSTRAINT pk_pix_cobrancas PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_pix_cobrancas_tx_id    ON pix_cobrancas (tx_id);
CREATE INDEX IF NOT EXISTS ix_pix_cobrancas_crediario      ON pix_cobrancas (crediario_id);
CREATE INDEX IF NOT EXISTS ix_pix_cobrancas_comanda        ON pix_cobrancas (comanda_id);

-- Crediário: cada compra que entra numa conta vira um lançamento próprio
-- (antes os itens de todas as compras viravam uma lista corrida só).
CREATE TABLE IF NOT EXISTS crediario_lancamentos (
    id                UUID         NOT NULL DEFAULT gen_random_uuid(),
    crediario_id      UUID         NOT NULL REFERENCES crediarios(id) ON DELETE CASCADE,
    origem            VARCHAR(20)  NOT NULL,
    comanda_id        UUID         NULL,
    venda_avulsa_id   VARCHAR(50)  NULL,
    valor_em_centavos INTEGER      NOT NULL DEFAULT 0,
    itens_json        TEXT         NULL,
    descricao         VARCHAR(500) NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    estornado_em      TIMESTAMPTZ  NULL,
    CONSTRAINT pk_crediario_lancamentos PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_crediario_lancamentos_crediario ON crediario_lancamentos (crediario_id);
CREATE INDEX IF NOT EXISTS ix_crediario_lancamentos_comanda   ON crediario_lancamentos (comanda_id);
CREATE INDEX IF NOT EXISTS ix_crediario_lancamentos_venda     ON crediario_lancamentos (venda_avulsa_id);

-- Crediário: link público de pagamento (página /pagar/codigo)
ALTER TABLE crediarios ADD COLUMN IF NOT EXISTS pagamento_token VARCHAR(64) NULL;
-- Pix único cobrindo várias contas do mesmo cliente
ALTER TABLE pix_cobrancas ADD COLUMN IF NOT EXISTS crediario_ids_json TEXT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_crediarios_pagamento_token
    ON crediarios (pagamento_token) WHERE pagamento_token IS NOT NULL;

-- Crediário: lembretes de vencimento (config de linha única + histórico)
CREATE TABLE IF NOT EXISTS crediario_aviso_config (
    id               UUID         NOT NULL,
    ativo            BOOLEAN      NOT NULL DEFAULT TRUE,
    hora_envio       INTEGER      NOT NULL DEFAULT 10,
    marcos_json      TEXT         NOT NULL DEFAULT '[-3,0,3,7,15,30]',
    canal_app        BOOLEAN      NOT NULL DEFAULT TRUE,
    canal_email      BOOLEAN      NOT NULL DEFAULT TRUE,
    canal_whatsapp   BOOLEAN      NOT NULL DEFAULT FALSE,
    resumo_admin     BOOLEAN      NOT NULL DEFAULT TRUE,
    mensagem_extra   VARCHAR(300) NULL,
    ultimo_resumo_em TIMESTAMPTZ  NULL,
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_crediario_aviso_config PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS crediario_avisos (
    id                    UUID         NOT NULL DEFAULT gen_random_uuid(),
    crediario_id          UUID         NOT NULL REFERENCES crediarios(id) ON DELETE CASCADE,
    marco                 INTEGER      NULL,
    vencimento_referencia TIMESTAMPTZ  NOT NULL,
    canais                VARCHAR(60)  NOT NULL DEFAULT '',
    falhas                VARCHAR(500) NULL,
    enviado_por_admin_id  UUID         NULL,
    enviado_em            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_crediario_avisos PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_crediario_avisos_crediario ON crediario_avisos (crediario_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_crediario_avisos_marco
    ON crediario_avisos (crediario_id, marco, vencimento_referencia) WHERE marco IS NOT NULL;

-- Vencimento escolhido como data era gravado à meia-noite UTC (21h da véspera
-- em Brasília) e a conta aparecia vencida um dia antes. Passa as contas
-- abertas pro fim do dia escolhido, no horário de Brasília. Uma vez só.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM app_migrations WHERE key = 'crediario_vencimento_fim_do_dia') THEN
        UPDATE crediarios
        SET data_vencimento =
            (((data_vencimento AT TIME ZONE 'UTC')::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
            - INTERVAL '1 second'
        WHERE status = 'Aberto'
          AND (data_vencimento AT TIME ZONE 'UTC')::time = '00:00:00';
        INSERT INTO app_migrations (key) VALUES ('crediario_vencimento_fim_do_dia');
    END IF;
END $$;

-- Financeiro: tabelas que dependiam só do EnsureCreated (no-op em banco já existente)
CREATE TABLE IF NOT EXISTS external_transactions (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    source      VARCHAR(30)     NOT NULL DEFAULT 'manual',
    external_id VARCHAR(200)    NULL,
    type        VARCHAR(10)     NOT NULL DEFAULT 'expense',
    amount      NUMERIC(10,2)   NOT NULL DEFAULT 0,
    description VARCHAR(500)    NOT NULL DEFAULT '',
    due_date    TIMESTAMPTZ     NULL,
    paid_at     TIMESTAMPTZ     NULL,
    status      VARCHAR(20)     NOT NULL DEFAULT 'pending',
    category    VARCHAR(100)    NULL,
    supplier    VARCHAR(200)    NULL,
    nfe_key     VARCHAR(44)     NULL,
    notes       VARCHAR(2000)   NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_ext_tx_source_external_id
    ON external_transactions (source, external_id)
    WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS integration_configs (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    source        VARCHAR(30)   NOT NULL UNIQUE,
    access_token  VARCHAR(2000) NULL,
    refresh_token VARCHAR(2000) NULL,
    client_id     VARCHAR(200)  NULL,
    client_secret VARCHAR(200)  NULL,
    expires_at    TIMESTAMPTZ   NULL,
    is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
    cnpj          VARCHAR(18)   NULL,
    last_sync_at  TIMESTAMPTZ   NULL,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      VARCHAR(120) NOT NULL,
    body       VARCHAR(500) NOT NULL,
    link       VARCHAR(300) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at    TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS ix_notifications_user ON notifications (user_id);

-- WhatsApp/Evolution: idempotência dos webhooks e auditoria mínima.
CREATE TABLE IF NOT EXISTS whatsapp_inbound_events (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    external_message_id VARCHAR(200)  NOT NULL,
    phone               VARCHAR(20)   NOT NULL,
    message_text        VARCHAR(1000) NULL,
    response_json       TEXT          NULL,
    status              VARCHAR(20)   NOT NULL DEFAULT 'processing',
    received_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    processed_at        TIMESTAMPTZ   NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_whatsapp_inbound_external_message_id
    ON whatsapp_inbound_events (external_message_id);
CREATE INDEX IF NOT EXISTS ix_whatsapp_inbound_phone
    ON whatsapp_inbound_events (phone);

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
    phone            VARCHAR(20) PRIMARY KEY,
    user_id          UUID         NULL REFERENCES users(id) ON DELETE SET NULL,
    bot_paused_until TIMESTAMPTZ  NULL,
    last_inbound_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
ALTER TABLE whatsapp_conversations
    ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ NULL;
ALTER TABLE whatsapp_conversations
    ADD COLUMN IF NOT EXISTS bot_disabled BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS ix_whatsapp_conversations_user
    ON whatsapp_conversations (user_id);

CREATE TABLE IF NOT EXISTS whatsapp_outbound_messages (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    phone               VARCHAR(20)   NOT NULL,
    message_text        VARCHAR(2000) NOT NULL,
    author              VARCHAR(20)   NOT NULL DEFAULT 'admin',
    external_message_id VARCHAR(200)  NULL,
    status              VARCHAR(20)   NOT NULL DEFAULT 'sent',
    sent_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_whatsapp_outbound_phone_sent_at
    ON whatsapp_outbound_messages (phone, sent_at);

-- Mensageria: imagem opcional na notificação (banner de campanha)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) NULL;

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   VARCHAR(600) NOT NULL,
    p256dh     VARCHAR(300) NOT NULL,
    auth       VARCHAR(150) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_push_subscriptions_endpoint ON push_subscriptions (endpoint);

-- Financeiro: remove lançamentos do Inter importados pelo sync antigo, que lia
-- campos errados da API (tudo virava despesa e sem external_id não há dedup).
-- O próximo sync (janela de 7 dias) reimporta corretamente com idTransacao.
DELETE FROM external_transactions WHERE source = 'inter' AND external_id IS NULL;

-- Comanda: desconto administrativo em R$, separado dos pontos de fidelidade
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS discount_in_cents INTEGER NOT NULL DEFAULT 0;

-- Fila de espera: controle de quem já foi avisado do reestoque
ALTER TABLE product_waitlist ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ NULL;

-- Cadastro duplicado: trava no banco além da checagem da aplicação. O índice
-- só é criado se a base já estiver limpa — se existir duplicado antigo, criar
-- derrubaria o startup, então fica só a checagem da aplicação até alguém
-- resolver os cadastros repetidos na mão.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM users WHERE email IS NOT NULL
        GROUP BY lower(email) HAVING count(*) > 1
    ) THEN
        CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_lower
            ON users (lower(email)) WHERE email IS NOT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM users WHERE cpf IS NOT NULL
        GROUP BY regexp_replace(cpf, '\D', '', 'g') HAVING count(*) > 1
    ) THEN
        CREATE UNIQUE INDEX IF NOT EXISTS ux_users_cpf_digitos
            ON users (regexp_replace(cpf, '\D', '', 'g')) WHERE cpf IS NOT NULL;
    END IF;
END $$;

-- Estorno de comanda já fechada: quem desfez, quando e por quê. Comanda
-- cobrada errada vira Estornada em vez de sumir — sai do faturamento mas
-- continua no extrato.
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS estornada_em           TIMESTAMPTZ  NULL;
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS estornada_por_admin_id UUID         NULL;
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS motivo_estorno         VARCHAR(300) NULL;

-- Campeonatos: pagamento opcional da taxa de inscrição (Pix ou balcão)
ALTER TABLE championship_participants ADD COLUMN IF NOT EXISTS entry_fee_paid_at        TIMESTAMPTZ NULL;
ALTER TABLE championship_participants ADD COLUMN IF NOT EXISTS entry_fee_payment_method VARCHAR(20) NULL;
ALTER TABLE pix_cobrancas ADD COLUMN IF NOT EXISTS championship_participant_id UUID NULL
    REFERENCES championship_participants(id) ON DELETE CASCADE;

-- Personalização da landing page (nome, textos, cores) — singleton, defaults
-- iguais aos valores hardcoded originais pra não mudar nada até o admin editar.
CREATE TABLE IF NOT EXISTS site_config (
    id                      UUID PRIMARY KEY,
    site_name               VARCHAR(100) NOT NULL DEFAULT 'Santuário Nerd',
    hero_subtitle           VARCHAR(400) NOT NULL DEFAULT 'Produtos, torneios e a melhor experiência TCG da região. Acumule pontos, compre na mesa e participe de campeonatos.',
    address_line            VARCHAR(150) NOT NULL DEFAULT 'José Bonifácio — SP',
    contact_person_name     VARCHAR(60)  NOT NULL DEFAULT 'Maikon',
    whatsapp_number         VARCHAR(20)  NOT NULL DEFAULT '5517997633103',
    contact_email           VARCHAR(150) NOT NULL DEFAULT 'santuarionerd@gmail.com',
    nav_torneios_label      VARCHAR(40)  NOT NULL DEFAULT 'Torneios',
    nav_produtos_label      VARCHAR(40)  NOT NULL DEFAULT 'Produtos',
    nav_mercado_label       VARCHAR(40)  NOT NULL DEFAULT 'Mercado de Cartas',
    nav_pontos_label        VARCHAR(40)  NOT NULL DEFAULT 'Pontos',
    cta_ver_eventos_label   VARCHAR(40)  NOT NULL DEFAULT 'Ver Eventos',
    cta_ver_torneios_label  VARCHAR(40)  NOT NULL DEFAULT 'Ver Torneios',
    cta_ver_produtos_label  VARCHAR(40)  NOT NULL DEFAULT 'Ver Produtos',
    torneios_eyebrow        VARCHAR(60)  NOT NULL DEFAULT 'Agenda',
    torneios_title          VARCHAR(80)  NOT NULL DEFAULT 'Próximos Torneios',
    produtos_eyebrow        VARCHAR(60)  NOT NULL DEFAULT 'Vitrine',
    produtos_title          VARCHAR(80)  NOT NULL DEFAULT 'Em Destaque',
    pontos_eyebrow          VARCHAR(60)  NOT NULL DEFAULT 'Programa de Fidelidade',
    pontos_title            VARCHAR(80)  NOT NULL DEFAULT 'Ganhe pontos a cada visita',
    pontos_paragraph        VARCHAR(400) NOT NULL DEFAULT 'Acumule pontos nas suas compras e troque por descontos. Só com CPF e WhatsApp — nada de senha ou aplicativo.',
    color_primary           VARCHAR(9)   NOT NULL DEFAULT '#3EC2F2',
    color_accent            VARCHAR(9)   NOT NULL DEFAULT '#FFE45E',
    color_navy              VARCHAR(9)   NOT NULL DEFAULT '#0C3D5A',
    color_background        VARCHAR(9)   NOT NULL DEFAULT '#EBF7FD',
    color_card              VARCHAR(9)   NOT NULL DEFAULT '#FFFFFF',
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS contact_person_name VARCHAR(60) NOT NULL DEFAULT 'Maikon';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS color_background VARCHAR(9) NOT NULL DEFAULT '#EBF7FD';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS color_card VARCHAR(9) NOT NULL DEFAULT '#FFFFFF';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS nav_liga_label VARCHAR(40) NOT NULL DEFAULT 'Liga Mensal';
-- Topo da página inicial e painel do login dos clientes (v1.45.0): ilustração, cor e etiqueta
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS hero_image_url VARCHAR(300) NULL;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS color_hero     VARCHAR(9)   NOT NULL DEFAULT '#1E4FD6';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS hero_eyebrow   VARCHAR(80)  NOT NULL DEFAULT 'O ponto de encontro da comunidade TCG';
-- Faixa fina acima da barra do topo (v1.47.0). Vazio = sem faixa
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS aviso_topo     VARCHAR(120) NOT NULL DEFAULT 'Jogue, evolua e divirta-se — encontre tudo para sua próxima partida!';

-- Vitrine: parcelamento no cartão + desconto no Pix (padrão da loja).
-- Categoria com percentual próprio sobrescreve (Pokémon = 3%, por exemplo).
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS pix_discount_percent     NUMERIC(5,2) NOT NULL DEFAULT 5;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS max_installments         INTEGER      NOT NULL DEFAULT 12;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS min_installment_in_cents INTEGER      NOT NULL DEFAULT 500;
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS pix_discount_percent NUMERIC(5,2) NULL;
-- Parcelamento é por item (decidido no cadastro do produto): null = não anuncia.
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_installments INTEGER NULL;
-- Desconto do Pix do item; null = herda da categoria / do padrão da loja.
ALTER TABLE products ADD COLUMN IF NOT EXISTS pix_discount_percent NUMERIC(5,2) NULL;

-- Liga Mensal: lançamentos manuais (jogador + pontos digitados direto pelo admin,
-- sem precisar cadastrar Championship — pra migrar histórico anotado à mão).
CREATE TABLE IF NOT EXISTS liga_mensal_manual_entries (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    ano                 INTEGER      NOT NULL,
    mes                 INTEGER      NOT NULL,
    player_name         VARCHAR(200) NOT NULL,
    total_points        INTEGER      NOT NULL DEFAULT 0,
    decks               VARCHAR(500) NULL,
    observacao          VARCHAR(500) NULL,
    created_by_admin_id UUID         NOT NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_liga_mensal_manual_entries_ano_mes ON liga_mensal_manual_entries (ano, mes);

-- Campeonato: pagamento da inscrição segura a vaga por um prazo. Vencido o
-- prazo sem pagar, a linha continua (o admin ainda cobra ou remove) mas
-- deixa de ocupar vaga. Null em inscricao_expira_em = vaga firme, o que
-- mantém válidas todas as inscrições feitas antes desta regra.
ALTER TABLE championships             ADD COLUMN IF NOT EXISTS minutos_para_pagar  INTEGER     NOT NULL DEFAULT 30;
ALTER TABLE championship_participants ADD COLUMN IF NOT EXISTS inscricao_expira_em TIMESTAMPTZ NULL;

-- Sessões de login: um refresh token por dispositivo. Antes o token morava
-- numa coluna única do usuário, então entrar no celular derrubava o PDV e
-- duas abas renovando juntas derrubavam as duas — era o logout automático.
CREATE TABLE IF NOT EXISTS user_sessions (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   VARCHAR(64)  NOT NULL,
    expires_at   TIMESTAMPTZ  NOT NULL,
    rotated_at   TIMESTAMPTZ  NULL,
    revoked_at   TIMESTAMPTZ  NULL,
    user_agent   VARCHAR(300) NULL,
    ip_address   VARCHAR(45)  NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_user_sessions_token_hash ON user_sessions (token_hash);
CREATE INDEX IF NOT EXISTS ix_user_sessions_user             ON user_sessions (user_id);

-- Migra quem já estava logado: o token da coluna antiga vira a primeira
-- sessão, então ninguém precisa relogar por causa do deploy.
INSERT INTO user_sessions (user_id, token_hash, expires_at, created_at, last_used_at)
SELECT id, refresh_token, refresh_token_expiry, NOW(), NOW()
FROM users
WHERE refresh_token IS NOT NULL
  AND refresh_token_expiry IS NOT NULL
  AND refresh_token_expiry > NOW()
ON CONFLICT (token_hash) DO NOTHING;

-- Liguinha (docs/liguinha.md): torneio suíço em cima do campeonato.
-- Campeonato antigo fica 'Livre' (só colocação final, como sempre foi).
ALTER TABLE championships             ADD COLUMN IF NOT EXISTS formato            VARCHAR(20) NOT NULL DEFAULT 'Livre';
ALTER TABLE championships             ADD COLUMN IF NOT EXISTS codigo_entrada     VARCHAR(8)  NULL;
ALTER TABLE championships             ADD COLUMN IF NOT EXISTS melhor_de          INTEGER     NOT NULL DEFAULT 1;
ALTER TABLE championships             ADD COLUMN IF NOT EXISTS minutos_rodada     INTEGER     NOT NULL DEFAULT 50;
ALTER TABLE championships             ADD COLUMN IF NOT EXISTS numero_rodadas     INTEGER     NULL;
ALTER TABLE championships             ADD COLUMN IF NOT EXISTS rodada_atual       INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE championships             ADD COLUMN IF NOT EXISTS lugares            INTEGER     NOT NULL DEFAULT 24;
-- v1.56.0: Liga (soma na Liga Mensal) × Campeonato (avulso). Os que já existiam ficam Liga, como sempre contaram.
ALTER TABLE championships             ADD COLUMN IF NOT EXISTS modalidade         VARCHAR(20) NOT NULL DEFAULT 'Liga';
ALTER TABLE championship_participants ADD COLUMN IF NOT EXISTS check_in_em        TIMESTAMPTZ NULL;
ALTER TABLE championship_participants ADD COLUMN IF NOT EXISTS desistiu_na_rodada INTEGER     NULL;
ALTER TABLE timers                    ADD COLUMN IF NOT EXISTS championship_id    UUID        NULL
    REFERENCES championships(id) ON DELETE SET NULL;
ALTER TABLE timers                    ADD COLUMN IF NOT EXISTS rodada             INTEGER     NULL;

-- Código de entrada não repete entre campeonatos (null fica livre)
CREATE UNIQUE INDEX IF NOT EXISTS ux_championships_codigo_entrada
    ON championships (codigo_entrada) WHERE codigo_entrada IS NOT NULL;

CREATE TABLE IF NOT EXISTS torneio_rodadas (
    id              UUID        PRIMARY KEY,
    championship_id UUID        NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
    numero          INTEGER     NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'Aberta',
    iniciada_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fechada_em      TIMESTAMPTZ NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_torneio_rodadas_numero ON torneio_rodadas (championship_id, numero);
-- Quando o relógio da rodada foi ligado (a rodada está em jogo mesmo se o relógio for zerado) — v1.66.2
ALTER TABLE torneio_rodadas ADD COLUMN IF NOT EXISTS comecada_em TIMESTAMPTZ NULL;
-- Rodada que já estava em jogo quando a marca nasceu (relógio dela fora de "parado" = state 0):
-- marca agora, senão o primeiro "Parar alarme" depois do deploy voltava a esconder o Venci/Perdi
UPDATE torneio_rodadas r SET comecada_em = COALESCE(t.started_at, NOW())
  FROM timers t
 WHERE r.comecada_em IS NULL AND t.championship_id = r.championship_id AND t.rodada = r.numero AND t.state <> 0;

CREATE TABLE IF NOT EXISTS torneio_partidas (
    id                     UUID         PRIMARY KEY,
    rodada_id              UUID         NOT NULL REFERENCES torneio_rodadas(id) ON DELETE CASCADE,
    mesa                   INTEGER      NOT NULL,
    participante_a_id      UUID         NOT NULL REFERENCES championship_participants(id) ON DELETE CASCADE,
    participante_b_id      UUID         NULL     REFERENCES championship_participants(id) ON DELETE CASCADE,
    deck_a_id              UUID         NULL,
    deck_a_nome            VARCHAR(200) NULL,
    deck_b_id              UUID         NULL,
    deck_b_nome            VARCHAR(200) NULL,
    report_a               VARCHAR(20)  NULL,
    report_b               VARCHAR(20)  NULL,
    resultado              VARCHAR(20)  NULL,
    vitorias_a             INTEGER      NOT NULL DEFAULT 0,
    vitorias_b             INTEGER      NOT NULL DEFAULT 0,
    resolvido_por_admin_id UUID         NULL,
    fechada_em             TIMESTAMPTZ  NULL
);
CREATE INDEX IF NOT EXISTS ix_torneio_partidas_rodada ON torneio_partidas (rodada_id);
-- "Estou pronto" de cada lado da mesa (v1.61.0)
ALTER TABLE torneio_partidas ADD COLUMN IF NOT EXISTS pronto_a_em TIMESTAMPTZ NULL;
ALTER TABLE torneio_partidas ADD COLUMN IF NOT EXISTS pronto_b_em TIMESTAMPTZ NULL;

-- Bloqueio de conta por senha errada (Services/Implementations/ProtecaoLogin.cs)
ALTER TABLE users ADD COLUMN IF NOT EXISTS falhas_login        INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_bloqueado_ate TIMESTAMPTZ NULL;

-- Pokémon preferido do perfil (v1.65.0): id do sprite do Showdown + versão brilhante
ALTER TABLE users ADD COLUMN IF NOT EXISTS pokemon_favorito       VARCHAR(45) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pokemon_favorito_shiny BOOLEAN     NOT NULL DEFAULT FALSE;

-- Entrar com Google (Services/Implementations/LoginGoogle.cs): uma conta Google por usuário
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(64) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL;

-- Chaves de funcionalidade (Configuration/Funcionalidades.cs): só guarda as que o
-- dono mudou à mão em /admin/funcionalidades; sem linha, vale o padrão do catálogo.
CREATE TABLE IF NOT EXISTS funcionalidades (
    codigo          VARCHAR(60) PRIMARY KEY,
    ligada          BOOLEAN     NOT NULL,
    alterada_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    alterada_por_id UUID        NULL
);

-- Vigia do sistema (Services/Vigia): alertas dos gatilhos e erros de tela (v1.63.0)
CREATE TABLE IF NOT EXISTS alertas_sistema (
    id            UUID          PRIMARY KEY,
    codigo        VARCHAR(60)   NOT NULL,
    chave         VARCHAR(200)  NOT NULL,
    gravidade     VARCHAR(10)   NOT NULL,
    titulo        VARCHAR(200)  NOT NULL,
    detalhe       VARCHAR(2000) NOT NULL,
    link          VARCHAR(300)  NULL,
    ocorrencias   INTEGER       NOT NULL DEFAULT 1,
    criado_em     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    ultima_vez_em TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    resolvido_em  TIMESTAMPTZ   NULL,
    resolvido_por VARCHAR(120)  NULL
);
CREATE INDEX IF NOT EXISTS ix_alertas_sistema_abertos ON alertas_sistema (codigo, chave) WHERE resolvido_em IS NULL;
CREATE INDEX IF NOT EXISTS ix_alertas_sistema_ultima ON alertas_sistema (ultima_vez_em DESC);

-- "Rodou por último em…" de coisas fora da API (deploy/backup.sh grava "backup-diario") (v1.64.1)
CREATE TABLE IF NOT EXISTS marcos_operacao (
    chave   VARCHAR(60)  PRIMARY KEY,
    quando  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    detalhe VARCHAR(500) NULL
);
