# Dicionário de dados — Santuário Nerd (PostgreSQL)

> Gerado do banco real por `scripts/gerar-modelo-dados.py`. Para cada tabela: finalidade, colunas (tipo, nulo, padrão, chave) e índices.

## Índice

- **Acesso e identidade**: [`users`](#users), [`perfis`](#perfis), [`user_sessions`](#user_sessions), [`cookie_consents`](#cookie_consents), [`lgpd_requests`](#lgpd_requests), [`push_subscriptions`](#push_subscriptions), [`notifications`](#notifications)
- **Catálogo e estoque**: [`product_categories`](#product_categories), [`products`](#products), [`product_variants`](#product_variants), [`product_waitlist`](#product_waitlist)
- **Comanda, reservas e pagamentos**: [`comandas`](#comandas), [`comanda_items`](#comanda_items), [`product_reservations`](#product_reservations), [`pix_cobrancas`](#pix_cobrancas), [`external_transactions`](#external_transactions), [`integration_configs`](#integration_configs)
- **Crediário**: [`crediarios`](#crediarios), [`crediario_lancamentos`](#crediario_lancamentos), [`pagamentos_crediario`](#pagamentos_crediario), [`crediario_avisos`](#crediario_avisos), [`crediario_aviso_config`](#crediario_aviso_config)
- **Campeonatos, Liga e torneios**: [`championships`](#championships), [`championship_participants`](#championship_participants), [`championship_preinscricoes`](#championship_preinscricoes), [`torneio_rodadas`](#torneio_rodadas), [`torneio_partidas`](#torneio_partidas), [`decks`](#decks), [`timers`](#timers), [`liga_mensal_manual_entries`](#liga_mensal_manual_entries)
- **Mercado de cartas**: [`card_listings`](#card_listings), [`listing_interests`](#listing_interests)
- **Sistema e operação**: [`audit_logs`](#audit_logs), [`alertas_sistema`](#alertas_sistema), [`announcements`](#announcements), [`funcionalidades`](#funcionalidades), [`marcos_operacao`](#marcos_operacao), [`site_config`](#site_config), [`app_migrations`](#app_migrations)

## Acesso e identidade

### users

Pessoas que usam o sistema (cliente, operador ou administrador): dados de contato, senha com hash, pontos, saldo e Pokémon preferido.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `name` | varchar(150) | não |  |  |
| `email` | varchar(255) | sim |  | único |
| `password_hash` | text | sim |  |  |
| `whatsapp` | varchar(20) | sim |  |  |
| `cpf` | varchar(11) | sim |  | único |
| `profile_image_url` | varchar(500) | sim |  |  |
| `pokemon_favorito` | varchar(45) | sim |  |  |
| `pokemon_favorito_shiny` | bool | não |  |  |
| `role` | varchar(20) | não |  |  |
| `refresh_token` | text | sim |  |  |
| `refresh_token_expiry` | timestamptz | sim |  |  |
| `password_reset_token` | text | sim |  |  |
| `password_reset_token_expiry` | timestamptz | sim |  |  |
| `google_sub` | varchar(64) | sim |  | único |
| `falhas_login` | int | não |  |  |
| `login_bloqueado_ate` | timestamptz | sim |  |  |
| `points_balance` | int | não |  |  |
| `points_expires_at` | timestamptz | sim |  |  |
| `balance_in_cents` | int | não |  |  |
| `preferences_json` | text | sim |  |  |
| `created_at` | timestamptz | não |  |  |
| `updated_at` | timestamptz | não |  |  |
| `is_active` | bool | não |  |  |
| `deleted_at` | timestamptz | sim |  |  |
| `consent_at` | timestamptz | sim |  |  |
| `perfil_id` | uuid | sim |  | FK → `perfis.id` (set null) |

Índices:

- `IX_users_perfil_id` — (perfil_id)
- `PK_users` — único · (id)
- `ix_users_cpf` — único · (cpf) WHERE (cpf IS NOT NULL)
- `ix_users_email` — único · (email) WHERE (email IS NOT NULL)
- `ix_users_whatsapp` — (whatsapp)
- `ux_users_cpf_digitos` — único · (regexp_replace((cpf)::text, '\D'::text, ''::text, 'g'::text)) WHERE (cpf IS NOT NULL)
- `ux_users_email_lower` — único · (lower((email)::text)) WHERE (email IS NOT NULL)
- `ux_users_google_sub` — único · (google_sub) WHERE (google_sub IS NOT NULL)

### perfis

Perfis de permissão da equipe (quais telas e ações cada operador pode usar).

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `nome` | varchar(100) | não |  |  |
| `permissoes_json` | text | não |  |  |
| `criado_por_admin_id` | uuid | não |  |  |
| `criado_em` | timestamptz | não |  |  |
| `atualizado_em` | timestamptz | não |  |  |

Índices:

- `PK_perfis` — único · (id)
- `ix_perfis_nome` — (nome)

### user_sessions

Sessões de login (refresh token com rotação), por dispositivo.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `user_id` | uuid | não |  | FK → `users.id` (cascade) |
| `token_hash` | varchar(64) | não |  | único |
| `expires_at` | timestamptz | não |  |  |
| `rotated_at` | timestamptz | sim |  |  |
| `revoked_at` | timestamptz | sim |  |  |
| `user_agent` | varchar(300) | sim |  |  |
| `ip_address` | varchar(45) | sim |  |  |
| `created_at` | timestamptz | não |  |  |
| `last_used_at` | timestamptz | não |  |  |

Índices:

- `PK_user_sessions` — único · (id)
- `ix_user_sessions_token_hash` — único · (token_hash)
- `ix_user_sessions_user` — (user_id)

### cookie_consents

Registro do consentimento de cookies (LGPD), com a escolha feita e a versão do aviso.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | text | não |  | PK; único |
| `user_id` | uuid | sim |  | FK → `users.id` (set null) |
| `ip_hash` | varchar(64) | não |  |  |
| `user_agent` | varchar(500) | não |  |  |
| `accepted` | bool | não |  |  |
| `policy_version` | varchar(10) | não |  |  |
| `consent_at` | timestamptz | não |  |  |

Índices:

- `IX_cookie_consents_user_id` — (user_id)
- `PK_cookie_consents` — único · (id)
- `ix_cookie_consents_consent_at` — (consent_at)

### lgpd_requests

Pedidos do titular de dados (acesso, correção, anonimização) e seu andamento.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | text | não |  | PK; único |
| `user_id` | uuid | sim |  | FK → `users.id` (set null) |
| `requester_name` | varchar(200) | não |  |  |
| `requester_email` | varchar(255) | não |  |  |
| `requester_cpf` | varchar(11) | não |  |  |
| `request_type` | varchar(20) | não |  |  |
| `description` | varchar(2000) | sim |  |  |
| `status` | varchar(15) | não |  |  |
| `admin_response` | varchar(4000) | sim |  |  |
| `created_at` | timestamptz | não |  |  |
| `responded_at` | timestamptz | sim |  |  |
| `deadline` | timestamptz | não |  |  |
| `anexo_nome` | varchar(255) | sim |  |  |
| `anexo_dados` | bytea | sim |  |  |

Índices:

- `IX_lgpd_requests_user_id` — (user_id)
- `PK_lgpd_requests` — único · (id)
- `ix_lgpd_requests_email` — (requester_email)
- `ix_lgpd_requests_status` — (status)

### push_subscriptions

Inscrições de notificação Web Push de cada navegador/aparelho.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `user_id` | uuid | não |  | FK → `users.id` (cascade) |
| `endpoint` | varchar(600) | não |  | único |
| `p256dh` | varchar(300) | não |  |  |
| `auth` | varchar(150) | não |  |  |
| `created_at` | timestamptz | não |  |  |

Índices:

- `IX_push_subscriptions_user_id` — (user_id)
- `PK_push_subscriptions` — único · (id)
- `ix_push_subscriptions_endpoint` — único · (endpoint)

### notifications

Notificações dentro do site para cada usuário.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `user_id` | uuid | não |  | FK → `users.id` (cascade) |
| `title` | varchar(120) | não |  |  |
| `body` | varchar(500) | não |  |  |
| `link` | varchar(300) | sim |  |  |
| `image_url` | varchar(500) | sim |  |  |
| `created_at` | timestamptz | não |  |  |
| `read_at` | timestamptz | sim |  |  |

Índices:

- `IX_notifications_user_id` — (user_id)
- `PK_notifications` — único · (id)
- `ix_notifications_user` — (user_id)

## Catálogo e estoque

### product_categories

Categorias de produto, com subcategorias (auto-relacionamento) e desconto Pix próprio.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `name` | varchar(100) | não |  | único |
| `emoji` | varchar(10) | sim |  |  |
| `pix_discount_percent` | decimal | sim |  |  |
| `display_order` | int | não |  |  |
| `is_active` | bool | não |  |  |
| `parent_category_id` | uuid | sim |  | FK → `product_categories.id` (set null) |
| `created_at` | timestamptz | não |  |  |

Índices:

- `PK_product_categories` — único · (id)
- `ix_product_categories_name` — único · (name)
- `ix_product_categories_parent` — (parent_category_id)

### products

Produtos à venda: preço, custo, estoque, promoção, pré-venda, foto e dados de busca.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `name` | varchar(200) | não |  |  |
| `description` | varchar(500) | sim |  |  |
| `category` | varchar(100) | não |  |  |
| `barcode` | varchar(100) | sim |  | único |
| `cost_price_in_cents` | int | não |  |  |
| `price_in_cents` | int | não |  |  |
| `stock_quantity` | int | não |  |  |
| `minimum_stock` | int | não |  |  |
| `image_url` | varchar(500) | sim |  |  |
| `image_urls` | ARRAY | não |  |  |
| `full_description` | text | sim |  |  |
| `is_active` | bool | não |  |  |
| `is_featured` | bool | não |  |  |
| `show_on_site` | bool | não |  |  |
| `show_on_marketplace` | bool | não |  |  |
| `discount_price_in_cents` | int | sim |  |  |
| `is_pre_venda` | bool | não |  |  |
| `max_installments` | int | sim |  |  |
| `pix_discount_percent` | decimal | sim |  |  |
| `has_variants` | bool | não |  |  |
| `created_at` | timestamptz | não |  |  |
| `updated_at` | timestamptz | não |  |  |
| `prevenda_release_date` | date | sim |  |  |

Índices:

- `PK_products` — único · (id)
- `ix_products_barcode` — único · (barcode) WHERE (barcode IS NOT NULL)
- `ix_products_category` — (category)
- `ix_products_is_active` — (is_active)

### product_variants

Variações de um produto (tamanho/cor) com estoque próprio.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `product_id` | uuid | não |  | FK → `products.id` (cascade) |
| `size` | varchar(50) | sim |  |  |
| `color` | varchar(100) | sim |  |  |
| `stock_quantity` | int | não |  |  |
| `price_in_cents` | int | sim |  |  |
| `sku` | varchar(100) | sim |  |  |
| `created_at` | timestamptz | não |  |  |
| `updated_at` | timestamptz | não |  |  |

Índices:

- `IX_product_variants_product_id` — (product_id)
- `PK_product_variants` — único · (id)
- `ix_product_variants_product` — (product_id)

### product_waitlist

Lista de espera de quem quer ser avisado quando um produto voltar ao estoque.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK; único |
| `product_id` | uuid | não |  | FK → `products.id` (cascade) |
| `user_id` | uuid | sim |  | FK → `users.id` (set null) |
| `name` | varchar(150) | não |  |  |
| `whatsapp` | varchar(20) | não |  |  |
| `position` | int | não |  |  |
| `created_at` | timestamptz | não | `now()` |  |
| `notified_at` | timestamptz | sim |  |  |

Índices:

- `ix_product_waitlist_product` — (product_id)
- `ix_product_waitlist_user` — (user_id) WHERE (user_id IS NOT NULL)
- `pk_product_waitlist` — único · (id)

## Comanda, reservas e pagamentos

### comandas

Comanda aberta por mesa/cliente: status, forma de pagamento, desconto, pontos aplicados e estorno.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `user_id` | uuid | não |  | FK → `users.id` (restrict) |
| `table_identifier` | varchar(50) | sim |  |  |
| `status` | text | não |  |  |
| `opened_at` | timestamptz | não |  |  |
| `closed_at` | timestamptz | sim |  |  |
| `payment_method` | varchar(30) | sim |  |  |
| `second_payment_method` | varchar(30) | sim |  |  |
| `second_payment_amount_in_cents` | int | não |  |  |
| `championship_id` | uuid | sim |  | FK → `championships.id` (set null) |
| `total_in_cents` | int | não |  |  |
| `points_applied` | int | não |  |  |
| `discount_in_cents` | int | não |  |  |
| `notes` | varchar(500) | sim |  |  |
| `estornada_em` | timestamptz | sim |  |  |
| `estornada_por_admin_id` | uuid | sim |  |  |
| `motivo_estorno` | varchar(300) | sim |  |  |

Índices:

- `PK_comandas` — único · (id)
- `ix_comandas_championship` — (championship_id)
- `ix_comandas_status` — (status)
- `ix_comandas_user_status` — (user_id, status)

### comanda_items

Itens de uma comanda, com nome e preço guardados no momento da venda (snapshot).

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `comanda_id` | uuid | não |  | FK → `comandas.id` (cascade) |
| `product_id` | uuid | sim |  | FK → `products.id` (restrict) |
| `card_cache_id` | varchar(100) | sim |  |  |
| `variant_id` | uuid | sim |  |  |
| `item_name_snapshot` | varchar(200) | não |  |  |
| `unit_price_in_cents` | int | não |  |  |
| `cost_price_snapshot_in_cents` | int | não |  |  |
| `quantity` | int | não |  |  |
| `subtotal_in_cents` | int | não |  |  |
| `added_at` | timestamptz | não |  |  |
| `added_by_user_id` | uuid | não |  |  |

Índices:

- `IX_comanda_items_product_id` — (product_id)
- `PK_comanda_items` — único · (id)
- `ix_comanda_items_comanda` — (comanda_id)

### product_reservations

Reservas e pré-vendas feitas pelo site, agrupadas por carrinho (grupo de reserva).

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `reservation_group_id` | uuid | não |  |  |
| `user_id` | uuid | não |  | FK → `users.id` (cascade) |
| `product_id` | uuid | não |  | FK → `products.id` (cascade) |
| `variant_id` | uuid | sim |  | FK → `product_variants.id` (no action) |
| `quantity` | int | não |  |  |
| `kind` | varchar(20) | não |  |  |
| `status` | varchar(20) | não |  |  |
| `notes` | varchar(500) | sim |  |  |
| `payment_method` | varchar(20) | sim |  |  |
| `reserved_at` | timestamptz | não |  |  |
| `expires_at` | timestamptz | sim |  |  |
| `fulfilled_at` | timestamptz | sim |  |  |
| `cancelled_at` | timestamptz | sim |  |  |
| `unit_price_in_cents` | int | sim |  |  |
| `venda_avulsa_id` | varchar(80) | sim |  |  |

Índices:

- `IX_product_reservations_product_id` — (product_id)
- `IX_product_reservations_user_id` — (user_id)
- `IX_product_reservations_variant_id` — (variant_id)
- `PK_product_reservations` — único · (id)
- `ix_product_reservations_group` — (reservation_group_id)
- `ix_product_reservations_kind` — (kind)
- `ix_product_reservations_product` — (product_id)
- `ix_product_reservations_status` — (status)
- `ix_product_reservations_user` — (user_id)

### pix_cobrancas

Cobranças Pix geradas (comanda, pedido do site, crediário ou inscrição em torneio) e sua situação.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `origem` | text | não |  |  |
| `crediario_id` | uuid | sim |  | FK → `crediarios.id` (cascade) |
| `comanda_id` | uuid | sim |  | FK → `comandas.id` (cascade) |
| `venda_avulsa_id` | varchar(50) | sim |  |  |
| `championship_participant_id` | uuid | sim |  | FK → `championship_participants.id` (no action) |
| `reservation_group_id` | uuid | sim |  |  |
| `reservation_item_ids` | text | sim |  |  |
| `tx_id` | varchar(35) | não |  | único |
| `valor_em_centavos` | int | não |  |  |
| `desconto_em_centavos` | int | sim |  |  |
| `status` | varchar(40) | não |  |  |
| `pix_copia_cola` | text | sim |  |  |
| `imagem_qrcode` | text | sim |  |  |
| `nome_devedor` | varchar(200) | sim |  |  |
| `crediario_ids_json` | text | sim |  |  |
| `criado_por_admin_id` | uuid | não |  |  |
| `criado_em` | timestamptz | não |  |  |
| `expira_em` | timestamptz | sim |  |  |
| `pago_em` | timestamptz | sim |  |  |

Índices:

- `IX_pix_cobrancas_championship_participant_id` — (championship_participant_id)
- `PK_pix_cobrancas` — único · (id)
- `ix_pix_cobrancas_comanda` — (comanda_id)
- `ix_pix_cobrancas_crediario` — (crediario_id)
- `ix_pix_cobrancas_reservation_group` — (reservation_group_id)
- `ix_pix_cobrancas_tx_id` — único · (tx_id)

### external_transactions

Lançamentos financeiros de fonte externa ou manual (receitas e despesas).

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `source` | varchar(30) | não |  |  |
| `external_id` | varchar(200) | sim |  |  |
| `type` | varchar(10) | não |  |  |
| `amount` | numeric(10,2) | não |  |  |
| `description` | varchar(500) | não |  |  |
| `due_date` | timestamptz | sim |  |  |
| `paid_at` | timestamptz | sim |  |  |
| `status` | varchar(20) | não |  |  |
| `category` | varchar(100) | sim |  |  |
| `supplier` | varchar(200) | sim |  |  |
| `nfe_key` | varchar(44) | sim |  |  |
| `notes` | varchar(2000) | sim |  |  |
| `created_at` | timestamptz | não |  |  |
| `updated_at` | timestamptz | não |  |  |

Índices:

- `PK_external_transactions` — único · (id)
- `ix_ext_tx_source_external_id` — único · (source, external_id) WHERE (external_id IS NOT NULL)

### integration_configs

Credenciais e dados de integração bancária (Pix) e sua última sincronização.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `source` | varchar(30) | não |  |  |
| `access_token` | varchar(2000) | sim |  |  |
| `refresh_token` | varchar(2000) | sim |  |  |
| `client_id` | varchar(200) | sim |  |  |
| `client_secret` | varchar(200) | sim |  |  |
| `expires_at` | timestamptz | sim |  |  |
| `is_active` | bool | não |  |  |
| `cnpj` | varchar(18) | sim |  |  |
| `pix_key` | varchar(100) | sim |  |  |
| `last_sync_at` | timestamptz | sim |  |  |
| `created_at` | timestamptz | não |  |  |
| `updated_at` | timestamptz | não |  |  |

Índices:

- `PK_integration_configs` — único · (id)

## Crediário

### crediarios

Conta de crediário de um cliente: valor, vencimento, situação e origem.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `user_id` | uuid | não |  | FK → `users.id` (restrict) |
| `comanda_id` | uuid | sim |  | FK → `comandas.id` (restrict) |
| `valor_em_centavos` | int | não |  |  |
| `valor_pago_em_centavos` | int | não |  |  |
| `data_abertura` | timestamptz | não |  |  |
| `data_vencimento` | timestamptz | não |  |  |
| `data_pagamento` | timestamptz | sim |  |  |
| `status` | text | não |  |  |
| `observacao` | varchar(500) | sim |  |  |
| `aberto_por_admin_id` | uuid | não |  |  |
| `pago_por_admin_id` | uuid | sim |  |  |
| `pagamento_token` | varchar(64) | sim |  | único |
| `itens_json` | text | sim |  |  |

Índices:

- `IX_crediarios_comanda_id` — (comanda_id)
- `PK_crediarios` — único · (id)
- `ix_crediarios_status` — (status)
- `ix_crediarios_user_status` — (user_id, status)
- `ux_crediarios_pagamento_token` — único · (pagamento_token) WHERE (pagamento_token IS NOT NULL)

### crediario_lancamentos

Lançamentos (compras fiado) que compõem a conta do crediário.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `crediario_id` | uuid | não |  | FK → `crediarios.id` (cascade) |
| `origem` | varchar(20) | não |  |  |
| `comanda_id` | uuid | sim |  |  |
| `venda_avulsa_id` | varchar(50) | sim |  |  |
| `valor_em_centavos` | int | não |  |  |
| `itens_json` | text | sim |  |  |
| `descricao` | varchar(500) | sim |  |  |
| `created_at` | timestamptz | não |  |  |
| `estornado_em` | timestamptz | sim |  |  |

Índices:

- `PK_crediario_lancamentos` — único · (id)
- `ix_crediario_lancamentos_comanda` — (comanda_id)
- `ix_crediario_lancamentos_crediario` — (crediario_id)
- `ix_crediario_lancamentos_venda` — (venda_avulsa_id)

### pagamentos_crediario

Pagamentos (baixas) feitos contra uma conta de crediário.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `crediario_id` | uuid | não |  | FK → `crediarios.id` (restrict) |
| `valor_em_centavos` | int | não |  |  |
| `forma_pagamento` | varchar(50) | não |  |  |
| `observacao` | varchar(500) | sim |  |  |
| `admin_id` | uuid | não |  |  |
| `created_at` | timestamptz | não |  |  |

Índices:

- `PK_pagamentos_crediario` — único · (id)
- `ix_pagamentos_crediario_created_at` — (created_at)
- `ix_pagamentos_crediario_crediario` — (crediario_id)

### crediario_avisos

Avisos de cobrança enviados ao cliente por conta de crediário.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `crediario_id` | uuid | não |  | FK → `crediarios.id` (cascade) |
| `marco` | int | sim |  |  |
| `vencimento_referencia` | timestamptz | não |  |  |
| `canais` | varchar(60) | não |  |  |
| `falhas` | varchar(500) | sim |  |  |
| `enviado_por_admin_id` | uuid | sim |  |  |
| `enviado_em` | timestamptz | não |  |  |

Índices:

- `PK_crediario_avisos` — único · (id)
- `ix_crediario_avisos_crediario` — (crediario_id)
- `ux_crediario_avisos_marco` — único · (crediario_id, marco, vencimento_referencia) WHERE (marco IS NOT NULL)

### crediario_aviso_config

Configuração dos avisos automáticos de crediário (horário, marcos, canais).

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `ativo` | bool | não |  |  |
| `hora_envio` | int | não |  |  |
| `marcos_json` | text | não |  |  |
| `canal_app` | bool | não |  |  |
| `canal_email` | bool | não |  |  |
| `resumo_admin` | bool | não |  |  |
| `mensagem_extra` | varchar(300) | sim |  |  |
| `ultimo_resumo_em` | timestamptz | sim |  |  |
| `updated_at` | timestamptz | não |  |  |

Índices:

- `PK_crediario_aviso_config` — único · (id)

## Campeonatos, Liga e torneios

### championships

Campeonatos e Liga: jogo, datas, vagas, taxa, modalidade, formato do torneio e rodada atual.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `name` | varchar(200) | não |  |  |
| `description` | varchar(1000) | sim |  |  |
| `game` | varchar(100) | não |  |  |
| `start_date` | timestamptz | não |  |  |
| `end_date` | timestamptz | sim |  |  |
| `registration_deadline` | timestamptz | sim |  |  |
| `max_participants` | int | sim |  |  |
| `entry_fee_in_cents` | int | não |  |  |
| `minutos_para_pagar` | int | não |  |  |
| `status` | text | não |  |  |
| `formato` | text | não |  |  |
| `modalidade` | varchar(20) | não |  |  |
| `codigo_entrada` | varchar(8) | sim |  | único |
| `melhor_de` | int | não |  |  |
| `minutos_rodada` | int | não |  |  |
| `numero_rodadas` | int | sim |  |  |
| `rodada_atual` | int | não |  |  |
| `lugares` | int | não |  |  |
| `image_url` | varchar(500) | sim |  |  |
| `created_at` | timestamptz | não |  |  |
| `created_by_admin_id` | uuid | não |  |  |
| `podio_json` | varchar(1000) | sim |  |  |

Índices:

- `PK_championships` — único · (id)
- `ix_championships_start_date` — (start_date)
- `ix_championships_status` — (status)
- `ux_championships_codigo_entrada` — único · (codigo_entrada) WHERE (codigo_entrada IS NOT NULL)

### championship_participants

Inscritos em um campeonato (usuário, deck, pagamento, check-in, desistência e colocação).

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `championship_id` | uuid | não |  | FK → `championships.id` (cascade) |
| `user_id` | uuid | não |  | FK → `users.id` (restrict) |
| `player_number` | int | não |  |  |
| `deck_name` | varchar(200) | sim |  |  |
| `deck_id` | uuid | sim |  |  |
| `placement` | int | sim |  |  |
| `registered_at` | timestamptz | não |  |  |
| `entry_fee_paid_at` | timestamptz | sim |  |  |
| `inscricao_expira_em` | timestamptz | sim |  |  |
| `entry_fee_payment_method` | varchar(20) | sim |  |  |
| `comanda_id` | uuid | sim |  | FK → `comandas.id` (set null) |
| `check_in_em` | timestamptz | sim |  |  |
| `desistiu_na_rodada` | int | sim |  |  |

Índices:

- `IX_championship_participants_comanda_id` — (comanda_id)
- `IX_championship_participants_user_id` — (user_id)
- `PK_championship_participants` — único · (id)
- `ix_championship_participants_unique` — único · (championship_id, user_id)

### championship_preinscricoes

Pré-inscrições feitas sem conta, antes da abertura das vagas.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `championship_id` | uuid | não |  | FK → `championships.id` (cascade) |
| `nome` | varchar(200) | não |  |  |
| `whatsapp` | varchar(30) | não |  |  |
| `deck_id` | uuid | sim |  |  |
| `deck_name` | varchar(200) | sim |  |  |
| `is_lista_espera` | bool | não |  |  |
| `created_at` | timestamptz | não |  |  |

Índices:

- `IX_championship_preinscricoes_championship_id` — (championship_id)
- `PK_championship_preinscricoes` — único · (id)

### torneio_rodadas

Rodadas de um torneio suíço (número, início e marca de que começou).

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `championship_id` | uuid | não |  | FK → `championships.id` (cascade) |
| `numero` | int | não |  |  |
| `status` | text | não |  |  |
| `iniciada_em` | timestamptz | não |  |  |
| `fechada_em` | timestamptz | sim |  |  |
| `comecada_em` | timestamptz | sim |  |  |

Índices:

- `PK_torneio_rodadas` — único · (id)
- `ux_torneio_rodadas_numero` — único · (championship_id, numero)

### torneio_partidas

Partidas de uma rodada: dois inscritos, mesa, relatórios de resultado de cada lado e resultado final.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `rodada_id` | uuid | não |  | FK → `torneio_rodadas.id` (cascade) |
| `mesa` | int | não |  |  |
| `participante_a_id` | uuid | não |  | FK → `championship_participants.id` (cascade) |
| `participante_b_id` | uuid | sim |  | FK → `championship_participants.id` (cascade) |
| `deck_a_id` | uuid | sim |  |  |
| `deck_a_nome` | varchar(200) | sim |  |  |
| `deck_b_id` | uuid | sim |  |  |
| `deck_b_nome` | varchar(200) | sim |  |  |
| `report_a` | text | sim |  |  |
| `report_b` | text | sim |  |  |
| `resultado` | text | sim |  |  |
| `vitorias_a` | int | não |  |  |
| `vitorias_b` | int | não |  |  |
| `resolvido_por_admin_id` | uuid | sim |  |  |
| `fechada_em` | timestamptz | sim |  |  |
| `pronto_a_em` | timestamptz | sim |  |  |
| `pronto_b_em` | timestamptz | sim |  |  |

Índices:

- `IX_torneio_partidas_participante_a_id` — (participante_a_id)
- `IX_torneio_partidas_participante_b_id` — (participante_b_id)
- `PK_torneio_partidas` — único · (id)
- `ix_torneio_partidas_rodada` — (rodada_id)

### decks

Decks cadastrados pelos jogadores (nome, jogo e lista de cartas).

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `user_id` | uuid | não |  | FK → `users.id` (cascade) |
| `name` | varchar(100) | não |  |  |
| `game` | varchar(50) | não |  |  |
| `format` | varchar(20) | não |  |  |
| `cards_json` | text | não |  |  |
| `is_public` | bool | não |  |  |
| `created_at` | timestamptz | não |  |  |
| `updated_at` | timestamptz | não |  |  |

Índices:

- `PK_decks` — único · (id)
- `ix_decks_user` — (user_id)
- `ix_decks_user_public` — (user_id, is_public)

### timers

Cronômetros (da rodada e do painel): duração, estado, início e alarme.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `name` | varchar(100) | não |  |  |
| `duration_seconds` | int | não |  |  |
| `paused_remaining` | int | sim |  |  |
| `state` | int | não |  |  |
| `started_at` | timestamptz | sim |  |  |
| `sound_preset` | varchar(50) | não |  |  |
| `warn_at_seconds` | int | não |  |  |
| `championship_id` | uuid | sim |  |  |
| `rodada` | int | sim |  |  |
| `created_at` | timestamptz | não |  |  |
| `updated_at` | timestamptz | não |  |  |

Índices:

- `PK_timers` — único · (id)

### liga_mensal_manual_entries

Pontos da Liga lançados à mão pelo organizador (etapas jogadas fora do sistema).

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `ano` | int | não |  |  |
| `mes` | int | não |  |  |
| `player_name` | varchar(200) | não |  |  |
| `total_points` | int | não |  |  |
| `decks` | varchar(500) | sim |  |  |
| `observacao` | varchar(500) | sim |  |  |
| `created_by_admin_id` | uuid | não |  |  |
| `created_at` | timestamptz | não |  |  |
| `updated_at` | timestamptz | não |  |  |

Índices:

- `PK_liga_mensal_manual_entries` — único · (id)
- `ix_liga_mensal_manual_entries_ano_mes` — (ano, mes)

## Mercado de cartas

### card_listings

Anúncios do Mercado de Cartas (carta, preço, estado e anunciante).

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `user_id` | uuid | não |  | FK → `users.id` (cascade) |
| `card_name` | varchar(200) | não |  |  |
| `card_game` | varchar(100) | sim |  |  |
| `card_image_url` | varchar(500) | sim |  |  |
| `price_in_cents` | int | não |  |  |
| `condition` | varchar(50) | não |  |  |
| `description` | varchar(1000) | sim |  |  |
| `status` | varchar(20) | não |  |  |
| `created_at` | timestamptz | não |  |  |
| `updated_at` | timestamptz | não |  |  |

Índices:

- `IX_card_listings_user_id` — (user_id)
- `PK_card_listings` — único · (id)
- `ix_card_listings_status` — (status)
- `ix_card_listings_user` — (user_id)

### listing_interests

Interessados em um anúncio do Mercado de Cartas.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `listing_id` | uuid | não |  | FK → `card_listings.id` (cascade) |
| `user_id` | uuid | não |  | FK → `users.id` (cascade) |
| `message` | varchar(500) | sim |  |  |
| `share_contact` | bool | não |  |  |
| `created_at` | timestamptz | não |  |  |

Índices:

- `IX_listing_interests_listing_id` — (listing_id)
- `IX_listing_interests_user_id` — (user_id)
- `PK_listing_interests` — único · (id)
- `ix_listing_interests_listing` — (listing_id)
- `ix_listing_interests_user` — (user_id)

## Sistema e operação

### audit_logs

Trilha de auditoria: quem fez o quê, em qual entidade e quando.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | text | não |  | PK; único |
| `actor_user_id` | text | sim |  |  |
| `actor_user_name` | varchar(200) | sim |  |  |
| `action` | varchar(50) | não |  |  |
| `entity_type` | varchar(50) | não |  |  |
| `entity_id` | varchar(100) | sim |  |  |
| `details` | text | sim |  |  |
| `ip_hash` | varchar(64) | não |  |  |
| `created_at` | timestamptz | não |  |  |

Índices:

- `PK_audit_logs` — único · (id)
- `ix_audit_logs_actor` — (actor_user_id)
- `ix_audit_logs_created_at` — (created_at)
- `ix_audit_logs_entity` — (entity_type, entity_id)

### alertas_sistema

Alertas gerados pelo Vigia do sistema, com gravidade e ocorrências.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `codigo` | varchar(60) | não |  |  |
| `chave` | varchar(200) | não |  |  |
| `gravidade` | varchar(10) | não |  |  |
| `titulo` | varchar(200) | não |  |  |
| `detalhe` | varchar(2000) | não |  |  |
| `link` | varchar(300) | sim |  |  |
| `ocorrencias` | int | não |  |  |
| `criado_em` | timestamptz | não |  |  |
| `ultima_vez_em` | timestamptz | não |  |  |
| `resolvido_em` | timestamptz | sim |  |  |
| `resolvido_por` | varchar(120) | sim |  |  |

Índices:

- `PK_alertas_sistema` — único · (id)
- `ix_alertas_sistema_abertos` — (codigo, chave) WHERE (resolvido_em IS NULL)
- `ix_alertas_sistema_ultima` — (ultima_vez_em DESC)

### announcements

Comunicados da loja exibidos no site.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `title` | varchar(200) | não |  |  |
| `body` | varchar(2000) | sim |  |  |
| `image_url` | varchar(500) | sim |  |  |
| `link_url` | varchar(500) | sim |  |  |
| `type` | int | não |  |  |
| `is_active` | bool | não |  |  |
| `expires_at` | timestamptz | sim |  |  |
| `created_at` | timestamptz | não |  |  |
| `updated_at` | timestamptz | não |  |  |
| `created_by_admin_id` | uuid | não |  |  |

Índices:

- `PK_announcements` — único · (id)

### funcionalidades

Chaves de funcionalidade (liga/desliga de recursos novos sem novo deploy).

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `codigo` | varchar(60) | não |  | PK; único |
| `ligada` | bool | não |  |  |
| `alterada_em` | timestamptz | não |  |  |
| `alterada_por_id` | uuid | sim |  |  |

Índices:

- `PK_funcionalidades` — único · (codigo)

### marcos_operacao

Marcos de operação (ex.: último backup diário), usados pelo Vigia.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `chave` | varchar(60) | não |  | PK; único |
| `quando` | timestamptz | não |  |  |
| `detalhe` | varchar(500) | sim |  |  |

Índices:

- `PK_marcos_operacao` — único · (chave)

### site_config

Configuração do site (nome, cores, textos, contatos, imagens) — uma linha só.

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `id` | uuid | não |  | PK; único |
| `site_name` | varchar(100) | não |  |  |
| `hero_subtitle` | varchar(400) | não |  |  |
| `address_line` | varchar(150) | não |  |  |
| `contact_person_name` | varchar(60) | não |  |  |
| `logo_url` | varchar(300) | sim |  |  |
| `favicon_url` | varchar(300) | sim |  |  |
| `pwa_icon_url` | varchar(300) | sim |  |  |
| `hero_image_url` | varchar(300) | sim |  |  |
| `admin_icon_url` | varchar(300) | sim |  |  |
| `hero_eyebrow` | varchar(80) | não |  |  |
| `aviso_topo` | varchar(120) | não |  |  |
| `whatsapp_number` | varchar(20) | não |  |  |
| `contact_email` | varchar(150) | não |  |  |
| `nav_torneios_label` | varchar(40) | não |  |  |
| `nav_produtos_label` | varchar(40) | não |  |  |
| `nav_mercado_label` | varchar(40) | não |  |  |
| `nav_pontos_label` | varchar(40) | não |  |  |
| `nav_liga_label` | varchar(40) | não |  |  |
| `cta_ver_eventos_label` | varchar(40) | não |  |  |
| `cta_ver_torneios_label` | varchar(40) | não |  |  |
| `cta_ver_produtos_label` | varchar(40) | não |  |  |
| `torneios_eyebrow` | varchar(60) | não |  |  |
| `torneios_title` | varchar(80) | não |  |  |
| `produtos_eyebrow` | varchar(60) | não |  |  |
| `produtos_title` | varchar(80) | não |  |  |
| `pontos_eyebrow` | varchar(60) | não |  |  |
| `pontos_title` | varchar(80) | não |  |  |
| `pontos_paragraph` | varchar(400) | não |  |  |
| `color_primary` | varchar(9) | não |  |  |
| `color_accent` | varchar(9) | não |  |  |
| `color_navy` | varchar(9) | não |  |  |
| `color_hero` | varchar(9) | não |  |  |
| `color_background` | varchar(9) | não |  |  |
| `color_card` | varchar(9) | não |  |  |
| `border_radius_style` | varchar(20) | não |  |  |
| `pix_discount_percent` | decimal | não |  |  |
| `max_installments` | int | não |  |  |
| `min_installment_in_cents` | int | não |  |  |
| `updated_at` | timestamptz | não |  |  |

Índices:

- `PK_site_config` — único · (id)

### app_migrations

Controle de ajustes de dados já aplicados na inicialização (para rodar uma vez só).

| Coluna | Tipo | Nulo | Padrão | Chave / referência |
|---|---|:-:|---|---|
| `key` | text | não |  | PK |
| `applied_at` | timestamptz | não | `now()` |  |
