// ============================================================================
// test-emissao-sefaz.cs — Teste real de emissão NFC-e contra SEFAZ
//
// Este programa:
//   1. Conecta ao banco PostgreSQL (ou SQLite em dev)
//   2. Verifica FiscalConfig + certificado
//   3. Busca uma comanda com itens
//   4. Tenta emitir uma NFC-e real contra SEFAZ de homologação
//   5. Mostra o resultado (protocolo/erro)
//
// Compilar/Rodar: dotnet run
// ============================================================================

using System;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;

Console.WriteLine("=== Teste de Emissão NFC-e contra SEFAZ (Homologação) ===\n");

// Montar DI container (mesmo do Program.cs)
var config = new ConfigurationBuilder()
    .SetBasePath(Directory.GetCurrentDirectory())
    .AddJsonFile("appsettings.json")
    .Build();

var services = new ServiceCollection();
services.AddLogging(c => c.AddConsole());
services.Configure<JwtSettings>(config.GetSection("JwtSettings"));

// Banco
var pgConnStr = config.GetConnectionString("PostgreSQL");
var useSqlite = string.IsNullOrWhiteSpace(pgConnStr);

services.AddDbContext<AppDbContext>(options =>
{
    if (useSqlite)
    {
        var dbPath = Path.Combine(Directory.GetCurrentDirectory(), "cardgamestore.db");
        options.UseSqlite($"Data Source={dbPath}");
    }
    else
    {
        options.UseNpgsql(pgConnStr);
    }
});

// Serviços fiscal
services.AddSingleton(sp => new EncryptionService(config));
services.AddScoped<INfceEmissionService, NfceEmissionService>();
services.AddSingleton<IMongoClient>(new MongoDB.Driver.MongoClient("mongodb://localhost:27017"));
services.AddSingleton(sp =>
{
    var client = sp.GetRequiredService<IMongoClient>();
    return client.GetDatabase("cardgamestore_cache");
});

var serviceProvider = services.BuildServiceProvider();
var db = serviceProvider.GetRequiredService<AppDbContext>();
var emissao = serviceProvider.GetRequiredService<INfceEmissionService>();

try
{
    // Verificar configuração fiscal
    var cfg = await db.FiscalConfigs.FindAsync(FiscalConfig.SingletonId);
    if (cfg is null || !cfg.CertificadoConfigurado)
    {
        Console.WriteLine("❌ ERRO: Configuração fiscal ou certificado não encontrado.");
        Console.WriteLine("   Faça upload do certificado via Admin > Fiscal > Certificado Digital\n");
        return;
    }

    Console.WriteLine("✅ FiscalConfig encontrada:");
    Console.WriteLine($"   CNPJ: {cfg.Cnpj}");
    Console.WriteLine($"   Razão Social: {cfg.RazaoSocial}");
    Console.WriteLine($"   Ambiente: {cfg.Ambiente}");
    Console.WriteLine($"   Certificado: Válido até {cfg.CertificadoValidade:dd/MM/yyyy}\n");

    // Buscar uma comanda com itens
    var comanda = await db.Comandas
        .Include(c => c.Items)
        .ThenInclude(i => i.Product)
        .ThenInclude(p => p!.NaturezaOperacao)
        .FirstOrDefaultAsync(c => c.Items.Count > 0);

    if (comanda is null)
    {
        Console.WriteLine("❌ ERRO: Nenhuma comanda com itens encontrada no banco.");
        Console.WriteLine("   Crie uma comanda com produtos para fazer o teste.\n");
        return;
    }

    Console.WriteLine($"✅ Comanda encontrada para teste: {comanda.Id}");
    Console.WriteLine($"   Itens: {comanda.Items.Count}");
    Console.WriteLine($"   Valor Total: R$ {comanda.Items.Sum(i => i.SubtotalInCents) / 100m:F2}\n");

    // Tentar emissão
    Console.WriteLine("🚀 Iniciando emissão contra SEFAZ de homologação...\n");
    var nota = await emissao.EmitirParaComandaAsync(comanda.Id);

    Console.WriteLine("=== RESULTADO ===\n");
    Console.WriteLine($"ID da Nota: {nota.Id}");
    Console.WriteLine($"Status: {nota.Status}");

    if (nota.Status == NotaFiscalStatus.Autorizada)
    {
        Console.WriteLine($"✅ SUCESSO! A NFC-e foi autorizada pela SEFAZ:");
        Console.WriteLine($"   Protocolo: {nota.Protocolo}");
        Console.WriteLine($"   Chave de Acesso: {nota.ChaveAcesso}");
        Console.WriteLine($"   Série: {nota.Serie}");
        Console.WriteLine($"   Número: {nota.Numero}");
        Console.WriteLine($"   QR Code: {nota.UrlQrCode}\n");
        Console.WriteLine("🎉 A nota foi transmitida com sucesso!");
        Console.WriteLine("   O cliente pode ver o cupom com a chave de acesso.");
    }
    else if (nota.Status == NotaFiscalStatus.AutorizadaContingencia)
    {
        Console.WriteLine($"⚠️  Emitida em CONTINGÊNCIA (SEFAZ inalcançável):");
        Console.WriteLine($"   Chave: {nota.ChaveAcesso}");
        Console.WriteLine($"   A retransmissão automática tentará depois.");
    }
    else if (nota.Status == NotaFiscalStatus.Rejeitada)
    {
        Console.WriteLine($"❌ REJEITADA pela SEFAZ:");
        Console.WriteLine($"   Motivo: {nota.MotivoRejeicao}");
    }
    else if (nota.Status == NotaFiscalStatus.PendenteEmissao)
    {
        Console.WriteLine($"⏳ Ainda PENDENTE:");
        Console.WriteLine($"   Motivo: {nota.MotivoRejeicao}");
    }

    Console.WriteLine();
}
catch (Exception ex)
{
    Console.WriteLine($"❌ ERRO durante o teste:\n{ex.Message}\n");
    if (ex.InnerException != null)
        Console.WriteLine($"Causa raiz: {ex.InnerException.Message}");
}
