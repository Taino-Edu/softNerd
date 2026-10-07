// =============================================================================
// InicializacaoBanco.cs — o que roda no banco a cada startup da API
//
// 1. EnsureCreated (banco vazio → cria tudo a partir do AppDbContext)
// 2. Data/Inicializacao/postgres.sql (prod) ou sqlite.sql (dev): tabelas e
//    colunas novas em banco que já existe — não há migrations
// 3. Correções de dados de uma vez só (crediário, formas de pagamento)
// 4. Seed do admin
//
// Os .sql vão embutidos na DLL (EmbeddedResource no .csproj) e rodam direto no
// DbCommand, sem passar pelo ExecuteSqlRaw — então chaves no SQL não quebram mais.
// =============================================================================

using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using Microsoft.EntityFrameworkCore;
using MongoDB.Driver;

namespace CardGameStore.Data;

public static class InicializacaoBanco
{
    /// <summary>SQLite não tem ADD COLUMN IF NOT EXISTS: cada coluna nova roda isolada.</summary>
    private static readonly string[] ColunasSqlite =
    [
        "ALTER TABLE championships ADD COLUMN minutos_para_pagar INTEGER NOT NULL DEFAULT 30;",
        "ALTER TABLE crediarios ADD COLUMN pagamento_token TEXT NULL;",
        "ALTER TABLE pix_cobrancas ADD COLUMN crediario_ids_json TEXT NULL;",
        "ALTER TABLE championship_participants ADD COLUMN inscricao_expira_em TEXT NULL;",
    ];

    public static async Task ExecutarAsync(IServiceProvider services, bool useSqlite)
    {
        using var scope = services.CreateScope();
        var db     = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("InicializacaoBanco");

        try
        {
            // EnsureCreated usa o provider correto (SQLite em dev, Npgsql em prod)
            // e cria as tabelas com os tipos nativos de cada banco.
            // Migrations virão numa próxima fase quando o schema estiver estável.
            logger.LogInformation("Inicializando banco de dados...");
            await db.Database.EnsureCreatedAsync();
            logger.LogInformation("Banco pronto.");

            // Cria tabelas/colunas novas que EnsureCreated não alcança em bancos já existentes.
            // EnsureCreated retorna false sem alterar nada se já existirem tabelas no banco,
            // por isso usamos DDL explícito com IF NOT EXISTS para tornar o startup idempotente.
            if (!useSqlite)
            {
                await ExecutarScriptAsync(db, "postgres.sql");
            }
            else
            {
                // SQLite (dev): EnsureCreated não mexe em banco já existente, então a
                // tabela nova precisa do mesmo empurrão que o Postgres leva acima.
                await ExecutarScriptAsync(db, "sqlite.sql");

                // SQLite não tem ADD COLUMN IF NOT EXISTS: rodar de novo num banco que já tem
                // a coluna estoura "duplicate column name". Cada uma vai isolada e o erro
                // esperado é engolido — mesmo efeito do IF NOT EXISTS do Postgres.
                foreach (var ddl in ColunasSqlite)
                {
                    try { await db.Database.ExecuteSqlRawAsync(ddl); }
                    catch (Exception ex) when (ex.Message.Contains("duplicate column", StringComparison.OrdinalIgnoreCase)) { }
                }
            }

            // Crediário: contas de antes da separação por compra ganham seus lançamentos.
            // Falha aqui não derruba a API — a conta só fica sem a lista de compras até o
            // próximo startup tentar de novo.
            try
            {
                var convertidas = await CrediarioLancamentos
                    .ConverterContasAntigasAsync(db);
                if (convertidas > 0)
                    logger.LogInformation("Crediário: {Qtd} conta(s) antiga(s) convertidas em lançamentos por compra.", convertidas);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Crediário: falha ao converter contas antigas em lançamentos.");
            }

            // Vendas gravadas com "Débito"/"Crédito" (homologação de reserva) → códigos certos.
            // Mongo fora do ar não pode travar o start: só registra e segue.
            try
            {
                var mongoDb   = scope.ServiceProvider.GetRequiredService<IMongoDatabase>();
                var corrigidas = await VendaAvulsaService.CorrigirFormasLegadasAsync(mongoDb);
                if (corrigidas > 0)
                    logger.LogInformation("Pagamentos: {Qtd} forma(s) de pagamento legada(s) corrigida(s) em vendas avulsas.", corrigidas);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Pagamentos: não deu pra corrigir formas de pagamento legadas agora (Mongo indisponível?).");
            }

            // Crediário: contas de antes do link de pagamento ganham o código delas.
            try
            {
                if (useSqlite)
                    await db.Database.ExecuteSqlRawAsync(
                        "CREATE UNIQUE INDEX IF NOT EXISTS ux_crediarios_pagamento_token ON crediarios (pagamento_token) WHERE pagamento_token IS NOT NULL;");
                var comToken = await CrediarioPixService.GarantirTokensAsync(db);
                if (comToken > 0)
                    logger.LogInformation("Crediário: {Qtd} conta(s) ganharam link de pagamento.", comToken);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Crediário: falha ao gerar os links de pagamento das contas antigas.");
            }

            // Seed: cria o admin se não existir
            if (!db.Users.Any(u => u.Email == "admin@cardgamestore.com.br"))
            {
                var adminPassword = Environment.GetEnvironmentVariable("ADMIN_SEED_PASSWORD") ?? "SenhaForte@123";
                if (adminPassword == "SenhaForte@123")
                    logger.LogWarning("ATENÇÃO: admin criado com senha padrão. Defina ADMIN_SEED_PASSWORD no ambiente de produção!");

                db.Users.Add(new User
                {
                    Id           = Guid.Parse("00000000-0000-0000-0000-000000000001"),
                    Name         = "Maikon",
                    Email        = "admin@cardgamestore.com.br",
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword(adminPassword),
                    Role         = UserRole.Admin,
                    IsActive     = true,
                    CreatedAt    = DateTime.UtcNow,
                    UpdatedAt    = DateTime.UtcNow
                });
                await db.SaveChangesAsync();
                logger.LogInformation("Usuário admin criado com sucesso.");
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Erro ao inicializar o banco: {Msg}", ex.Message);
            throw;
        }
    }

    /// <summary>Roda um .sql embutido (Data/Inicializacao) direto na conexão.</summary>
    private static async Task ExecutarScriptAsync(AppDbContext db, string arquivo)
    {
        var sql = LerScript(arquivo);
        var conexao = db.Database.GetDbConnection();
        var abriu = conexao.State != System.Data.ConnectionState.Open;
        if (abriu) await db.Database.OpenConnectionAsync();
        try
        {
            await using var cmd = conexao.CreateCommand();
            cmd.CommandText = sql;
            cmd.CommandTimeout = 300;
            await cmd.ExecuteNonQueryAsync();
        }
        finally
        {
            if (abriu) await db.Database.CloseConnectionAsync();
        }
    }

    internal static string LerScript(string arquivo)
    {
        var nome = $"CardGameStore.Data.Inicializacao.{arquivo}";
        using var stream = typeof(InicializacaoBanco).Assembly.GetManifestResourceStream(nome)
            ?? throw new InvalidOperationException($"Script de inicialização não encontrado: {nome}");
        using var leitor = new StreamReader(stream);
        return leitor.ReadToEnd();
    }
}
