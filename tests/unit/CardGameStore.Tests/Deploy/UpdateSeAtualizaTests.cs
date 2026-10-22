// =============================================================================
// UpdateSeAtualizaTests.cs — mudança no update.sh vale no MESMO deploy
//
// O update.sh faz git pull de si mesmo, mas o bash segue lendo o arquivo que já abriu:
// a troca do nginx da v1.64.3 só aconteceu numa 2ª passada do deploy. Agora, se o pull
// mudou o arquivo, o script roda de novo o novo (uma vez, sem repetir o backup).
// =============================================================================

using System.Text.RegularExpressions;

namespace CardGameStore.Tests.Deploy;

public class UpdateSeAtualizaTests
{
    [Fact]
    public void DepoisDoPull_SeOArquivoMudou_RodaONovoUmaVezSo()
    {
        var linhas = File.ReadAllLines(Update()).Select(l => l.Trim()).ToList();

        var antes = linhas.FindIndex(l => l.StartsWith("ASSINATURA_ANTES="));
        var fetch = linhas.FindIndex(l => l == "git fetch origin");
        var pull  = linhas.FindIndex(l => l == "git pull origin main");
        var exec  = linhas.FindIndex(l => l.StartsWith("exec env UPDATE_REEXEC=1 bash"));
        var docker = linhas.FindIndex(l => Regex.IsMatch(l, @"^docker\b|\$\(docker\b"));

        antes.Should().BeGreaterThan(-1).And.BeLessThan(fetch, "a assinatura é tirada antes de o git mexer no arquivo");
        exec.Should().BeGreaterThan(pull, "só depois do pull dá pra saber se o arquivo mudou");
        exec.Should().BeLessThan(docker, "o novo assume antes de qualquer build/troca de container");
        linhas[exec].Should().EndWith("\"$@\"", "a volta pra uma versão (update.sh <commit>) precisa seguir no novo");

        var guarda = linhas[exec - 2];
        guarda.Should().Contain("UPDATE_REEXEC:-0}\" != \"1\"", "sem a trava, um arquivo que muda a cada pull entraria em laço");
    }

    [Fact]
    public void NaSegundaVolta_NaoRepeteOBackup()
    {
        var texto = File.ReadAllText(Update()).Replace("\r\n", "\n");
        var bloco = Regex.Match(texto, @"if \[ ""\$\{UPDATE_REEXEC:-0\}"" = ""1"" \]; then\n(.*?)\nelif", RegexOptions.Singleline);

        bloco.Success.Should().BeTrue("o backup é pulado quando o update.sh já se reiniciou");
        bloco.Groups[1].Value.Should().NotContain("backup.sh");
    }

    private static string Update()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidato = Path.Combine(dir.FullName, "deploy", "update.sh");
            if (File.Exists(candidato)) return candidato;
            dir = dir.Parent;
        }
        throw new FileNotFoundException("deploy/update.sh não encontrado");
    }
}
