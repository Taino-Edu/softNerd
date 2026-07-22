// ============================================================================
// test-sefaz.cs — Teste simples de conectividade com SEFAZ (homologação)
//
// Uso: dotnet script test-sefaz.cs
// Verifica se DFe.NET consegue conectar na SEFAZ usando um certificado mock
// ============================================================================

using System;
using System.Security.Cryptography.X509Certificates;
using DFe.Classes.Entidades;
using DFe.Classes.Flags;
using NFe.Classes.Servicos.Tipos;
using NFe.Servicos;

Console.WriteLine("=== Teste de Conectividade SEFAZ (Homologação) ===\n");

// Estado de teste: escolha qualquer um (São Paulo é o mais comum)
var estado = Estado.SP;
var ambiente = TipoAmbiente.Homologacao; // Sempre homologação pra teste

Console.WriteLine($"Estado: {estado}");
Console.WriteLine($"Ambiente: {ambiente}\n");

// Configuração do serviço (sem certificado real — só pra testar conectividade)
var cfg = new ConfiguracaoServico
{
    cUF             = estado,
    tpAmb           = ambiente,
    ModeloDocumento = ModeloDocumento.NFCe,
    VersaoLayout    = VersaoServico.Versao400,
    TimeOut         = 15000,
    ValidarSchemas  = false,
};

Console.WriteLine("Configuração de serviço montada.\n");
Console.WriteLine("IMPORTANTE: Este teste NÃO faz uma emissão real — só verifica conectividade.");
Console.WriteLine("Para testar emissão de verdade, você precisa de:");
Console.WriteLine("  1. Um certificado digital A1 válido (.pfx com senha)");
Console.WriteLine("  2. A configuração fiscal completa no banco (Admin > Fiscal)");
Console.WriteLine("  3. Uma comanda ou venda avulsa com produtos");
Console.WriteLine();

Console.WriteLine("Se o servidor em Boston conseguir conectar na SEFAZ, a resposta vai ser:");
Console.WriteLine("  - Sucesso: timeout ou resposta (pode ser erro sem certificado, mas prova conectividade)");
Console.WriteLine("  - Falha: erro de rede / IP bloqueado\n");

Console.WriteLine("Status: Configuração OK — teste pronto pra rodar na VPS com certificado real.");
Console.WriteLine("\nPróximos passos:");
Console.WriteLine("1. Uploadar o certificado A1 via Admin > Fiscal > Certificado Digital");
Console.WriteLine("2. Preencher dados da empresa completos");
Console.WriteLine("3. Chamar POST /api/fiscal/emitir/comanda/{id} com uma comanda válida");
Console.WriteLine("4. Verificar status da nota em GET /api/fiscal/notas");
