<!-- Gerado do catálogo do PostgreSQL 16 (banco criado pela API v1.88.0 em banco vazio). Não editar à mão. -->

# Modelo lógico

Notação: **PK** chave primária, **FK** chave estrangeira, **UK** valor único.

## Usuários e acesso

**perfis**

- id [PK, UK]: identificador
- nome: texto
- permissoes_json: texto
- criado_por_admin_id: identificador
- criado_em: data e hora
- atualizado_em: data e hora

**users**

- id [PK, UK]: identificador
- name: texto
- email: texto (opcional)
- password_hash: texto (opcional)
- whatsapp: texto (opcional)
- cpf: texto (opcional)
- profile_image_url: texto (opcional)
- pokemon_favorito: texto (opcional)
- pokemon_favorito_shiny: lógico
- role: texto
- refresh_token: texto (opcional)
- refresh_token_expiry: data e hora (opcional)
- password_reset_token: texto (opcional)
- password_reset_token_expiry: data e hora (opcional)
- google_sub: texto (opcional)
- falhas_login: número
- login_bloqueado_ate: data e hora (opcional)
- points_balance: número
- points_expires_at: data e hora (opcional)
- balance_in_cents: número
- preferences_json: texto (opcional)
- created_at: data e hora
- updated_at: data e hora
- is_active: lógico
- deleted_at: data e hora (opcional)
- consent_at: data e hora (opcional)
- perfil_id [FK→perfis]: identificador (opcional)

**user_sessions**

- id [PK, UK]: identificador
- user_id [FK→users]: identificador
- token_hash [UK]: texto
- expires_at: data e hora
- rotated_at: data e hora (opcional)
- revoked_at: data e hora (opcional)
- user_agent: texto (opcional)
- ip_address: texto (opcional)
- created_at: data e hora
- last_used_at: data e hora

**push_subscriptions**

- id [PK, UK]: identificador
- user_id [FK→users]: identificador
- endpoint [UK]: texto
- p256dh: texto
- auth: texto
- created_at: data e hora

**notifications**

- id [PK, UK]: identificador
- user_id [FK→users]: identificador
- title: texto
- body: texto
- link: texto (opcional)
- image_url: texto (opcional)
- created_at: data e hora
- read_at: data e hora (opcional)

**cookie_consents**

- id [PK, UK]: texto
- user_id [FK→users]: identificador (opcional)
- ip_hash: texto
- user_agent: texto
- accepted: lógico
- policy_version: texto
- consent_at: data e hora

**lgpd_requests**

- id [PK, UK]: texto
- user_id [FK→users]: identificador (opcional)
- requester_name: texto
- requester_email: texto
- requester_cpf: texto
- request_type: texto
- description: texto (opcional)
- status: texto
- admin_response: texto (opcional)
- created_at: data e hora
- responded_at: data e hora (opcional)
- deadline: data e hora
- anexo_nome: texto (opcional)
- anexo_dados: bytea (opcional)

**decks**

- id [PK, UK]: identificador
- user_id [FK→users]: identificador
- name: texto
- game: texto
- format: texto
- cards_json: texto
- is_public: lógico
- created_at: data e hora
- updated_at: data e hora

## Catálogo e estoque

**product_categories**

- id [PK, UK]: identificador
- name [UK]: texto
- emoji: texto (opcional)
- pix_discount_percent: número (opcional)
- display_order: número
- is_active: lógico
- parent_category_id [FK→product_categories]: identificador (opcional)
- created_at: data e hora

**products**

- id [PK, UK]: identificador
- name: texto
- description: texto (opcional)
- category: texto
- barcode: texto (opcional)
- cost_price_in_cents: número
- price_in_cents: número
- stock_quantity: número
- minimum_stock: número
- image_url: texto (opcional)
- image_urls: texto
- full_description: texto (opcional)
- is_active: lógico
- is_featured: lógico
- show_on_site: lógico
- show_on_marketplace: lógico
- discount_price_in_cents: número (opcional)
- is_pre_venda: lógico
- max_installments: número (opcional)
- pix_discount_percent: número (opcional)
- has_variants: lógico
- created_at: data e hora
- updated_at: data e hora
- prevenda_release_date: data (opcional)

**product_variants**

- id [PK, UK]: identificador
- product_id [FK→products]: identificador
- size: texto (opcional)
- color: texto (opcional)
- stock_quantity: número
- price_in_cents: número (opcional)
- sku: texto (opcional)
- created_at: data e hora
- updated_at: data e hora

**product_reservations**

- id [PK, UK]: identificador
- reservation_group_id: identificador
- user_id [FK→users]: identificador
- product_id [FK→products]: identificador
- variant_id [FK→product_variants]: identificador (opcional)
- quantity: número
- kind: texto
- status: texto
- notes: texto (opcional)
- payment_method: texto (opcional)
- reserved_at: data e hora
- expires_at: data e hora (opcional)
- fulfilled_at: data e hora (opcional)
- cancelled_at: data e hora (opcional)
- unit_price_in_cents: número (opcional)
- venda_avulsa_id: texto (opcional)

**product_waitlist**

- id [PK, UK]: identificador
- product_id [FK→products]: identificador
- user_id [FK→users]: identificador (opcional)
- name: texto
- whatsapp: texto
- position: número
- created_at: data e hora
- notified_at: data e hora (opcional)

**estoque_movimentos**

- id [PK, UK]: número
- product_id: identificador
- variant_id: identificador (opcional)
- estoque_antes: número
- estoque_depois: número
- delta: número (opcional)
- origem: texto
- quando: data e hora

## Vendas e pagamentos

**comandas**

- id [PK, UK]: identificador
- user_id [FK→users]: identificador
- table_identifier: texto (opcional)
- status: texto
- opened_at: data e hora
- closed_at: data e hora (opcional)
- payment_method: texto (opcional)
- second_payment_method: texto (opcional)
- second_payment_amount_in_cents: número
- championship_id [FK→championships]: identificador (opcional)
- total_in_cents: número
- points_applied: número
- discount_in_cents: número
- notes: texto (opcional)
- estornada_em: data e hora (opcional)
- estornada_por_admin_id: identificador (opcional)
- motivo_estorno: texto (opcional)

**comanda_items**

- id [PK, UK]: identificador
- comanda_id [FK→comandas]: identificador
- product_id [FK→products]: identificador (opcional)
- card_cache_id: texto (opcional)
- variant_id: identificador (opcional)
- item_name_snapshot: texto
- unit_price_in_cents: número
- cost_price_snapshot_in_cents: número
- quantity: número
- subtotal_in_cents: número
- added_at: data e hora
- added_by_user_id: identificador

**pix_cobrancas**

- id [PK, UK]: identificador
- origem: texto
- crediario_id [FK→crediarios]: identificador (opcional)
- comanda_id [FK→comandas]: identificador (opcional)
- venda_avulsa_id: texto (opcional)
- championship_participant_id [FK→championship_participants]: identificador (opcional)
- reservation_group_id: identificador (opcional)
- reservation_item_ids: texto (opcional)
- tx_id [UK]: texto
- valor_em_centavos: número
- desconto_em_centavos: número (opcional)
- status: texto
- pix_copia_cola: texto (opcional)
- imagem_qrcode: texto (opcional)
- nome_devedor: texto (opcional)
- crediario_ids_json: texto (opcional)
- criado_por_admin_id: identificador
- criado_em: data e hora
- expira_em: data e hora (opcional)
- pago_em: data e hora (opcional)

**external_transactions**

- id [PK, UK]: identificador
- source: texto
- external_id: texto (opcional)
- type: texto
- amount: número
- description: texto
- due_date: data e hora (opcional)
- paid_at: data e hora (opcional)
- status: texto
- category: texto (opcional)
- supplier: texto (opcional)
- nfe_key: texto (opcional)
- notes: texto (opcional)
- created_at: data e hora
- updated_at: data e hora

## Crediário

**crediarios**

- id [PK, UK]: identificador
- user_id [FK→users]: identificador
- comanda_id [FK→comandas]: identificador (opcional)
- valor_em_centavos: número
- valor_pago_em_centavos: número
- data_abertura: data e hora
- data_vencimento: data e hora
- data_pagamento: data e hora (opcional)
- status: texto
- observacao: texto (opcional)
- aberto_por_admin_id: identificador
- pago_por_admin_id: identificador (opcional)
- pagamento_token: texto (opcional)
- itens_json: texto (opcional)

**crediario_lancamentos**

- id [PK, UK]: identificador
- crediario_id [FK→crediarios]: identificador
- origem: texto
- comanda_id: identificador (opcional)
- venda_avulsa_id: texto (opcional)
- valor_em_centavos: número
- itens_json: texto (opcional)
- descricao: texto (opcional)
- created_at: data e hora
- estornado_em: data e hora (opcional)

**pagamentos_crediario**

- id [PK, UK]: identificador
- crediario_id [FK→crediarios]: identificador
- valor_em_centavos: número
- forma_pagamento: texto
- observacao: texto (opcional)
- admin_id: identificador
- created_at: data e hora

**crediario_avisos**

- id [PK, UK]: identificador
- crediario_id [FK→crediarios]: identificador
- marco: número (opcional)
- vencimento_referencia: data e hora
- canais: texto
- falhas: texto (opcional)
- enviado_por_admin_id: identificador (opcional)
- enviado_em: data e hora

**crediario_aviso_config**

- id [PK, UK]: identificador
- ativo: lógico
- hora_envio: número
- marcos_json: texto
- canal_app: lógico
- canal_email: lógico
- resumo_admin: lógico
- mensagem_extra: texto (opcional)
- ultimo_resumo_em: data e hora (opcional)
- updated_at: data e hora

## Torneios e liga

**championships**

- id [PK, UK]: identificador
- name: texto
- description: texto (opcional)
- game: texto
- start_date: data e hora
- end_date: data e hora (opcional)
- registration_deadline: data e hora (opcional)
- max_participants: número (opcional)
- entry_fee_in_cents: número
- minutos_para_pagar: número
- status: texto
- formato: texto
- modalidade: texto
- codigo_entrada: texto (opcional)
- melhor_de: número
- minutos_rodada: número
- numero_rodadas: número (opcional)
- rodada_atual: número
- lugares: número
- image_url: texto (opcional)
- created_at: data e hora
- created_by_admin_id: identificador
- podio_json: texto (opcional)

**championship_participants**

- id [PK, UK]: identificador
- championship_id [FK→championships]: identificador
- user_id [FK→users]: identificador
- player_number: número
- deck_name: texto (opcional)
- deck_id: identificador (opcional)
- placement: número (opcional)
- registered_at: data e hora
- entry_fee_paid_at: data e hora (opcional)
- inscricao_expira_em: data e hora (opcional)
- entry_fee_payment_method: texto (opcional)
- comanda_id [FK→comandas]: identificador (opcional)
- check_in_em: data e hora (opcional)
- desistiu_na_rodada: número (opcional)

**championship_preinscricoes**

- id [PK, UK]: identificador
- championship_id [FK→championships]: identificador
- nome: texto
- whatsapp: texto
- deck_id: identificador (opcional)
- deck_name: texto (opcional)
- is_lista_espera: lógico
- created_at: data e hora

**torneio_rodadas**

- id [PK, UK]: identificador
- championship_id [FK→championships]: identificador
- numero: número
- status: texto
- iniciada_em: data e hora
- fechada_em: data e hora (opcional)
- comecada_em: data e hora (opcional)

**torneio_partidas**

- id [PK, UK]: identificador
- rodada_id [FK→torneio_rodadas]: identificador
- mesa: número
- participante_a_id [FK→championship_participants]: identificador
- participante_b_id [FK→championship_participants]: identificador (opcional)
- deck_a_id: identificador (opcional)
- deck_a_nome: texto (opcional)
- deck_b_id: identificador (opcional)
- deck_b_nome: texto (opcional)
- report_a: texto (opcional)
- report_b: texto (opcional)
- resultado: texto (opcional)
- vitorias_a: número
- vitorias_b: número
- resolvido_por_admin_id: identificador (opcional)
- fechada_em: data e hora (opcional)
- pronto_a_em: data e hora (opcional)
- pronto_b_em: data e hora (opcional)

**timers**

- id [PK, UK]: identificador
- name: texto
- duration_seconds: número
- paused_remaining: número (opcional)
- state: número
- started_at: data e hora (opcional)
- sound_preset: texto
- warn_at_seconds: número
- championship_id: identificador (opcional)
- rodada: número (opcional)
- created_at: data e hora
- updated_at: data e hora

**liga_mensal_manual_entries**

- id [PK, UK]: identificador
- ano: número
- mes: número
- player_name: texto
- total_points: número
- decks: texto (opcional)
- observacao: texto (opcional)
- created_by_admin_id: identificador
- created_at: data e hora
- updated_at: data e hora

## Vitrine de cartas

**card_listings**

- id [PK, UK]: identificador
- user_id [FK→users]: identificador
- card_name: texto
- card_game: texto (opcional)
- card_image_url: texto (opcional)
- price_in_cents: número
- condition: texto
- description: texto (opcional)
- status: texto
- created_at: data e hora
- updated_at: data e hora

**listing_interests**

- id [PK, UK]: identificador
- listing_id [FK→card_listings]: identificador
- user_id [FK→users]: identificador
- message: texto (opcional)
- share_contact: lógico
- created_at: data e hora

## Administração e operação

**announcements**

- id [PK, UK]: identificador
- title: texto
- body: texto (opcional)
- image_url: texto (opcional)
- link_url: texto (opcional)
- type: número
- is_active: lógico
- expires_at: data e hora (opcional)
- created_at: data e hora
- updated_at: data e hora
- created_by_admin_id: identificador

**site_config**

- id [PK, UK]: identificador
- site_name: texto
- hero_subtitle: texto
- address_line: texto
- contact_person_name: texto
- logo_url: texto (opcional)
- favicon_url: texto (opcional)
- pwa_icon_url: texto (opcional)
- hero_image_url: texto (opcional)
- admin_icon_url: texto (opcional)
- hero_eyebrow: texto
- aviso_topo: texto
- whatsapp_number: texto
- contact_email: texto
- nav_torneios_label: texto
- nav_produtos_label: texto
- nav_mercado_label: texto
- nav_pontos_label: texto
- nav_liga_label: texto
- cta_ver_eventos_label: texto
- cta_ver_torneios_label: texto
- cta_ver_produtos_label: texto
- torneios_eyebrow: texto
- torneios_title: texto
- produtos_eyebrow: texto
- produtos_title: texto
- pontos_eyebrow: texto
- pontos_title: texto
- pontos_paragraph: texto
- color_primary: texto
- color_accent: texto
- color_navy: texto
- color_hero: texto
- color_background: texto
- color_card: texto
- border_radius_style: texto
- pix_discount_percent: número
- max_installments: número
- min_installment_in_cents: número
- updated_at: data e hora

**funcionalidades**

- codigo [PK, UK]: texto
- ligada: lógico
- alterada_em: data e hora
- alterada_por_id: identificador (opcional)

**integration_configs**

- id [PK, UK]: identificador
- source: texto
- access_token: texto (opcional)
- refresh_token: texto (opcional)
- client_id: texto (opcional)
- client_secret: texto (opcional)
- expires_at: data e hora (opcional)
- is_active: lógico
- cnpj: texto (opcional)
- pix_key: texto (opcional)
- last_sync_at: data e hora (opcional)
- created_at: data e hora
- updated_at: data e hora

**audit_logs**

- id [PK, UK]: texto
- actor_user_id: texto (opcional)
- actor_user_name: texto (opcional)
- action: texto
- entity_type: texto
- entity_id: texto (opcional)
- details: texto (opcional)
- ip_hash: texto
- created_at: data e hora

**alertas_sistema**

- id [PK, UK]: identificador
- codigo: texto
- chave: texto
- gravidade: texto
- titulo: texto
- detalhe: texto
- link: texto (opcional)
- ocorrencias: número
- criado_em: data e hora
- ultima_vez_em: data e hora
- resolvido_em: data e hora (opcional)
- resolvido_por: texto (opcional)

**marcos_operacao**

- chave [PK, UK]: texto
- quando: data e hora
- detalhe: texto (opcional)

**app_migrations**

- key [PK, UK]: texto
- applied_at: data e hora

## Referências sem chave estrangeira

Colunas que apontam para outra tabela, mas sem restrição de FK no banco. A integridade delas depende da aplicação.

| Coluna | Aponta para |
|---|---|
| announcements.created_by_admin_id | users |
| audit_logs.actor_user_id | users |
| championship_participants.deck_id | decks |
| championship_preinscricoes.deck_id | decks |
| championships.created_by_admin_id | users |
| comanda_items.variant_id | product_variants |
| comanda_items.added_by_user_id | users |
| comandas.estornada_por_admin_id | users |
| crediario_avisos.enviado_por_admin_id | users |
| crediario_lancamentos.comanda_id | comandas |
| crediarios.aberto_por_admin_id | users |
| crediarios.pago_por_admin_id | users |
| estoque_movimentos.product_id | products |
| estoque_movimentos.variant_id | product_variants |
| funcionalidades.alterada_por_id | users |
| liga_mensal_manual_entries.created_by_admin_id | users |
| pagamentos_crediario.admin_id | users |
| perfis.criado_por_admin_id | users |
| pix_cobrancas.criado_por_admin_id | users |
| timers.championship_id | championships |
| torneio_partidas.deck_a_id | decks |
| torneio_partidas.deck_b_id | decks |
| torneio_partidas.resolvido_por_admin_id | users |

Colunas `card_cache_id` e `venda_avulsa_id` apontam para documentos no MongoDB, por isso não podem ter FK.
