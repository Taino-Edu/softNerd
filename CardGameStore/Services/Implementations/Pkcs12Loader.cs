// =============================================================================
// Pkcs12Loader.cs — Abre certificados .pfx/.p12 sem depender do OpenSSL do SO.
//
// Certificados A1 ICP-Brasil mais antigos costumam ser empacotados com PBE
// legado (RC2/3DES + SHA1). O X509Certificate2 nativo do .NET no Linux delega
// a decodificação do PKCS#12 ao OpenSSL do sistema, que desde a versão 3
// desativa esses algoritmos por padrão (erro "senha incorreta" mesmo com a
// senha certa). Setar OPENSSL_CONF pro provider "legacy" não resolve de forma
// confiável: o runtime do .NET nem sempre honra essa variável na inicialização
// da sua própria camada nativa de criptografia — confirmado em produção.
//
// BouncyCastle implementa PKCS#12 inteiramente em C# gerenciado, sem chamar o
// OpenSSL do sistema — funciona igual em qualquer SO/container.
// =============================================================================

using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using Org.BouncyCastle.Pkcs;
using Org.BouncyCastle.Security;
using RsaPrivateCrtKeyParameters = Org.BouncyCastle.Crypto.Parameters.RsaPrivateCrtKeyParameters;

namespace CardGameStore.Services.Implementations;

public static class Pkcs12Loader
{
    /// <summary>
    /// Abre um .pfx/.p12 e devolve um X509Certificate2 com a chave privada anexada,
    /// pronto para assinatura (NFe.Assina) ou uso como certificado de cliente mTLS.
    /// Tenta o caminho nativo primeiro (mais rápido, cobre a maioria dos certificados
    /// modernos) e só recorre ao BouncyCastle se o nativo rejeitar por causa de
    /// algoritmo — evita reescrever o caminho feliz que já funciona hoje.
    /// </summary>
    public static X509Certificate2 Abrir(byte[] pfxBytes, string senha)
    {
        try
        {
            // .NET 10: o construtor que lê PFX ficou obsoleto; o carregador novo tem limites de
            // segurança e, se recusar o arquivo, cai no BouncyCastle abaixo como antes
            return X509CertificateLoader.LoadPkcs12(pfxBytes, senha, X509KeyStorageFlags.Exportable);
        }
        catch (CryptographicException)
        {
            return AbrirComBouncyCastle(pfxBytes, senha);
        }
    }

    private static X509Certificate2 AbrirComBouncyCastle(byte[] pfxBytes, string senha)
    {
        Pkcs12Store store;
        try
        {
            store = new Pkcs12StoreBuilder().Build();
            using var ms = new MemoryStream(pfxBytes);
            store.Load(ms, senha.ToCharArray());
        }
        catch (Exception ex)
        {
            // Mantém o mesmo tipo de exceção do caminho nativo — quem chama já trata
            // CryptographicException (ex: FiscalCertificadoService.Validar).
            throw new CryptographicException("Senha incorreta ou arquivo de certificado inválido.", ex);
        }

        var alias = store.Aliases.Cast<string>().FirstOrDefault(store.IsKeyEntry)
            ?? throw new CryptographicException("O certificado não possui chave privada — verifique se é um .pfx/.p12 válido.");

        var certificadoBc = store.GetCertificate(alias).Certificate;
        var chaveBc       = store.GetKey(alias).Key;

        using var x509SemChave = X509CertificateLoader.LoadCertificate(certificadoBc.GetEncoded());

        // Certificados A1 ICP-Brasil são sempre RSA (exigência da política de
        // certificação do ITI) — não há necessidade prática de suportar EC aqui.
        if (chaveBc is not RsaPrivateCrtKeyParameters rsaKey)
            throw new CryptographicException(
                $"Tipo de chave privada não suportado: {chaveBc.GetType().Name}. Certificados A1 ICP-Brasil usam RSA.");

        using var rsa = RSA.Create();
        rsa.ImportParameters(DotNetUtilities.ToRSAParameters(rsaKey));
        return x509SemChave.CopyWithPrivateKey(rsa);
    }
}
