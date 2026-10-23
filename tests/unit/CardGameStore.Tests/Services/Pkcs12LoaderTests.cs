// =============================================================================
// Pkcs12LoaderTests.cs — abrir o certificado A1 (.pfx) da NFC-e/SEFAZ
//
// No .NET 10 o construtor X509Certificate2(byte[], senha) ficou obsoleto; o Pkcs12Loader passou
// a usar o X509CertificateLoader (com o BouncyCastle de reserva). Estes testes geram o .pfx na hora
// — moderno (AES) e no formato antigo dos A1 (3DES/SHA-1) — e conferem chave privada e senha errada.
// =============================================================================

using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using CardGameStore.Services.Implementations;

namespace CardGameStore.Tests.Services;

public class Pkcs12LoaderTests
{
    private const string Senha = "senha-do-a1";

    private static byte[] Pfx(PbeParameters protecao)
    {
        using var rsa = RSA.Create(2048);
        var pedido = new CertificateRequest("CN=LOJA TESTE:12345678000199", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var cert = pedido.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddYears(1));
        return cert.ExportPkcs12(protecao, Senha);
    }

    public static TheoryData<string, PbeParameters> Formatos => new()
    {
        { "moderno (AES-256)", new PbeParameters(PbeEncryptionAlgorithm.Aes256Cbc, HashAlgorithmName.SHA256, 2000) },
        { "antigo dos A1 (3DES/SHA-1)", new PbeParameters(PbeEncryptionAlgorithm.TripleDes3KeyPkcs12, HashAlgorithmName.SHA1, 2000) },
    };

    [Theory]
    [MemberData(nameof(Formatos))]
    public void Abrir_DevolveOCertificadoComChavePrivada(string formato, PbeParameters protecao)
    {
        using var cert = Pkcs12Loader.Abrir(Pfx(protecao), Senha);

        cert.HasPrivateKey.Should().BeTrue(formato);
        cert.Subject.Should().Contain("LOJA TESTE");
        using var rsa = cert.GetRSAPrivateKey();
        rsa!.SignData([1, 2, 3], HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1).Should().NotBeEmpty("assinar a NFC-e precisa da chave");
    }

    [Fact]
    public void Abrir_SenhaErrada_DaCryptographicException()
    {
        var pfx = Pfx(new PbeParameters(PbeEncryptionAlgorithm.Aes256Cbc, HashAlgorithmName.SHA256, 2000));

        var acao = () => Pkcs12Loader.Abrir(pfx, "outra-senha");

        acao.Should().Throw<CryptographicException>("quem chama (FiscalCertificadoService.Validar) trata esse tipo");
    }
}
