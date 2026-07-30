// =============================================================================
// AppDbContext.cs — Contexto do Entity Framework Core (PostgreSQL)
// Configura mapeamentos, índices, conversões e seeds iniciais.
// =============================================================================

using CardGameStore.Models.PostgreSQL;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Data;

/// <summary>
/// Contexto principal do EF Core para o banco PostgreSQL.
/// Gerencia todas as entidades relacionais da aplicação.
/// </summary>
public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    // -------------------------------------------------------------------------
    // DbSets — Mapeamento das entidades para tabelas
    // -------------------------------------------------------------------------

    public DbSet<User>                    Users                    { get; set; }
    public DbSet<Product>                 Products                 { get; set; }
    public DbSet<ProductCategory>         ProductCategories        { get; set; }
    public DbSet<Comanda>                 Comandas                 { get; set; }
    public DbSet<ComandaItem>             ComandaItems             { get; set; }
    public DbSet<Championship>            Championships            { get; set; }
    public DbSet<ChampionshipParticipant>  ChampionshipParticipants  { get; set; }
    public DbSet<ChampionshipPreInscricao> ChampionshipPreInscricoes { get; set; }
    public DbSet<LigaMensalManualEntry>    LigaMensalManualEntries   { get; set; }
    public DbSet<Announcement>            Announcements            { get; set; }
    public DbSet<Crediario>               Crediarios               { get; set; }
    public DbSet<PagamentoCrediario>      PagamentosCrediario      { get; set; }
    public DbSet<PixCobranca>             PixCobrancas             { get; set; }
    public DbSet<Perfil>                  Perfis                   { get; set; }
    public DbSet<Deck>                    Decks                    { get; set; }
    public DbSet<ProductWaitList>         ProductWaitLists         { get; set; }

    // ── LGPD — Compliance e privacidade ──────────────────────────────────────
    public DbSet<LgpdRequest>   LgpdRequests   { get; set; }
    public DbSet<CookieConsent> CookieConsents { get; set; }
    public DbSet<AuditLog>      AuditLogs      { get; set; }
    public DbSet<TimerEntity>   Timers         { get; set; }

    // ── Marketplace ────────────────────────────────────────────────────────────
    public DbSet<CardListing>     CardListings     { get; set; }
    public DbSet<ListingInterest> ListingInterests { get; set; }

    // ── Estoque: variantes e reservas ─────────────────────────────────────────
    public DbSet<ProductVariant>     ProductVariants     { get; set; }
    public DbSet<ProductReservation> ProductReservations { get; set; }

    // ── Financeiro: transações externas e integrações ─────────────────────────
    public DbSet<ExternalTransaction> ExternalTransactions { get; set; }
    public DbSet<IntegrationConfig>   IntegrationConfigs   { get; set; }

    // ── Mensageria: notificações in-app por usuário ───────────────────────────
    public DbSet<Notification>     Notifications     { get; set; }

    // ── Push: subscrições de browser push (WebPush/VAPID) ────────────────────
    public DbSet<PushSubscription> PushSubscriptions { get; set; }

    // ── Fiscal: emissão de NFC-e ───────────────────────────────────────────────
    public DbSet<FiscalConfig>       FiscalConfigs        { get; set; }
    public DbSet<NaturezaOperacao>   NaturezasOperacao    { get; set; }
    public DbSet<NotaFiscalEmitida>  NotasFiscaisEmitidas { get; set; }

    // ── Fiscal: NF-e destinadas (Manifestação do Destinatário) ────────────────
    public DbSet<NotaDestinada>      NotasDestinadas      { get; set; }

    // ── Personalização da landing page ─────────────────────────────────────────
    public DbSet<SiteConfig>         SiteConfigs          { get; set; }

    // -------------------------------------------------------------------------
    // OnModelCreating — Fluent API para configurações avançadas
    // -------------------------------------------------------------------------

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // =====================================================================
        // USER
        // =====================================================================
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(u => u.Email)
                  .IsUnique()
                  .HasFilter("email IS NOT NULL")
                  .HasDatabaseName("ix_users_email");

            entity.HasIndex(u => u.Cpf)
                  .IsUnique()
                  .HasFilter("cpf IS NOT NULL")
                  .HasDatabaseName("ix_users_cpf");

            entity.HasIndex(u => u.WhatsApp)
                  .HasDatabaseName("ix_users_whatsapp");
        });

        // =====================================================================
        // PRODUCT
        // =====================================================================
        modelBuilder.Entity<ProductCategory>(entity =>
        {
            entity.HasIndex(c => c.Name)
                  .IsUnique()
                  .HasDatabaseName("ix_product_categories_name");

            entity.HasIndex(c => c.ParentCategoryId)
                  .HasDatabaseName("ix_product_categories_parent");

            // Deletar a categoria-pai não apaga as subcategorias — elas só voltam a ser
            // categorias principais (mesmo espírito de "produto fica sem categoria" ao
            // deletar uma categoria usada por produtos).
            entity.HasOne(c => c.ParentCategory)
                  .WithMany(c => c.Children)
                  .HasForeignKey(c => c.ParentCategoryId)
                  .OnDelete(DeleteBehavior.SetNull)
                  .IsRequired(false);
        });

        modelBuilder.Entity<Product>(entity =>
        {
            // Largura de coluna fixada aqui (Fluent API) em vez de [MaxLength] no
            // Product.cs — ver comentário lá: a DataAnnotation dispara a validação
            // automática do ApiController antes do ProductService sanitizar a
            // pontuação colada no NCM/CEST.
            entity.Property(p => p.Ncm).HasMaxLength(8);
            entity.Property(p => p.Cest).HasMaxLength(7);

            entity.HasIndex(p => p.Category)
                  .HasDatabaseName("ix_products_category");

            entity.HasIndex(p => p.IsActive)
                  .HasDatabaseName("ix_products_is_active");

            entity.HasIndex(p => p.Barcode)
                  .IsUnique()
                  .HasFilter("barcode IS NOT NULL")
                  .HasDatabaseName("ix_products_barcode");

            entity.HasIndex(p => p.NaturezaOperacaoId)
                  .HasDatabaseName("ix_products_natureza_operacao");

            entity.HasOne(p => p.NaturezaOperacao)
                  .WithMany(n => n.Products)
                  .HasForeignKey(p => p.NaturezaOperacaoId)
                  .OnDelete(DeleteBehavior.SetNull)
                  .IsRequired(false);
        });

        // =====================================================================
        // FISCAL CONFIG
        // =====================================================================
        modelBuilder.Entity<FiscalConfig>(entity =>
        {
            entity.Property(f => f.RegimeTributario).HasConversion<string>();
            entity.Property(f => f.Ambiente).HasConversion<string>();

            entity.HasIndex(f => f.Cnpj)
                  .HasDatabaseName("ix_fiscal_config_cnpj");
        });

        // =====================================================================
        // NATUREZA DE OPERAÇÃO
        // =====================================================================
        modelBuilder.Entity<NaturezaOperacao>(entity =>
        {
            entity.HasIndex(n => n.Descricao)
                  .HasDatabaseName("ix_naturezas_operacao_descricao");

            // No máximo uma natureza pode ser padrão por vez.
            entity.HasIndex(n => n.IsPadrao)
                  .IsUnique()
                  .HasFilter("is_padrao = true")
                  .HasDatabaseName("ix_naturezas_operacao_unica_padrao");
        });

        // =====================================================================
        // NOTA FISCAL EMITIDA
        // =====================================================================
        modelBuilder.Entity<NotaFiscalEmitida>(entity =>
        {
            entity.Property(n => n.Origem).HasConversion<string>();
            entity.Property(n => n.Status).HasConversion<string>();

            entity.HasIndex(n => n.Status)
                  .HasDatabaseName("ix_notas_fiscais_status");

            entity.HasIndex(n => n.ComandaId)
                  .HasDatabaseName("ix_notas_fiscais_comanda");

            entity.HasIndex(n => n.EmitidoEm)
                  .HasDatabaseName("ix_notas_fiscais_emitido_em");

            entity.HasIndex(n => n.ChaveAcesso)
                  .IsUnique()
                  .HasFilter("chave_acesso IS NOT NULL")
                  .HasDatabaseName("ix_notas_fiscais_chave_acesso");
        });

        // =====================================================================
        // COMANDA
        // =====================================================================
        modelBuilder.Entity<Comanda>(entity =>
        {
            entity.Property(c => c.Status)
                  .HasConversion<string>();

            entity.HasIndex(c => new { c.UserId, c.Status })
                  .HasDatabaseName("ix_comandas_user_status");

            entity.HasIndex(c => c.Status)
                  .HasDatabaseName("ix_comandas_status");

            entity.HasIndex(c => c.ChampionshipId)
                  .HasDatabaseName("ix_comandas_championship");

            entity.HasOne(c => c.User)
                  .WithMany(u => u.Comandas)
                  .HasForeignKey(c => c.UserId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(c => c.Championship)
                  .WithMany(ch => ch.Comandas)
                  .HasForeignKey(c => c.ChampionshipId)
                  .OnDelete(DeleteBehavior.SetNull)
                  .IsRequired(false);
        });

        // =====================================================================
        // COMANDA ITEM
        // =====================================================================
        modelBuilder.Entity<ComandaItem>(entity =>
        {
            entity.HasIndex(i => i.ComandaId)
                  .HasDatabaseName("ix_comanda_items_comanda");

            entity.HasOne(i => i.Comanda)
                  .WithMany(c => c.Items)
                  .HasForeignKey(i => i.ComandaId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(i => i.Product)
                  .WithMany(p => p.ComandaItems)
                  .HasForeignKey(i => i.ProductId)
                  .OnDelete(DeleteBehavior.Restrict)
                  .IsRequired(false);
        });

        // =====================================================================
        // CHAMPIONSHIP
        // =====================================================================
        modelBuilder.Entity<Championship>(entity =>
        {
            entity.Property(c => c.Status)
                  .HasConversion<string>();

            entity.HasIndex(c => c.Status)
                  .HasDatabaseName("ix_championships_status");

            entity.HasIndex(c => c.StartDate)
                  .HasDatabaseName("ix_championships_start_date");
        });

        // =====================================================================
        // CHAMPIONSHIP PARTICIPANT
        // =====================================================================
        modelBuilder.Entity<ChampionshipParticipant>(entity =>
        {
            entity.HasIndex(p => new { p.ChampionshipId, p.UserId })
                  .IsUnique()
                  .HasDatabaseName("ix_championship_participants_unique");

            entity.HasOne(p => p.Championship)
                  .WithMany(c => c.Participants)
                  .HasForeignKey(p => p.ChampionshipId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(p => p.User)
                  .WithMany(u => u.ChampionshipParticipants)
                  .HasForeignKey(p => p.UserId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(p => p.Comanda)
                  .WithMany()
                  .HasForeignKey(p => p.ComandaId)
                  .OnDelete(DeleteBehavior.SetNull)
                  .IsRequired(false);
        });

        // =====================================================================
        // PERFIL
        // =====================================================================
        modelBuilder.Entity<Perfil>(entity =>
        {
            entity.HasIndex(p => p.Nome)
                  .HasDatabaseName("ix_perfis_nome");

            entity.HasMany(p => p.Users)
                  .WithOne(u => u.Perfil)
                  .HasForeignKey(u => u.PerfilId)
                  .OnDelete(DeleteBehavior.SetNull)
                  .IsRequired(false);
        });

        // =====================================================================
        // DECK
        // =====================================================================
        modelBuilder.Entity<Deck>(entity =>
        {
            entity.HasIndex(d => d.UserId)
                  .HasDatabaseName("ix_decks_user");

            entity.HasIndex(d => new { d.UserId, d.IsPublic })
                  .HasDatabaseName("ix_decks_user_public");

            entity.HasOne(d => d.User)
                  .WithMany()
                  .HasForeignKey(d => d.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // =====================================================================
        // CREDIARIO
        // =====================================================================
        modelBuilder.Entity<Crediario>(entity =>
        {
            entity.Property(c => c.Status)
                  .HasConversion<string>();

            entity.HasIndex(c => new { c.UserId, c.Status })
                  .HasDatabaseName("ix_crediarios_user_status");

            entity.HasIndex(c => c.Status)
                  .HasDatabaseName("ix_crediarios_status");

            entity.HasOne(c => c.User)
                  .WithMany()
                  .HasForeignKey(c => c.UserId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(c => c.Comanda)
                  .WithMany()
                  .HasForeignKey(c => c.ComandaId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(c => c.Pagamentos)
                  .WithOne(p => p.Crediario)
                  .HasForeignKey(p => p.CrediarioId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        // =====================================================================
        // PAGAMENTO CREDIARIO
        // =====================================================================
        modelBuilder.Entity<PagamentoCrediario>(entity =>
        {
            entity.HasIndex(p => p.CrediarioId)
                  .HasDatabaseName("ix_pagamentos_crediario_crediario");

            entity.HasIndex(p => p.CreatedAt)
                  .HasDatabaseName("ix_pagamentos_crediario_created_at");
        });

        // =====================================================================
        // PIX COBRANCA
        // =====================================================================
        modelBuilder.Entity<PixCobranca>(entity =>
        {
            entity.Property(p => p.Origem).HasConversion<string>();

            entity.HasIndex(p => p.TxId)
                  .IsUnique()
                  .HasDatabaseName("ix_pix_cobrancas_tx_id");

            entity.HasIndex(p => p.CrediarioId)
                  .HasDatabaseName("ix_pix_cobrancas_crediario");

            entity.HasIndex(p => p.ComandaId)
                  .HasDatabaseName("ix_pix_cobrancas_comanda");

            entity.HasIndex(p => p.ReservationGroupId)
                  .HasDatabaseName("ix_pix_cobrancas_reservation_group");

            entity.HasOne(p => p.Crediario)
                  .WithMany()
                  .HasForeignKey(p => p.CrediarioId)
                  .OnDelete(DeleteBehavior.Cascade)
                  .IsRequired(false);

            entity.HasOne(p => p.Comanda)
                  .WithMany()
                  .HasForeignKey(p => p.ComandaId)
                  .OnDelete(DeleteBehavior.Cascade)
                  .IsRequired(false);
        });

        // =====================================================================
        // PRODUCT RESERVATION
        // =====================================================================
        modelBuilder.Entity<ProductReservation>(entity =>
        {
            entity.HasIndex(r => r.ReservationGroupId)
                  .HasDatabaseName("ix_product_reservations_group");
        });

        // =====================================================================
        // EXTERNAL TRANSACTION (financeiro)
        // =====================================================================
        modelBuilder.Entity<ExternalTransaction>(entity =>
        {
            // Deduplica lançamentos de origem externa (ex.: txid Pix do Inter) —
            // última linha de defesa contra baixa dupla em reconciliação concorrente.
            // O índice já existia no DDL de startup (Program.cs); aqui fica o espelho
            // no modelo pra EnsureCreated (dev/testes) criar também.
            entity.HasIndex(x => new { x.Source, x.ExternalId })
                  .IsUnique()
                  .HasFilter("external_id IS NOT NULL")
                  .HasDatabaseName("ix_ext_tx_source_external_id");
        });

        // =====================================================================
        // LGPD REQUEST
        // =====================================================================
        modelBuilder.Entity<LgpdRequest>(entity =>
        {
            // Busca por status (lista de requisições abertas)
            entity.HasIndex(r => r.Status)
                  .HasDatabaseName("ix_lgpd_requests_status");

            // Busca por email do solicitante
            entity.HasIndex(r => r.RequesterEmail)
                  .HasDatabaseName("ix_lgpd_requests_email");

            // Relacionamento opcional com User (CPF pode não existir no cadastro)
            entity.HasOne(r => r.User)
                  .WithMany()
                  .HasForeignKey(r => r.UserId)
                  .OnDelete(DeleteBehavior.SetNull)
                  .IsRequired(false);
        });

        // =====================================================================
        // COOKIE CONSENT
        // =====================================================================
        modelBuilder.Entity<CookieConsent>(entity =>
        {
            entity.HasIndex(c => c.ConsentAt)
                  .HasDatabaseName("ix_cookie_consents_consent_at");

            entity.HasOne(c => c.User)
                  .WithMany()
                  .HasForeignKey(c => c.UserId)
                  .OnDelete(DeleteBehavior.SetNull)
                  .IsRequired(false);
        });

        // =====================================================================
        // AUDIT LOG
        // =====================================================================
        modelBuilder.Entity<AuditLog>(entity =>
        {
            // Busca por entidade afetada
            entity.HasIndex(a => new { a.EntityType, a.EntityId })
                  .HasDatabaseName("ix_audit_logs_entity");

            // Busca por ator
            entity.HasIndex(a => a.ActorUserId)
                  .HasDatabaseName("ix_audit_logs_actor");

            // Ordenação por data (query mais frequente)
            entity.HasIndex(a => a.CreatedAt)
                  .HasDatabaseName("ix_audit_logs_created_at");
        });

    }
}
