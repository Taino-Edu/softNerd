# Modelo lógico — Santuário Nerd (PostgreSQL)

> **Gerado do banco real** por `scripts/gerar-modelo-dados.py`. Não é desenho à mão: se o schema mudar, rode o script de novo.

**40 tabelas · 476 colunas · 40 chaves primárias · 37 chaves estrangeiras · 126 índices** (banco PostgreSQL 16).

Legenda: `PK` chave primária, `FK` chave estrangeira, `UK` valor único; `"null"` = coluna aceita nulo. Tabelas com sufixo *(ref.)* aparecem só pra mostrar a relação com outro domínio (só as chaves).

## Mapa do banco inteiro

```mermaid
erDiagram
  users ||--o{ card_listings : "user_id"
  championships ||--o{ championship_participants : "championship_id"
  comandas |o--o{ championship_participants : "comanda_id"
  users ||--o{ championship_participants : "user_id"
  championships ||--o{ championship_preinscricoes : "championship_id"
  comandas ||--o{ comanda_items : "comanda_id"
  products |o--o{ comanda_items : "product_id"
  championships |o--o{ comandas : "championship_id"
  users ||--o{ comandas : "user_id"
  users |o--o{ cookie_consents : "user_id"
  crediarios ||--o{ crediario_avisos : "crediario_id"
  crediarios ||--o{ crediario_lancamentos : "crediario_id"
  comandas |o--o{ crediarios : "comanda_id"
  users ||--o{ crediarios : "user_id"
  users ||--o{ decks : "user_id"
  users |o--o{ lgpd_requests : "user_id"
  card_listings ||--o{ listing_interests : "listing_id"
  users ||--o{ listing_interests : "user_id"
  users ||--o{ notifications : "user_id"
  crediarios ||--o{ pagamentos_crediario : "crediario_id"
  championship_participants |o--o{ pix_cobrancas : "championship_participant_id"
  comandas |o--o{ pix_cobrancas : "comanda_id"
  crediarios |o--o{ pix_cobrancas : "crediario_id"
  product_categories |o--o{ product_categories : "parent_category_id"
  product_variants |o--o{ product_reservations : "variant_id"
  products ||--o{ product_reservations : "product_id"
  users ||--o{ product_reservations : "user_id"
  products ||--o{ product_variants : "product_id"
  products ||--o{ product_waitlist : "product_id"
  users |o--o{ product_waitlist : "user_id"
  users ||--o{ push_subscriptions : "user_id"
  championship_participants ||--o{ torneio_partidas : "participante_a_id"
  championship_participants |o--o{ torneio_partidas : "participante_b_id"
  torneio_rodadas ||--o{ torneio_partidas : "rodada_id"
  championships ||--o{ torneio_rodadas : "championship_id"
  users ||--o{ user_sessions : "user_id"
  perfis |o--o{ users : "perfil_id"
  alertas_sistema {
    uuid id PK
  }
  announcements {
    uuid id PK
  }
  app_migrations {
    text key PK
  }
  audit_logs {
    text id PK
  }
  card_listings {
    uuid id PK
    uuid user_id FK
  }
  championship_participants {
    uuid id PK
    uuid championship_id FK
    uuid user_id FK
    uuid comanda_id FK
  }
  championship_preinscricoes {
    uuid id PK
    uuid championship_id FK
  }
  championships {
    uuid id PK
  }
  comanda_items {
    uuid id PK
    uuid comanda_id FK
    uuid product_id FK
  }
  comandas {
    uuid id PK
    uuid user_id FK
    uuid championship_id FK
  }
  cookie_consents {
    text id PK
    uuid user_id FK
  }
  crediario_aviso_config {
    uuid id PK
  }
  crediario_avisos {
    uuid id PK
    uuid crediario_id FK
  }
  crediario_lancamentos {
    uuid id PK
    uuid crediario_id FK
  }
  crediarios {
    uuid id PK
    uuid user_id FK
    uuid comanda_id FK
  }
  decks {
    uuid id PK
    uuid user_id FK
  }
  estoque_movimentos {
    bigint id PK
  }
  external_transactions {
    uuid id PK
  }
  funcionalidades {
    varchar(60) codigo PK
  }
  integration_configs {
    uuid id PK
  }
  lgpd_requests {
    text id PK
    uuid user_id FK
  }
  liga_mensal_manual_entries {
    uuid id PK
  }
  listing_interests {
    uuid id PK
    uuid listing_id FK
    uuid user_id FK
  }
  marcos_operacao {
    varchar(60) chave PK
  }
  notifications {
    uuid id PK
    uuid user_id FK
  }
  pagamentos_crediario {
    uuid id PK
    uuid crediario_id FK
  }
  perfis {
    uuid id PK
  }
  pix_cobrancas {
    uuid id PK
    uuid crediario_id FK
    uuid comanda_id FK
    uuid championship_participant_id FK
  }
  product_categories {
    uuid id PK
    uuid parent_category_id FK
  }
  product_reservations {
    uuid id PK
    uuid user_id FK
    uuid product_id FK
    uuid variant_id FK
  }
  product_variants {
    uuid id PK
    uuid product_id FK
  }
  product_waitlist {
    uuid id PK
    uuid product_id FK
    uuid user_id FK
  }
  products {
    uuid id PK
  }
  push_subscriptions {
    uuid id PK
    uuid user_id FK
  }
  site_config {
    uuid id PK
  }
  timers {
    uuid id PK
  }
  torneio_partidas {
    uuid id PK
    uuid rodada_id FK
    uuid participante_a_id FK
    uuid participante_b_id FK
  }
  torneio_rodadas {
    uuid id PK
    uuid championship_id FK
  }
  user_sessions {
    uuid id PK
    uuid user_id FK
  }
  users {
    uuid id PK
    uuid perfil_id FK
  }
```

## Acesso e identidade

Quem usa o sistema: clientes, equipe, perfis de permissão, sessões, avisos ao usuário e LGPD.

```mermaid
erDiagram
  users ||--o{ card_listings : "user_id"
  users ||--o{ championship_participants : "user_id"
  users ||--o{ comandas : "user_id"
  users |o--o{ cookie_consents : "user_id"
  users ||--o{ crediarios : "user_id"
  users ||--o{ decks : "user_id"
  users |o--o{ lgpd_requests : "user_id"
  users ||--o{ listing_interests : "user_id"
  users ||--o{ notifications : "user_id"
  users ||--o{ product_reservations : "user_id"
  users |o--o{ product_waitlist : "user_id"
  users ||--o{ push_subscriptions : "user_id"
  users ||--o{ user_sessions : "user_id"
  perfis |o--o{ users : "perfil_id"
  users {
    uuid id PK
    varchar(150) name
    varchar(255) email "null"
    text password_hash "null"
    varchar(20) whatsapp "null"
    varchar(11) cpf "null"
    varchar(500) profile_image_url "null"
    varchar(45) pokemon_favorito "null"
    bool pokemon_favorito_shiny
    varchar(20) role
    text refresh_token "null"
    timestamptz refresh_token_expiry "null"
    text password_reset_token "null"
    timestamptz password_reset_token_expiry "null"
    varchar(64) google_sub "null"
    int falhas_login
    timestamptz login_bloqueado_ate "null"
    int points_balance
    timestamptz points_expires_at "null"
    int balance_in_cents
    text preferences_json "null"
    timestamptz created_at
    timestamptz updated_at
    bool is_active
    timestamptz deleted_at "null"
    timestamptz consent_at "null"
    uuid perfil_id FK
  }
  perfis {
    uuid id PK
    varchar(100) nome
    text permissoes_json
    uuid criado_por_admin_id
    timestamptz criado_em
    timestamptz atualizado_em
  }
  user_sessions {
    uuid id PK
    uuid user_id FK
    varchar(64) token_hash
    timestamptz expires_at
    timestamptz rotated_at "null"
    timestamptz revoked_at "null"
    varchar(300) user_agent "null"
    varchar(45) ip_address "null"
    timestamptz created_at
    timestamptz last_used_at
  }
  cookie_consents {
    text id PK
    uuid user_id FK
    varchar(64) ip_hash
    varchar(500) user_agent
    bool accepted
    varchar(10) policy_version
    timestamptz consent_at
  }
  lgpd_requests {
    text id PK
    uuid user_id FK
    varchar(200) requester_name
    varchar(255) requester_email
    varchar(11) requester_cpf
    varchar(20) request_type
    varchar(2000) description "null"
    varchar(15) status
    varchar(4000) admin_response "null"
    timestamptz created_at
    timestamptz responded_at "null"
    timestamptz deadline
    varchar(255) anexo_nome "null"
    bytea anexo_dados "null"
  }
  push_subscriptions {
    uuid id PK
    uuid user_id FK
    varchar(600) endpoint
    varchar(300) p256dh
    varchar(150) auth
    timestamptz created_at
  }
  notifications {
    uuid id PK
    uuid user_id FK
    varchar(120) title
    varchar(500) body
    varchar(300) link "null"
    varchar(500) image_url "null"
    timestamptz created_at
    timestamptz read_at "null"
  }
  card_listings {
    uuid id PK
    uuid user_id FK
  }
  championship_participants {
    uuid id PK
    uuid championship_id FK
    uuid user_id FK
    uuid comanda_id FK
  }
  comandas {
    uuid id PK
    uuid user_id FK
    uuid championship_id FK
  }
  crediarios {
    uuid id PK
    uuid user_id FK
    uuid comanda_id FK
  }
  decks {
    uuid id PK
    uuid user_id FK
  }
  listing_interests {
    uuid id PK
    uuid listing_id FK
    uuid user_id FK
  }
  product_reservations {
    uuid id PK
    uuid user_id FK
    uuid product_id FK
    uuid variant_id FK
  }
  product_waitlist {
    uuid id PK
    uuid product_id FK
    uuid user_id FK
  }
```

## Catálogo e estoque

O que a loja vende: categorias (com subcategorias), produtos, variações de tamanho/cor, lista de espera e o histórico de mudanças de estoque (gravado por trigger).

```mermaid
erDiagram
  products |o--o{ comanda_items : "product_id"
  product_categories |o--o{ product_categories : "parent_category_id"
  product_variants |o--o{ product_reservations : "variant_id"
  products ||--o{ product_reservations : "product_id"
  products ||--o{ product_variants : "product_id"
  products ||--o{ product_waitlist : "product_id"
  users |o--o{ product_waitlist : "user_id"
  product_categories {
    uuid id PK
    varchar(100) name
    varchar(10) emoji "null"
    decimal pix_discount_percent "null"
    int display_order
    bool is_active
    uuid parent_category_id FK
    timestamptz created_at
  }
  products {
    uuid id PK
    varchar(200) name
    varchar(500) description "null"
    varchar(100) category
    varchar(100) barcode "null"
    int cost_price_in_cents
    int price_in_cents
    int stock_quantity
    int minimum_stock
    varchar(500) image_url "null"
    ARRAY image_urls
    text full_description "null"
    bool is_active
    bool is_featured
    bool show_on_site
    bool show_on_marketplace
    int discount_price_in_cents "null"
    bool is_pre_venda
    int max_installments "null"
    decimal pix_discount_percent "null"
    bool has_variants
    timestamptz created_at
    timestamptz updated_at
    date prevenda_release_date "null"
  }
  product_variants {
    uuid id PK
    uuid product_id FK
    varchar(50) size "null"
    varchar(100) color "null"
    int stock_quantity
    int price_in_cents "null"
    varchar(100) sku "null"
    timestamptz created_at
    timestamptz updated_at
  }
  product_waitlist {
    uuid id PK
    uuid product_id FK
    uuid user_id FK
    varchar(150) name
    varchar(20) whatsapp
    int position
    timestamptz created_at
    timestamptz notified_at "null"
  }
  estoque_movimentos {
    bigint id PK
    uuid product_id
    uuid variant_id "null"
    int estoque_antes
    int estoque_depois
    int delta "null"
    varchar(20) origem
    timestamptz quando
  }
  comanda_items {
    uuid id PK
    uuid comanda_id FK
    uuid product_id FK
  }
  product_reservations {
    uuid id PK
    uuid user_id FK
    uuid product_id FK
    uuid variant_id FK
  }
  users {
    uuid id PK
    uuid perfil_id FK
  }
```

## Comanda, reservas e pagamentos

Venda na mesa (comanda), pré-venda/reserva do site, cobranças Pix e integração bancária.

```mermaid
erDiagram
  comandas |o--o{ championship_participants : "comanda_id"
  comandas ||--o{ comanda_items : "comanda_id"
  products |o--o{ comanda_items : "product_id"
  championships |o--o{ comandas : "championship_id"
  users ||--o{ comandas : "user_id"
  comandas |o--o{ crediarios : "comanda_id"
  championship_participants |o--o{ pix_cobrancas : "championship_participant_id"
  comandas |o--o{ pix_cobrancas : "comanda_id"
  crediarios |o--o{ pix_cobrancas : "crediario_id"
  product_variants |o--o{ product_reservations : "variant_id"
  products ||--o{ product_reservations : "product_id"
  users ||--o{ product_reservations : "user_id"
  comandas {
    uuid id PK
    uuid user_id FK
    varchar(50) table_identifier "null"
    text status
    timestamptz opened_at
    timestamptz closed_at "null"
    varchar(30) payment_method "null"
    varchar(30) second_payment_method "null"
    int second_payment_amount_in_cents
    uuid championship_id FK
    int total_in_cents
    int points_applied
    int discount_in_cents
    varchar(500) notes "null"
    timestamptz estornada_em "null"
    uuid estornada_por_admin_id "null"
    varchar(300) motivo_estorno "null"
  }
  comanda_items {
    uuid id PK
    uuid comanda_id FK
    uuid product_id FK
    varchar(100) card_cache_id "null"
    uuid variant_id "null"
    varchar(200) item_name_snapshot
    int unit_price_in_cents
    int cost_price_snapshot_in_cents
    int quantity
    int subtotal_in_cents
    timestamptz added_at
    uuid added_by_user_id
  }
  product_reservations {
    uuid id PK
    uuid reservation_group_id
    uuid user_id FK
    uuid product_id FK
    uuid variant_id FK
    int quantity
    varchar(20) kind
    varchar(20) status
    varchar(500) notes "null"
    varchar(20) payment_method "null"
    timestamptz reserved_at
    timestamptz expires_at "null"
    timestamptz fulfilled_at "null"
    timestamptz cancelled_at "null"
    int unit_price_in_cents "null"
    varchar(80) venda_avulsa_id "null"
  }
  pix_cobrancas {
    uuid id PK
    text origem
    uuid crediario_id FK
    uuid comanda_id FK
    varchar(50) venda_avulsa_id "null"
    uuid championship_participant_id FK
    uuid reservation_group_id "null"
    text reservation_item_ids "null"
    varchar(35) tx_id
    int valor_em_centavos
    int desconto_em_centavos "null"
    varchar(40) status
    text pix_copia_cola "null"
    text imagem_qrcode "null"
    varchar(200) nome_devedor "null"
    text crediario_ids_json "null"
    uuid criado_por_admin_id
    timestamptz criado_em
    timestamptz expira_em "null"
    timestamptz pago_em "null"
  }
  external_transactions {
    uuid id PK
    varchar(30) source
    varchar(200) external_id "null"
    varchar(10) type
    decimal amount
    varchar(500) description
    timestamptz due_date "null"
    timestamptz paid_at "null"
    varchar(20) status
    varchar(100) category "null"
    varchar(200) supplier "null"
    varchar(44) nfe_key "null"
    varchar(2000) notes "null"
    timestamptz created_at
    timestamptz updated_at
  }
  integration_configs {
    uuid id PK
    varchar(30) source
    varchar(2000) access_token "null"
    varchar(2000) refresh_token "null"
    varchar(200) client_id "null"
    varchar(200) client_secret "null"
    timestamptz expires_at "null"
    bool is_active
    varchar(18) cnpj "null"
    varchar(100) pix_key "null"
    timestamptz last_sync_at "null"
    timestamptz created_at
    timestamptz updated_at
  }
  championship_participants {
    uuid id PK
    uuid championship_id FK
    uuid user_id FK
    uuid comanda_id FK
  }
  championships {
    uuid id PK
  }
  crediarios {
    uuid id PK
    uuid user_id FK
    uuid comanda_id FK
  }
  product_variants {
    uuid id PK
    uuid product_id FK
  }
  products {
    uuid id PK
  }
  users {
    uuid id PK
    uuid perfil_id FK
  }
```

## Crediário

Contas a receber do cliente: dívida, lançamentos, pagamentos parciais e avisos de cobrança.

```mermaid
erDiagram
  crediarios ||--o{ crediario_avisos : "crediario_id"
  crediarios ||--o{ crediario_lancamentos : "crediario_id"
  comandas |o--o{ crediarios : "comanda_id"
  users ||--o{ crediarios : "user_id"
  crediarios ||--o{ pagamentos_crediario : "crediario_id"
  crediarios |o--o{ pix_cobrancas : "crediario_id"
  crediarios {
    uuid id PK
    uuid user_id FK
    uuid comanda_id FK
    int valor_em_centavos
    int valor_pago_em_centavos
    timestamptz data_abertura
    timestamptz data_vencimento
    timestamptz data_pagamento "null"
    text status
    varchar(500) observacao "null"
    uuid aberto_por_admin_id
    uuid pago_por_admin_id "null"
    varchar(64) pagamento_token "null"
    text itens_json "null"
  }
  crediario_lancamentos {
    uuid id PK
    uuid crediario_id FK
    varchar(20) origem
    uuid comanda_id "null"
    varchar(50) venda_avulsa_id "null"
    int valor_em_centavos
    text itens_json "null"
    varchar(500) descricao "null"
    timestamptz created_at
    timestamptz estornado_em "null"
  }
  pagamentos_crediario {
    uuid id PK
    uuid crediario_id FK
    int valor_em_centavos
    varchar(50) forma_pagamento
    varchar(500) observacao "null"
    uuid admin_id
    timestamptz created_at
  }
  crediario_avisos {
    uuid id PK
    uuid crediario_id FK
    int marco "null"
    timestamptz vencimento_referencia
    varchar(60) canais
    varchar(500) falhas "null"
    uuid enviado_por_admin_id "null"
    timestamptz enviado_em
  }
  crediario_aviso_config {
    uuid id PK
    bool ativo
    int hora_envio
    text marcos_json
    bool canal_app
    bool canal_email
    bool resumo_admin
    varchar(300) mensagem_extra "null"
    timestamptz ultimo_resumo_em "null"
    timestamptz updated_at
  }
  comandas {
    uuid id PK
    uuid user_id FK
    uuid championship_id FK
  }
  pix_cobrancas {
    uuid id PK
    uuid crediario_id FK
    uuid comanda_id FK
    uuid championship_participant_id FK
  }
  users {
    uuid id PK
    uuid perfil_id FK
  }
```

## Campeonatos, Liga e torneios

Campeonatos e Liga mensal, inscritos, rodadas e partidas do torneio suíço, decks e cronômetros.

```mermaid
erDiagram
  championships ||--o{ championship_participants : "championship_id"
  comandas |o--o{ championship_participants : "comanda_id"
  users ||--o{ championship_participants : "user_id"
  championships ||--o{ championship_preinscricoes : "championship_id"
  championships |o--o{ comandas : "championship_id"
  users ||--o{ decks : "user_id"
  championship_participants |o--o{ pix_cobrancas : "championship_participant_id"
  championship_participants ||--o{ torneio_partidas : "participante_a_id"
  championship_participants |o--o{ torneio_partidas : "participante_b_id"
  torneio_rodadas ||--o{ torneio_partidas : "rodada_id"
  championships ||--o{ torneio_rodadas : "championship_id"
  championships {
    uuid id PK
    varchar(200) name
    varchar(1000) description "null"
    varchar(100) game
    timestamptz start_date
    timestamptz end_date "null"
    timestamptz registration_deadline "null"
    int max_participants "null"
    int entry_fee_in_cents
    int minutos_para_pagar
    text status
    text formato
    varchar(20) modalidade
    varchar(8) codigo_entrada "null"
    int melhor_de
    int minutos_rodada
    int numero_rodadas "null"
    int rodada_atual
    int lugares
    varchar(500) image_url "null"
    timestamptz created_at
    uuid created_by_admin_id
    varchar(1000) podio_json "null"
  }
  championship_participants {
    uuid id PK
    uuid championship_id FK
    uuid user_id FK
    int player_number
    varchar(200) deck_name "null"
    uuid deck_id "null"
    int placement "null"
    timestamptz registered_at
    timestamptz entry_fee_paid_at "null"
    timestamptz inscricao_expira_em "null"
    varchar(20) entry_fee_payment_method "null"
    uuid comanda_id FK
    timestamptz check_in_em "null"
    int desistiu_na_rodada "null"
  }
  championship_preinscricoes {
    uuid id PK
    uuid championship_id FK
    varchar(200) nome
    varchar(30) whatsapp
    uuid deck_id "null"
    varchar(200) deck_name "null"
    bool is_lista_espera
    timestamptz created_at
  }
  torneio_rodadas {
    uuid id PK
    uuid championship_id FK
    int numero
    text status
    timestamptz iniciada_em
    timestamptz fechada_em "null"
    timestamptz comecada_em "null"
  }
  torneio_partidas {
    uuid id PK
    uuid rodada_id FK
    int mesa
    uuid participante_a_id FK
    uuid participante_b_id FK
    uuid deck_a_id "null"
    varchar(200) deck_a_nome "null"
    uuid deck_b_id "null"
    varchar(200) deck_b_nome "null"
    text report_a "null"
    text report_b "null"
    text resultado "null"
    int vitorias_a
    int vitorias_b
    uuid resolvido_por_admin_id "null"
    timestamptz fechada_em "null"
    timestamptz pronto_a_em "null"
    timestamptz pronto_b_em "null"
  }
  decks {
    uuid id PK
    uuid user_id FK
    varchar(100) name
    varchar(50) game
    varchar(20) format
    text cards_json
    bool is_public
    timestamptz created_at
    timestamptz updated_at
  }
  timers {
    uuid id PK
    varchar(100) name
    int duration_seconds
    int paused_remaining "null"
    int state
    timestamptz started_at "null"
    varchar(50) sound_preset
    int warn_at_seconds
    uuid championship_id "null"
    int rodada "null"
    timestamptz created_at
    timestamptz updated_at
  }
  liga_mensal_manual_entries {
    uuid id PK
    int ano
    int mes
    varchar(200) player_name
    int total_points
    varchar(500) decks "null"
    varchar(500) observacao "null"
    uuid created_by_admin_id
    timestamptz created_at
    timestamptz updated_at
  }
  comandas {
    uuid id PK
    uuid user_id FK
    uuid championship_id FK
  }
  pix_cobrancas {
    uuid id PK
    uuid crediario_id FK
    uuid comanda_id FK
    uuid championship_participant_id FK
  }
  users {
    uuid id PK
    uuid perfil_id FK
  }
```

## Mercado de cartas

Anúncios de cartas entre jogadores e os interessados em cada anúncio.

```mermaid
erDiagram
  users ||--o{ card_listings : "user_id"
  card_listings ||--o{ listing_interests : "listing_id"
  users ||--o{ listing_interests : "user_id"
  card_listings {
    uuid id PK
    uuid user_id FK
    varchar(200) card_name
    varchar(100) card_game "null"
    varchar(500) card_image_url "null"
    int price_in_cents
    varchar(50) condition
    varchar(1000) description "null"
    varchar(20) status
    timestamptz created_at
    timestamptz updated_at
  }
  listing_interests {
    uuid id PK
    uuid listing_id FK
    uuid user_id FK
    varchar(500) message "null"
    bool share_contact
    timestamptz created_at
  }
  users {
    uuid id PK
    uuid perfil_id FK
  }
```

## Sistema e operação

Auditoria, alertas do Vigia, comunicados, chaves de funcionalidade, configuração do site e marcos de operação.

```mermaid
erDiagram
  audit_logs {
    text id PK
    text actor_user_id "null"
    varchar(200) actor_user_name "null"
    varchar(50) action
    varchar(50) entity_type
    varchar(100) entity_id "null"
    text details "null"
    varchar(64) ip_hash
    timestamptz created_at
  }
  alertas_sistema {
    uuid id PK
    varchar(60) codigo
    varchar(200) chave
    varchar(10) gravidade
    varchar(200) titulo
    varchar(2000) detalhe
    varchar(300) link "null"
    int ocorrencias
    timestamptz criado_em
    timestamptz ultima_vez_em
    timestamptz resolvido_em "null"
    varchar(120) resolvido_por "null"
  }
  announcements {
    uuid id PK
    varchar(200) title
    varchar(2000) body "null"
    varchar(500) image_url "null"
    varchar(500) link_url "null"
    int type
    bool is_active
    timestamptz expires_at "null"
    timestamptz created_at
    timestamptz updated_at
    uuid created_by_admin_id
  }
  funcionalidades {
    varchar(60) codigo PK
    bool ligada
    timestamptz alterada_em
    uuid alterada_por_id "null"
  }
  marcos_operacao {
    varchar(60) chave PK
    timestamptz quando
    varchar(500) detalhe "null"
  }
  site_config {
    uuid id PK
    varchar(100) site_name
    varchar(400) hero_subtitle
    varchar(150) address_line
    varchar(60) contact_person_name
    varchar(300) logo_url "null"
    varchar(300) favicon_url "null"
    varchar(300) pwa_icon_url "null"
    varchar(300) hero_image_url "null"
    varchar(300) admin_icon_url "null"
    varchar(80) hero_eyebrow
    varchar(120) aviso_topo
    varchar(20) whatsapp_number
    varchar(150) contact_email
    varchar(40) nav_torneios_label
    varchar(40) nav_produtos_label
    varchar(40) nav_mercado_label
    varchar(40) nav_pontos_label
    varchar(40) nav_liga_label
    varchar(40) cta_ver_eventos_label
    varchar(40) cta_ver_torneios_label
    varchar(40) cta_ver_produtos_label
    varchar(60) torneios_eyebrow
    varchar(80) torneios_title
    varchar(60) produtos_eyebrow
    varchar(80) produtos_title
    varchar(60) pontos_eyebrow
    varchar(80) pontos_title
    varchar(400) pontos_paragraph
    varchar(9) color_primary
    varchar(9) color_accent
    varchar(9) color_navy
    varchar(9) color_hero
    varchar(9) color_background
    varchar(9) color_card
    varchar(20) border_radius_style
    decimal pix_discount_percent
    int max_installments
    int min_installment_in_cents
    timestamptz updated_at
  }
  app_migrations {
    text key PK
    timestamptz applied_at
  }
```

## Decisões de modelagem

- **Chaves `uuid`** geradas pela aplicação (`Guid`) na maioria das tabelas; algumas tabelas de controle usam texto (`audit_logs`, `cookie_consents`, `lgpd_requests`) ou um código natural (`funcionalidades.codigo`, `marcos_operacao.chave`, `app_migrations.key`).
- **Snapshot em vez de junção para histórico:** `comanda_items` guarda o nome e o preço do item no momento da venda; mudar o cadastro do produto depois não altera a comanda antiga nem o financeiro.
- **Estorno em vez de exclusão:** venda não se apaga; é marcada como estornada (data, quem estornou e motivo) e sai das contas, mas continua no extrato.
- **Datas em `timestamptz` (UTC)**; o "dia" do negócio é calculado no calendário de Brasília na aplicação.
- **Sem migrations tradicionais:** o banco nasce do EF Core e de `CardGameStore/Data/Inicializacao/postgres.sql`, que roda a cada partida e precisa ser **idempotente** (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). A tabela `app_migrations` marca ajustes de dados que devem rodar uma vez só.
- **Regra de exclusão:** `CASCADE` onde o filho não faz sentido sem o pai (itens de comanda, lançamentos de crediário, partidas de uma rodada); `RESTRICT` onde apagar esconderia dinheiro (usuário com comanda ou crediário); `SET NULL` onde a referência é opcional (cliente que pediu anonimização).

## Relações lógicas sem chave estrangeira

O banco declara **37 chaves estrangeiras**. Além delas, há **33 colunas de referência** que a aplicação respeita mas o banco não força (foram mantidas assim de propósito ou por histórico):

| Coluna | Tipo | Aponta para (na prática) |
|---|---|---|
| `announcements.created_by_admin_id` | uuid | `users.id` (quem fez a ação; id guardado como histórico) |
| `audit_logs.actor_user_id` | text, nulo | `users.id` (autor da ação) |
| `audit_logs.entity_id` | varchar(100), nulo | qualquer entidade auditada |
| `championship_participants.deck_id` | uuid, nulo | `decks.id` |
| `championship_preinscricoes.deck_id` | uuid, nulo | `decks.id` |
| `championships.created_by_admin_id` | uuid | `users.id` (quem fez a ação; id guardado como histórico) |
| `comanda_items.card_cache_id` | varchar(100), nulo | carta no cache do MongoDB |
| `comanda_items.variant_id` | uuid, nulo | `product_variants.id` |
| `comanda_items.added_by_user_id` | uuid | `users.id` (quem fez a ação; id guardado como histórico) |
| `comandas.estornada_por_admin_id` | uuid, nulo | `users.id` (quem fez a ação; id guardado como histórico) |
| `crediario_avisos.enviado_por_admin_id` | uuid, nulo | `users.id` (quem fez a ação; id guardado como histórico) |
| `crediario_lancamentos.comanda_id` | uuid, nulo | `comandas.id` |
| `crediario_lancamentos.venda_avulsa_id` | varchar(50), nulo | venda do PDV (MongoDB `vendas_avulsas`) |
| `crediarios.aberto_por_admin_id` | uuid | `users.id` (quem fez a ação; id guardado como histórico) |
| `crediarios.pago_por_admin_id` | uuid, nulo | `users.id` (quem fez a ação; id guardado como histórico) |
| `estoque_movimentos.product_id` | uuid | `products.id` (sem FK de propósito: o histórico sobrevive à exclusão do produto) |
| `estoque_movimentos.variant_id` | uuid, nulo | `product_variants.id` |
| `external_transactions.external_id` | varchar(200), nulo | identificador no sistema externo (banco) |
| `funcionalidades.alterada_por_id` | uuid, nulo | `users.id` (quem fez a ação; id guardado como histórico) |
| `integration_configs.client_id` | varchar(200), nulo | credencial da integração |
| `liga_mensal_manual_entries.created_by_admin_id` | uuid | `users.id` (quem fez a ação; id guardado como histórico) |
| `pagamentos_crediario.admin_id` | uuid | `users.id` (quem fez a ação; id guardado como histórico) |
| `perfis.criado_por_admin_id` | uuid | `users.id` (quem fez a ação; id guardado como histórico) |
| `pix_cobrancas.venda_avulsa_id` | varchar(50), nulo | venda do PDV (MongoDB `vendas_avulsas`) |
| `pix_cobrancas.reservation_group_id` | uuid, nulo | grupo de reserva (carrinho) — sem tabela própria |
| `pix_cobrancas.tx_id` | varchar(35) | txid do Pix no banco |
| `pix_cobrancas.criado_por_admin_id` | uuid | `users.id` (quem fez a ação; id guardado como histórico) |
| `product_reservations.reservation_group_id` | uuid | grupo de reserva (carrinho) — sem tabela própria |
| `product_reservations.venda_avulsa_id` | varchar(80), nulo | venda do PDV (MongoDB `vendas_avulsas`) |
| `timers.championship_id` | uuid, nulo | `championships.id` |
| `torneio_partidas.deck_a_id` | uuid, nulo | `decks.id` |
| `torneio_partidas.deck_b_id` | uuid, nulo | `decks.id` |
| `torneio_partidas.resolvido_por_admin_id` | uuid, nulo | `users.id` (quem fez a ação; id guardado como histórico) |

> Possível evolução: transformar as referências para `users`, `decks`, `product_variants` e `comandas` em chaves estrangeiras (com `ON DELETE SET NULL`/`RESTRICT`), depois de limpar eventuais órfãos. Foi deixado de fora para não arriscar o banco em produção.
