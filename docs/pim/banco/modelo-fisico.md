<!-- Gerado do catálogo do PostgreSQL 16 (banco criado pela API v1.88.0 em banco vazio). Não editar à mão. -->

# Modelo físico (PostgreSQL 16)

O script executável completo é `schema-completo.sql`.

## Usuários e acesso

### perfis

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| nome | character varying(100) | não |  |
| permissoes_json | text | não |  |
| criado_por_admin_id | uuid | não |  |
| criado_em | timestamp with time zone | não |  |
| atualizado_em | timestamp with time zone | não |  |

Restrições:

- `PK_perfis`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX ix_perfis_nome ON perfis USING btree (nome)`

### users

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| name | character varying(150) | não |  |
| email | character varying(255) | sim |  |
| password_hash | text | sim |  |
| whatsapp | character varying(20) | sim |  |
| cpf | character varying(11) | sim |  |
| profile_image_url | character varying(500) | sim |  |
| pokemon_favorito | character varying(45) | sim |  |
| pokemon_favorito_shiny | boolean | não |  |
| role | character varying(20) | não |  |
| refresh_token | text | sim |  |
| refresh_token_expiry | timestamp with time zone | sim |  |
| password_reset_token | text | sim |  |
| password_reset_token_expiry | timestamp with time zone | sim |  |
| google_sub | character varying(64) | sim |  |
| falhas_login | integer | não |  |
| login_bloqueado_ate | timestamp with time zone | sim |  |
| points_balance | integer | não |  |
| points_expires_at | timestamp with time zone | sim |  |
| balance_in_cents | integer | não |  |
| preferences_json | text | sim |  |
| created_at | timestamp with time zone | não |  |
| updated_at | timestamp with time zone | não |  |
| is_active | boolean | não |  |
| deleted_at | timestamp with time zone | sim |  |
| consent_at | timestamp with time zone | sim |  |
| perfil_id | uuid | sim |  |

Restrições:

- `FK_users_perfis_perfil_id`: FOREIGN KEY (perfil_id) REFERENCES perfis(id) ON DELETE SET NULL
- `PK_users`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX "IX_users_perfil_id" ON users USING btree (perfil_id)`
- `CREATE UNIQUE INDEX ix_users_cpf ON users USING btree (cpf) WHERE (cpf IS NOT NULL)`
- `CREATE UNIQUE INDEX ix_users_email ON users USING btree (email) WHERE (email IS NOT NULL)`
- `CREATE INDEX ix_users_whatsapp ON users USING btree (whatsapp)`
- `CREATE UNIQUE INDEX ux_users_cpf_digitos ON users USING btree (regexp_replace((cpf)::text, '\D'::text, ''::text, 'g'::text)) WHERE (cpf IS NOT NULL)`
- `CREATE UNIQUE INDEX ux_users_email_lower ON users USING btree (lower((email)::text)) WHERE (email IS NOT NULL)`
- `CREATE UNIQUE INDEX ux_users_google_sub ON users USING btree (google_sub) WHERE (google_sub IS NOT NULL)`

### user_sessions

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| user_id | uuid | não |  |
| token_hash | character varying(64) | não |  |
| expires_at | timestamp with time zone | não |  |
| rotated_at | timestamp with time zone | sim |  |
| revoked_at | timestamp with time zone | sim |  |
| user_agent | character varying(300) | sim |  |
| ip_address | character varying(45) | sim |  |
| created_at | timestamp with time zone | não |  |
| last_used_at | timestamp with time zone | não |  |

Restrições:

- `FK_user_sessions_users_user_id`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
- `PK_user_sessions`: PRIMARY KEY (id)

Índices:

- `CREATE UNIQUE INDEX ix_user_sessions_token_hash ON user_sessions USING btree (token_hash)`
- `CREATE INDEX ix_user_sessions_user ON user_sessions USING btree (user_id)`

### push_subscriptions

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| user_id | uuid | não |  |
| endpoint | character varying(600) | não |  |
| p256dh | character varying(300) | não |  |
| auth | character varying(150) | não |  |
| created_at | timestamp with time zone | não |  |

Restrições:

- `FK_push_subscriptions_users_user_id`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
- `PK_push_subscriptions`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX "IX_push_subscriptions_user_id" ON push_subscriptions USING btree (user_id)`
- `CREATE UNIQUE INDEX ix_push_subscriptions_endpoint ON push_subscriptions USING btree (endpoint)`

### notifications

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| user_id | uuid | não |  |
| title | character varying(120) | não |  |
| body | character varying(500) | não |  |
| link | character varying(300) | sim |  |
| image_url | character varying(500) | sim |  |
| created_at | timestamp with time zone | não |  |
| read_at | timestamp with time zone | sim |  |

Restrições:

- `FK_notifications_users_user_id`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
- `PK_notifications`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX "IX_notifications_user_id" ON notifications USING btree (user_id)`
- `CREATE INDEX ix_notifications_user ON notifications USING btree (user_id)`

### cookie_consents

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | text | não |  |
| user_id | uuid | sim |  |
| ip_hash | character varying(64) | não |  |
| user_agent | character varying(500) | não |  |
| accepted | boolean | não |  |
| policy_version | character varying(10) | não |  |
| consent_at | timestamp with time zone | não |  |

Restrições:

- `FK_cookie_consents_users_user_id`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
- `PK_cookie_consents`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX "IX_cookie_consents_user_id" ON cookie_consents USING btree (user_id)`
- `CREATE INDEX ix_cookie_consents_consent_at ON cookie_consents USING btree (consent_at)`

### lgpd_requests

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | text | não |  |
| user_id | uuid | sim |  |
| requester_name | character varying(200) | não |  |
| requester_email | character varying(255) | não |  |
| requester_cpf | character varying(11) | não |  |
| request_type | character varying(20) | não |  |
| description | character varying(2000) | sim |  |
| status | character varying(15) | não |  |
| admin_response | character varying(4000) | sim |  |
| created_at | timestamp with time zone | não |  |
| responded_at | timestamp with time zone | sim |  |
| deadline | timestamp with time zone | não |  |
| anexo_nome | character varying(255) | sim |  |
| anexo_dados | bytea | sim |  |

Restrições:

- `FK_lgpd_requests_users_user_id`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
- `PK_lgpd_requests`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX "IX_lgpd_requests_user_id" ON lgpd_requests USING btree (user_id)`
- `CREATE INDEX ix_lgpd_requests_email ON lgpd_requests USING btree (requester_email)`
- `CREATE INDEX ix_lgpd_requests_status ON lgpd_requests USING btree (status)`

### decks

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| user_id | uuid | não |  |
| name | character varying(100) | não |  |
| game | character varying(50) | não |  |
| format | character varying(20) | não |  |
| cards_json | text | não |  |
| is_public | boolean | não |  |
| created_at | timestamp with time zone | não |  |
| updated_at | timestamp with time zone | não |  |

Restrições:

- `FK_decks_users_user_id`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
- `PK_decks`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX ix_decks_user ON decks USING btree (user_id)`
- `CREATE INDEX ix_decks_user_public ON decks USING btree (user_id, is_public)`

## Catálogo e estoque

### product_categories

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| name | character varying(100) | não |  |
| emoji | character varying(10) | sim |  |
| pix_discount_percent | numeric | sim |  |
| display_order | integer | não |  |
| is_active | boolean | não |  |
| parent_category_id | uuid | sim |  |
| created_at | timestamp with time zone | não |  |

Restrições:

- `FK_product_categories_product_categories_parent_category_id`: FOREIGN KEY (parent_category_id) REFERENCES product_categories(id) ON DELETE SET NULL
- `PK_product_categories`: PRIMARY KEY (id)

Índices:

- `CREATE UNIQUE INDEX ix_product_categories_name ON product_categories USING btree (name)`
- `CREATE INDEX ix_product_categories_parent ON product_categories USING btree (parent_category_id)`

### products

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| name | character varying(200) | não |  |
| description | character varying(500) | sim |  |
| category | character varying(100) | não |  |
| barcode | character varying(100) | sim |  |
| cost_price_in_cents | integer | não |  |
| price_in_cents | integer | não |  |
| stock_quantity | integer | não |  |
| minimum_stock | integer | não |  |
| image_url | character varying(500) | sim |  |
| image_urls | text[] | não |  |
| full_description | text | sim |  |
| is_active | boolean | não |  |
| is_featured | boolean | não |  |
| show_on_site | boolean | não |  |
| show_on_marketplace | boolean | não |  |
| discount_price_in_cents | integer | sim |  |
| is_pre_venda | boolean | não |  |
| max_installments | integer | sim |  |
| pix_discount_percent | numeric | sim |  |
| has_variants | boolean | não |  |
| created_at | timestamp with time zone | não |  |
| updated_at | timestamp with time zone | não |  |
| prevenda_release_date | date | sim |  |

Restrições:

- `PK_products`: PRIMARY KEY (id)
- `chk_products_precos`: CHECK (((price_in_cents >= 0) AND (cost_price_in_cents >= 0))) NOT VALID

Índices:

- `CREATE UNIQUE INDEX ix_products_barcode ON products USING btree (barcode) WHERE (barcode IS NOT NULL)`
- `CREATE INDEX ix_products_category ON products USING btree (category)`
- `CREATE INDEX ix_products_is_active ON products USING btree (is_active)`

### product_variants

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| product_id | uuid | não |  |
| size | character varying(50) | sim |  |
| color | character varying(100) | sim |  |
| stock_quantity | integer | não |  |
| price_in_cents | integer | sim |  |
| sku | character varying(100) | sim |  |
| created_at | timestamp with time zone | não |  |
| updated_at | timestamp with time zone | não |  |

Restrições:

- `FK_product_variants_products_product_id`: FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
- `PK_product_variants`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX "IX_product_variants_product_id" ON product_variants USING btree (product_id)`
- `CREATE INDEX ix_product_variants_product ON product_variants USING btree (product_id)`

### product_reservations

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| reservation_group_id | uuid | não |  |
| user_id | uuid | não |  |
| product_id | uuid | não |  |
| variant_id | uuid | sim |  |
| quantity | integer | não |  |
| kind | character varying(20) | não |  |
| status | character varying(20) | não |  |
| notes | character varying(500) | sim |  |
| payment_method | character varying(20) | sim |  |
| reserved_at | timestamp with time zone | não |  |
| expires_at | timestamp with time zone | sim |  |
| fulfilled_at | timestamp with time zone | sim |  |
| cancelled_at | timestamp with time zone | sim |  |
| unit_price_in_cents | integer | sim |  |
| venda_avulsa_id | character varying(80) | sim |  |

Restrições:

- `FK_product_reservations_product_variants_variant_id`: FOREIGN KEY (variant_id) REFERENCES product_variants(id)
- `FK_product_reservations_products_product_id`: FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
- `FK_product_reservations_users_user_id`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
- `PK_product_reservations`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX "IX_product_reservations_product_id" ON product_reservations USING btree (product_id)`
- `CREATE INDEX "IX_product_reservations_user_id" ON product_reservations USING btree (user_id)`
- `CREATE INDEX "IX_product_reservations_variant_id" ON product_reservations USING btree (variant_id)`
- `CREATE INDEX ix_product_reservations_group ON product_reservations USING btree (reservation_group_id)`
- `CREATE INDEX ix_product_reservations_kind ON product_reservations USING btree (kind)`
- `CREATE INDEX ix_product_reservations_product ON product_reservations USING btree (product_id)`
- `CREATE INDEX ix_product_reservations_status ON product_reservations USING btree (status)`
- `CREATE INDEX ix_product_reservations_user ON product_reservations USING btree (user_id)`

### product_waitlist

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não | gen_random_uuid() |
| product_id | uuid | não |  |
| user_id | uuid | sim |  |
| name | character varying(150) | não |  |
| whatsapp | character varying(20) | não |  |
| position | integer | não |  |
| created_at | timestamp with time zone | não | now() |
| notified_at | timestamp with time zone | sim |  |

Restrições:

- `pk_product_waitlist`: PRIMARY KEY (id)
- `product_waitlist_product_id_fkey`: FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
- `product_waitlist_user_id_fkey`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL

Índices:

- `CREATE INDEX ix_product_waitlist_product ON product_waitlist USING btree (product_id)`
- `CREATE INDEX ix_product_waitlist_user ON product_waitlist USING btree (user_id) WHERE (user_id IS NOT NULL)`

### estoque_movimentos

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | bigint | não |  |
| product_id | uuid | não |  |
| variant_id | uuid | sim |  |
| estoque_antes | integer | não |  |
| estoque_depois | integer | não |  |
| delta | integer | sim | (estoque_depois - estoque_antes) |
| origem | character varying(20) | não |  |
| quando | timestamp with time zone | não | now() |

Restrições:

- `estoque_movimentos_pkey`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX ix_estoque_movimentos_produto ON estoque_movimentos USING btree (product_id, quando DESC)`
- `CREATE INDEX ix_estoque_movimentos_quando ON estoque_movimentos USING btree (quando)`

## Vendas e pagamentos

### comandas

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| user_id | uuid | não |  |
| table_identifier | character varying(50) | sim |  |
| status | text | não |  |
| opened_at | timestamp with time zone | não |  |
| closed_at | timestamp with time zone | sim |  |
| payment_method | character varying(30) | sim |  |
| second_payment_method | character varying(30) | sim |  |
| second_payment_amount_in_cents | integer | não |  |
| championship_id | uuid | sim |  |
| total_in_cents | integer | não |  |
| points_applied | integer | não |  |
| discount_in_cents | integer | não |  |
| notes | character varying(500) | sim |  |
| estornada_em | timestamp with time zone | sim |  |
| estornada_por_admin_id | uuid | sim |  |
| motivo_estorno | character varying(300) | sim |  |

Restrições:

- `FK_comandas_championships_championship_id`: FOREIGN KEY (championship_id) REFERENCES championships(id) ON DELETE SET NULL
- `FK_comandas_users_user_id`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
- `PK_comandas`: PRIMARY KEY (id)
- `chk_comandas_status`: CHECK ((status = ANY (ARRAY['Aberta'::text, 'EmAndamento'::text, 'Fechada'::text, 'Cancelada'::text, 'Estornada'::text]))) NOT VALID
- `chk_comandas_valores`: CHECK (((discount_in_cents >= 0) AND (points_applied >= 0))) NOT VALID

Índices:

- `CREATE INDEX ix_comandas_championship ON comandas USING btree (championship_id)`
- `CREATE INDEX ix_comandas_status ON comandas USING btree (status)`
- `CREATE INDEX ix_comandas_user_status ON comandas USING btree (user_id, status)`

### comanda_items

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| comanda_id | uuid | não |  |
| product_id | uuid | sim |  |
| card_cache_id | character varying(100) | sim |  |
| variant_id | uuid | sim |  |
| item_name_snapshot | character varying(200) | não |  |
| unit_price_in_cents | integer | não |  |
| cost_price_snapshot_in_cents | integer | não |  |
| quantity | integer | não |  |
| subtotal_in_cents | integer | não |  |
| added_at | timestamp with time zone | não |  |
| added_by_user_id | uuid | não |  |

Restrições:

- `FK_comanda_items_comandas_comanda_id`: FOREIGN KEY (comanda_id) REFERENCES comandas(id) ON DELETE CASCADE
- `FK_comanda_items_products_product_id`: FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
- `PK_comanda_items`: PRIMARY KEY (id)
- `chk_comanda_items_quantidade`: CHECK ((quantity > 0)) NOT VALID
- `chk_comanda_items_valores`: CHECK (((unit_price_in_cents >= 0) AND (subtotal_in_cents >= 0))) NOT VALID

Índices:

- `CREATE INDEX "IX_comanda_items_product_id" ON comanda_items USING btree (product_id)`
- `CREATE INDEX ix_comanda_items_comanda ON comanda_items USING btree (comanda_id)`

### pix_cobrancas

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| origem | text | não |  |
| crediario_id | uuid | sim |  |
| comanda_id | uuid | sim |  |
| venda_avulsa_id | character varying(50) | sim |  |
| championship_participant_id | uuid | sim |  |
| reservation_group_id | uuid | sim |  |
| reservation_item_ids | text | sim |  |
| tx_id | character varying(35) | não |  |
| valor_em_centavos | integer | não |  |
| desconto_em_centavos | integer | sim |  |
| status | character varying(40) | não |  |
| pix_copia_cola | text | sim |  |
| imagem_qrcode | text | sim |  |
| nome_devedor | character varying(200) | sim |  |
| crediario_ids_json | text | sim |  |
| criado_por_admin_id | uuid | não |  |
| criado_em | timestamp with time zone | não |  |
| expira_em | timestamp with time zone | sim |  |
| pago_em | timestamp with time zone | sim |  |

Restrições:

- `FK_pix_cobrancas_championship_participants_championship_partic~`: FOREIGN KEY (championship_participant_id) REFERENCES championship_participants(id)
- `FK_pix_cobrancas_comandas_comanda_id`: FOREIGN KEY (comanda_id) REFERENCES comandas(id) ON DELETE CASCADE
- `FK_pix_cobrancas_crediarios_crediario_id`: FOREIGN KEY (crediario_id) REFERENCES crediarios(id) ON DELETE CASCADE
- `PK_pix_cobrancas`: PRIMARY KEY (id)
- `chk_pix_cobrancas_valor`: CHECK ((valor_em_centavos >= 0)) NOT VALID

Índices:

- `CREATE INDEX "IX_pix_cobrancas_championship_participant_id" ON pix_cobrancas USING btree (championship_participant_id)`
- `CREATE INDEX ix_pix_cobrancas_comanda ON pix_cobrancas USING btree (comanda_id)`
- `CREATE INDEX ix_pix_cobrancas_crediario ON pix_cobrancas USING btree (crediario_id)`
- `CREATE INDEX ix_pix_cobrancas_reservation_group ON pix_cobrancas USING btree (reservation_group_id)`
- `CREATE UNIQUE INDEX ix_pix_cobrancas_tx_id ON pix_cobrancas USING btree (tx_id)`

### external_transactions

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| source | character varying(30) | não |  |
| external_id | character varying(200) | sim |  |
| type | character varying(10) | não |  |
| amount | numeric(10,2) | não |  |
| description | character varying(500) | não |  |
| due_date | timestamp with time zone | sim |  |
| paid_at | timestamp with time zone | sim |  |
| status | character varying(20) | não |  |
| category | character varying(100) | sim |  |
| supplier | character varying(200) | sim |  |
| nfe_key | character varying(44) | sim |  |
| notes | character varying(2000) | sim |  |
| created_at | timestamp with time zone | não |  |
| updated_at | timestamp with time zone | não |  |

Restrições:

- `PK_external_transactions`: PRIMARY KEY (id)

Índices:

- `CREATE UNIQUE INDEX ix_ext_tx_source_external_id ON external_transactions USING btree (source, external_id) WHERE (external_id IS NOT NULL)`

## Crediário

### crediarios

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| user_id | uuid | não |  |
| comanda_id | uuid | sim |  |
| valor_em_centavos | integer | não |  |
| valor_pago_em_centavos | integer | não |  |
| data_abertura | timestamp with time zone | não |  |
| data_vencimento | timestamp with time zone | não |  |
| data_pagamento | timestamp with time zone | sim |  |
| status | text | não |  |
| observacao | character varying(500) | sim |  |
| aberto_por_admin_id | uuid | não |  |
| pago_por_admin_id | uuid | sim |  |
| pagamento_token | character varying(64) | sim |  |
| itens_json | text | sim |  |

Restrições:

- `FK_crediarios_comandas_comanda_id`: FOREIGN KEY (comanda_id) REFERENCES comandas(id) ON DELETE RESTRICT
- `FK_crediarios_users_user_id`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
- `PK_crediarios`: PRIMARY KEY (id)
- `chk_crediarios_status`: CHECK ((status = ANY (ARRAY['Aberto'::text, 'Pago'::text]))) NOT VALID
- `chk_crediarios_valores`: CHECK (((valor_em_centavos >= 0) AND (valor_pago_em_centavos >= 0))) NOT VALID

Índices:

- `CREATE INDEX "IX_crediarios_comanda_id" ON crediarios USING btree (comanda_id)`
- `CREATE INDEX ix_crediarios_status ON crediarios USING btree (status)`
- `CREATE INDEX ix_crediarios_user_status ON crediarios USING btree (user_id, status)`
- `CREATE UNIQUE INDEX ux_crediarios_pagamento_token ON crediarios USING btree (pagamento_token) WHERE (pagamento_token IS NOT NULL)`

### crediario_lancamentos

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| crediario_id | uuid | não |  |
| origem | character varying(20) | não |  |
| comanda_id | uuid | sim |  |
| venda_avulsa_id | character varying(50) | sim |  |
| valor_em_centavos | integer | não |  |
| itens_json | text | sim |  |
| descricao | character varying(500) | sim |  |
| created_at | timestamp with time zone | não |  |
| estornado_em | timestamp with time zone | sim |  |

Restrições:

- `FK_crediario_lancamentos_crediarios_crediario_id`: FOREIGN KEY (crediario_id) REFERENCES crediarios(id) ON DELETE CASCADE
- `PK_crediario_lancamentos`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX ix_crediario_lancamentos_comanda ON crediario_lancamentos USING btree (comanda_id)`
- `CREATE INDEX ix_crediario_lancamentos_crediario ON crediario_lancamentos USING btree (crediario_id)`
- `CREATE INDEX ix_crediario_lancamentos_venda ON crediario_lancamentos USING btree (venda_avulsa_id)`

### pagamentos_crediario

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| crediario_id | uuid | não |  |
| valor_em_centavos | integer | não |  |
| forma_pagamento | character varying(50) | não |  |
| observacao | character varying(500) | sim |  |
| admin_id | uuid | não |  |
| created_at | timestamp with time zone | não |  |

Restrições:

- `FK_pagamentos_crediario_crediarios_crediario_id`: FOREIGN KEY (crediario_id) REFERENCES crediarios(id) ON DELETE RESTRICT
- `PK_pagamentos_crediario`: PRIMARY KEY (id)
- `chk_pagamentos_crediario_valor`: CHECK ((valor_em_centavos >= 0)) NOT VALID

Índices:

- `CREATE INDEX ix_pagamentos_crediario_created_at ON pagamentos_crediario USING btree (created_at)`
- `CREATE INDEX ix_pagamentos_crediario_crediario ON pagamentos_crediario USING btree (crediario_id)`

### crediario_avisos

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| crediario_id | uuid | não |  |
| marco | integer | sim |  |
| vencimento_referencia | timestamp with time zone | não |  |
| canais | character varying(60) | não |  |
| falhas | character varying(500) | sim |  |
| enviado_por_admin_id | uuid | sim |  |
| enviado_em | timestamp with time zone | não |  |

Restrições:

- `FK_crediario_avisos_crediarios_crediario_id`: FOREIGN KEY (crediario_id) REFERENCES crediarios(id) ON DELETE CASCADE
- `PK_crediario_avisos`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX ix_crediario_avisos_crediario ON crediario_avisos USING btree (crediario_id)`
- `CREATE UNIQUE INDEX ux_crediario_avisos_marco ON crediario_avisos USING btree (crediario_id, marco, vencimento_referencia) WHERE (marco IS NOT NULL)`

### crediario_aviso_config

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| ativo | boolean | não |  |
| hora_envio | integer | não |  |
| marcos_json | text | não |  |
| canal_app | boolean | não |  |
| canal_email | boolean | não |  |
| resumo_admin | boolean | não |  |
| mensagem_extra | character varying(300) | sim |  |
| ultimo_resumo_em | timestamp with time zone | sim |  |
| updated_at | timestamp with time zone | não |  |

Restrições:

- `PK_crediario_aviso_config`: PRIMARY KEY (id)

## Torneios e liga

### championships

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| name | character varying(200) | não |  |
| description | character varying(1000) | sim |  |
| game | character varying(100) | não |  |
| start_date | timestamp with time zone | não |  |
| end_date | timestamp with time zone | sim |  |
| registration_deadline | timestamp with time zone | sim |  |
| max_participants | integer | sim |  |
| entry_fee_in_cents | integer | não |  |
| minutos_para_pagar | integer | não |  |
| status | text | não |  |
| formato | text | não |  |
| modalidade | character varying(20) | não |  |
| codigo_entrada | character varying(8) | sim |  |
| melhor_de | integer | não |  |
| minutos_rodada | integer | não |  |
| numero_rodadas | integer | sim |  |
| rodada_atual | integer | não |  |
| lugares | integer | não |  |
| image_url | character varying(500) | sim |  |
| created_at | timestamp with time zone | não |  |
| created_by_admin_id | uuid | não |  |
| podio_json | character varying(1000) | sim |  |

Restrições:

- `PK_championships`: PRIMARY KEY (id)
- `chk_championships_status`: CHECK ((status = ANY (ARRAY['Planejado'::text, 'Inscricoes'::text, 'EmAndamento'::text, 'Finalizado'::text, 'Cancelado'::text]))) NOT VALID

Índices:

- `CREATE INDEX ix_championships_start_date ON championships USING btree (start_date)`
- `CREATE INDEX ix_championships_status ON championships USING btree (status)`
- `CREATE UNIQUE INDEX ux_championships_codigo_entrada ON championships USING btree (codigo_entrada) WHERE (codigo_entrada IS NOT NULL)`

### championship_participants

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| championship_id | uuid | não |  |
| user_id | uuid | não |  |
| player_number | integer | não |  |
| deck_name | character varying(200) | sim |  |
| deck_id | uuid | sim |  |
| placement | integer | sim |  |
| registered_at | timestamp with time zone | não |  |
| entry_fee_paid_at | timestamp with time zone | sim |  |
| inscricao_expira_em | timestamp with time zone | sim |  |
| entry_fee_payment_method | character varying(20) | sim |  |
| comanda_id | uuid | sim |  |
| check_in_em | timestamp with time zone | sim |  |
| desistiu_na_rodada | integer | sim |  |

Restrições:

- `FK_championship_participants_championships_championship_id`: FOREIGN KEY (championship_id) REFERENCES championships(id) ON DELETE CASCADE
- `FK_championship_participants_comandas_comanda_id`: FOREIGN KEY (comanda_id) REFERENCES comandas(id) ON DELETE SET NULL
- `FK_championship_participants_users_user_id`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
- `PK_championship_participants`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX "IX_championship_participants_comanda_id" ON championship_participants USING btree (comanda_id)`
- `CREATE INDEX "IX_championship_participants_user_id" ON championship_participants USING btree (user_id)`
- `CREATE UNIQUE INDEX ix_championship_participants_unique ON championship_participants USING btree (championship_id, user_id)`

### championship_preinscricoes

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| championship_id | uuid | não |  |
| nome | character varying(200) | não |  |
| whatsapp | character varying(30) | não |  |
| deck_id | uuid | sim |  |
| deck_name | character varying(200) | sim |  |
| is_lista_espera | boolean | não |  |
| created_at | timestamp with time zone | não |  |

Restrições:

- `FK_championship_preinscricoes_championships_championship_id`: FOREIGN KEY (championship_id) REFERENCES championships(id) ON DELETE CASCADE
- `PK_championship_preinscricoes`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX "IX_championship_preinscricoes_championship_id" ON championship_preinscricoes USING btree (championship_id)`

### torneio_rodadas

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| championship_id | uuid | não |  |
| numero | integer | não |  |
| status | text | não |  |
| iniciada_em | timestamp with time zone | não |  |
| fechada_em | timestamp with time zone | sim |  |
| comecada_em | timestamp with time zone | sim |  |

Restrições:

- `FK_torneio_rodadas_championships_championship_id`: FOREIGN KEY (championship_id) REFERENCES championships(id) ON DELETE CASCADE
- `PK_torneio_rodadas`: PRIMARY KEY (id)
- `chk_torneio_rodadas_status`: CHECK ((status = ANY (ARRAY['Aberta'::text, 'Fechada'::text]))) NOT VALID

Índices:

- `CREATE UNIQUE INDEX ux_torneio_rodadas_numero ON torneio_rodadas USING btree (championship_id, numero)`

### torneio_partidas

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| rodada_id | uuid | não |  |
| mesa | integer | não |  |
| participante_a_id | uuid | não |  |
| participante_b_id | uuid | sim |  |
| deck_a_id | uuid | sim |  |
| deck_a_nome | character varying(200) | sim |  |
| deck_b_id | uuid | sim |  |
| deck_b_nome | character varying(200) | sim |  |
| report_a | text | sim |  |
| report_b | text | sim |  |
| resultado | text | sim |  |
| vitorias_a | integer | não |  |
| vitorias_b | integer | não |  |
| resolvido_por_admin_id | uuid | sim |  |
| fechada_em | timestamp with time zone | sim |  |
| pronto_a_em | timestamp with time zone | sim |  |
| pronto_b_em | timestamp with time zone | sim |  |

Restrições:

- `FK_torneio_partidas_championship_participants_participante_a_id`: FOREIGN KEY (participante_a_id) REFERENCES championship_participants(id) ON DELETE CASCADE
- `FK_torneio_partidas_championship_participants_participante_b_id`: FOREIGN KEY (participante_b_id) REFERENCES championship_participants(id) ON DELETE CASCADE
- `FK_torneio_partidas_torneio_rodadas_rodada_id`: FOREIGN KEY (rodada_id) REFERENCES torneio_rodadas(id) ON DELETE CASCADE
- `PK_torneio_partidas`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX "IX_torneio_partidas_participante_a_id" ON torneio_partidas USING btree (participante_a_id)`
- `CREATE INDEX "IX_torneio_partidas_participante_b_id" ON torneio_partidas USING btree (participante_b_id)`
- `CREATE INDEX ix_torneio_partidas_rodada ON torneio_partidas USING btree (rodada_id)`

### timers

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| name | character varying(100) | não |  |
| duration_seconds | integer | não |  |
| paused_remaining | integer | sim |  |
| state | integer | não |  |
| started_at | timestamp with time zone | sim |  |
| sound_preset | character varying(50) | não |  |
| warn_at_seconds | integer | não |  |
| championship_id | uuid | sim |  |
| rodada | integer | sim |  |
| created_at | timestamp with time zone | não |  |
| updated_at | timestamp with time zone | não |  |

Restrições:

- `PK_timers`: PRIMARY KEY (id)

### liga_mensal_manual_entries

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| ano | integer | não |  |
| mes | integer | não |  |
| player_name | character varying(200) | não |  |
| total_points | integer | não |  |
| decks | character varying(500) | sim |  |
| observacao | character varying(500) | sim |  |
| created_by_admin_id | uuid | não |  |
| created_at | timestamp with time zone | não |  |
| updated_at | timestamp with time zone | não |  |

Restrições:

- `PK_liga_mensal_manual_entries`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX ix_liga_mensal_manual_entries_ano_mes ON liga_mensal_manual_entries USING btree (ano, mes)`

## Vitrine de cartas

### card_listings

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| user_id | uuid | não |  |
| card_name | character varying(200) | não |  |
| card_game | character varying(100) | sim |  |
| card_image_url | character varying(500) | sim |  |
| price_in_cents | integer | não |  |
| condition | character varying(50) | não |  |
| description | character varying(1000) | sim |  |
| status | character varying(20) | não |  |
| created_at | timestamp with time zone | não |  |
| updated_at | timestamp with time zone | não |  |

Restrições:

- `FK_card_listings_users_user_id`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
- `PK_card_listings`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX "IX_card_listings_user_id" ON card_listings USING btree (user_id)`
- `CREATE INDEX ix_card_listings_status ON card_listings USING btree (status)`
- `CREATE INDEX ix_card_listings_user ON card_listings USING btree (user_id)`

### listing_interests

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| listing_id | uuid | não |  |
| user_id | uuid | não |  |
| message | character varying(500) | sim |  |
| share_contact | boolean | não |  |
| created_at | timestamp with time zone | não |  |

Restrições:

- `FK_listing_interests_card_listings_listing_id`: FOREIGN KEY (listing_id) REFERENCES card_listings(id) ON DELETE CASCADE
- `FK_listing_interests_users_user_id`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
- `PK_listing_interests`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX "IX_listing_interests_listing_id" ON listing_interests USING btree (listing_id)`
- `CREATE INDEX "IX_listing_interests_user_id" ON listing_interests USING btree (user_id)`
- `CREATE INDEX ix_listing_interests_listing ON listing_interests USING btree (listing_id)`
- `CREATE INDEX ix_listing_interests_user ON listing_interests USING btree (user_id)`

## Administração e operação

### announcements

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| title | character varying(200) | não |  |
| body | character varying(2000) | sim |  |
| image_url | character varying(500) | sim |  |
| link_url | character varying(500) | sim |  |
| type | integer | não |  |
| is_active | boolean | não |  |
| expires_at | timestamp with time zone | sim |  |
| created_at | timestamp with time zone | não |  |
| updated_at | timestamp with time zone | não |  |
| created_by_admin_id | uuid | não |  |

Restrições:

- `PK_announcements`: PRIMARY KEY (id)

### site_config

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| site_name | character varying(100) | não |  |
| hero_subtitle | character varying(400) | não |  |
| address_line | character varying(150) | não |  |
| contact_person_name | character varying(60) | não |  |
| logo_url | character varying(300) | sim |  |
| favicon_url | character varying(300) | sim |  |
| pwa_icon_url | character varying(300) | sim |  |
| hero_image_url | character varying(300) | sim |  |
| admin_icon_url | character varying(300) | sim |  |
| hero_eyebrow | character varying(80) | não |  |
| aviso_topo | character varying(120) | não |  |
| whatsapp_number | character varying(20) | não |  |
| contact_email | character varying(150) | não |  |
| nav_torneios_label | character varying(40) | não |  |
| nav_produtos_label | character varying(40) | não |  |
| nav_mercado_label | character varying(40) | não |  |
| nav_pontos_label | character varying(40) | não |  |
| nav_liga_label | character varying(40) | não |  |
| cta_ver_eventos_label | character varying(40) | não |  |
| cta_ver_torneios_label | character varying(40) | não |  |
| cta_ver_produtos_label | character varying(40) | não |  |
| torneios_eyebrow | character varying(60) | não |  |
| torneios_title | character varying(80) | não |  |
| produtos_eyebrow | character varying(60) | não |  |
| produtos_title | character varying(80) | não |  |
| pontos_eyebrow | character varying(60) | não |  |
| pontos_title | character varying(80) | não |  |
| pontos_paragraph | character varying(400) | não |  |
| color_primary | character varying(9) | não |  |
| color_accent | character varying(9) | não |  |
| color_navy | character varying(9) | não |  |
| color_hero | character varying(9) | não |  |
| color_background | character varying(9) | não |  |
| color_card | character varying(9) | não |  |
| border_radius_style | character varying(20) | não |  |
| pix_discount_percent | numeric | não |  |
| max_installments | integer | não |  |
| min_installment_in_cents | integer | não |  |
| updated_at | timestamp with time zone | não |  |

Restrições:

- `PK_site_config`: PRIMARY KEY (id)

### funcionalidades

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| codigo | character varying(60) | não |  |
| ligada | boolean | não |  |
| alterada_em | timestamp with time zone | não |  |
| alterada_por_id | uuid | sim |  |

Restrições:

- `PK_funcionalidades`: PRIMARY KEY (codigo)

### integration_configs

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| source | character varying(30) | não |  |
| access_token | character varying(2000) | sim |  |
| refresh_token | character varying(2000) | sim |  |
| client_id | character varying(200) | sim |  |
| client_secret | character varying(200) | sim |  |
| expires_at | timestamp with time zone | sim |  |
| is_active | boolean | não |  |
| cnpj | character varying(18) | sim |  |
| pix_key | character varying(100) | sim |  |
| last_sync_at | timestamp with time zone | sim |  |
| created_at | timestamp with time zone | não |  |
| updated_at | timestamp with time zone | não |  |

Restrições:

- `PK_integration_configs`: PRIMARY KEY (id)

### audit_logs

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | text | não |  |
| actor_user_id | text | sim |  |
| actor_user_name | character varying(200) | sim |  |
| action | character varying(50) | não |  |
| entity_type | character varying(50) | não |  |
| entity_id | character varying(100) | sim |  |
| details | text | sim |  |
| ip_hash | character varying(64) | não |  |
| created_at | timestamp with time zone | não |  |

Restrições:

- `PK_audit_logs`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX ix_audit_logs_actor ON audit_logs USING btree (actor_user_id)`
- `CREATE INDEX ix_audit_logs_created_at ON audit_logs USING btree (created_at)`
- `CREATE INDEX ix_audit_logs_entity ON audit_logs USING btree (entity_type, entity_id)`

### alertas_sistema

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | uuid | não |  |
| codigo | character varying(60) | não |  |
| chave | character varying(200) | não |  |
| gravidade | character varying(10) | não |  |
| titulo | character varying(200) | não |  |
| detalhe | character varying(2000) | não |  |
| link | character varying(300) | sim |  |
| ocorrencias | integer | não |  |
| criado_em | timestamp with time zone | não |  |
| ultima_vez_em | timestamp with time zone | não |  |
| resolvido_em | timestamp with time zone | sim |  |
| resolvido_por | character varying(120) | sim |  |

Restrições:

- `PK_alertas_sistema`: PRIMARY KEY (id)

Índices:

- `CREATE INDEX ix_alertas_sistema_abertos ON alertas_sistema USING btree (codigo, chave) WHERE (resolvido_em IS NULL)`
- `CREATE INDEX ix_alertas_sistema_ultima ON alertas_sistema USING btree (ultima_vez_em DESC)`

### marcos_operacao

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| chave | character varying(60) | não |  |
| quando | timestamp with time zone | não |  |
| detalhe | character varying(500) | sim |  |

Restrições:

- `PK_marcos_operacao`: PRIMARY KEY (chave)

### app_migrations

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| key | text | não |  |
| applied_at | timestamp with time zone | não | now() |

Restrições:

- `app_migrations_pkey`: PRIMARY KEY (key)

## Triggers

| Tabela | Trigger | Função |
|---|---|---|
| announcements | trg_announcements_updated_at | fn_carimbar_updated_at |
| card_listings | trg_card_listings_updated_at | fn_carimbar_updated_at |
| crediario_aviso_config | trg_crediario_aviso_config_updated_at | fn_carimbar_updated_at |
| decks | trg_decks_updated_at | fn_carimbar_updated_at |
| external_transactions | trg_external_transactions_updated_at | fn_carimbar_updated_at |
| integration_configs | trg_integration_configs_updated_at | fn_carimbar_updated_at |
| liga_mensal_manual_entries | trg_liga_mensal_manual_entries_updated_at | fn_carimbar_updated_at |
| product_variants | trg_product_variants_auditar_estoque | fn_auditar_estoque |
| product_variants | trg_product_variants_updated_at | fn_carimbar_updated_at |
| products | trg_products_auditar_estoque | fn_auditar_estoque |
| products | trg_products_updated_at | fn_carimbar_updated_at |
| site_config | trg_site_config_updated_at | fn_carimbar_updated_at |
| timers | trg_timers_updated_at | fn_carimbar_updated_at |
| users | trg_users_updated_at | fn_carimbar_updated_at |

## Funções e procedures

| Rotina | Tipo | Parâmetros | Retorno |
|---|---|---|---|
| fn_auditar_estoque | função | — | trigger |
| fn_carimbar_updated_at | função | — | trigger |
| fn_estoque_baixo | função | — | TABLE(product_id uuid, nome character varying, categoria character varying, estoque integer, minimo integer, faltam integer) |
| fn_fechamento_comandas | função | p_dia date | TABLE(forma_pagamento text, comandas integer, total_centavos bigint) |
| fn_saldo_crediario | função | p_user_id uuid | TABLE(crediario_id uuid, user_id uuid, cliente character varying, valor_centavos integer, pago_centavos integer, saldo_centavos integer, vencimento timestamp with time zone, vencido boolean) |
| pr_conferir_integridade | procedure | — | — |
| pr_manutencao_banco | procedure | IN p_dias_sessoes integer, IN p_dias_movimentos integer | — |
