// =============================================================================
// ImagemApiSemEmsignTests.cs — a imagem da API não confia na CA eMudhra (emSign)
//
// A eMudhra teve as chaves privadas vazadas em 21/10/2026: com elas dá pra emitir certificado
// falso pro Inter ou pra SEFAZ. O Dockerfile tira as raízes emSign da lista de confiança e o
// próprio build falha se sobrar alguma. Este teste trava que esse passo continue lá.
// =============================================================================

namespace CardGameStore.Tests.Deploy;

public class ImagemApiSemEmsignTests
{
    [Fact]
    public void Dockerfile_TiraAsRaizesEmSign_EFalhaOBuildSeSobrar()
    {
        var texto = File.ReadAllText(Dockerfile()).Replace("\r\n", "\n");

        texto.Should().Contain(@"s#^(mozilla/emSign[^[:space:]]*\.crt)$#!\1#' /etc/ca-certificates.conf",
            "as raízes emSign ficam marcadas como não confiáveis (! no ca-certificates.conf)");
        texto.Should().Contain("update-ca-certificates --fresh");
        texto.Should().Contain("grep -qi emsign; then", "se alguma raiz emSign sobrar, o build para");
    }

    private static string Dockerfile()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidato = Path.Combine(dir.FullName, "CardGameStore", "Dockerfile");
            if (File.Exists(candidato)) return candidato;
            dir = dir.Parent;
        }
        throw new FileNotFoundException("CardGameStore/Dockerfile não encontrado");
    }
}
