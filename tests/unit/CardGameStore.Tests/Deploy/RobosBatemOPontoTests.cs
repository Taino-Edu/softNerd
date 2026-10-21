// =============================================================================
// RobosBatemOPontoTests.cs — todo robô avisa o Vigia que está vivo (BatimentoRobos)
//
// O gatilho "robô parado" (Services/Vigia/VerificacoesOperacao.cs) só enxerga quem bate o
// ponto. Robô novo sem Iniciou/Bateu/Falhou pararia em silêncio — este teste pega.
// =============================================================================

namespace CardGameStore.Tests.Deploy;

public class RobosBatemOPontoTests
{
    /// <summary>O próprio Vigia não se vigia (ele é quem roda a verificação).</summary>
    private static readonly string[] Excecoes = ["VigiaBackgroundService.cs"];

    [Fact]
    public void TodoRobo_DeclaraBateEFalhaNoBatimento()
    {
        var pasta = AcharPasta(Path.Combine("CardGameStore", "Services"));
        var robos = Directory.GetFiles(pasta, "*.cs", SearchOption.AllDirectories)
            .Select(f => (Arquivo: Path.GetFileName(f), Texto: File.ReadAllText(f)))
            .Where(f => System.Text.RegularExpressions.Regex.IsMatch(f.Texto, @":\s*BackgroundService\b") && !Excecoes.Contains(f.Arquivo))
            .ToList();
        robos.Should().NotBeEmpty();

        var semPonto = robos
            .Where(r => !(r.Texto.Contains("BatimentoRobos.Iniciou(") && r.Texto.Contains("BatimentoRobos.Bateu(")
                          && r.Texto.Contains("BatimentoRobos.Falhou(")))
            .Select(r => r.Arquivo).ToList();

        semPonto.Should().BeEmpty("todo robô chama BatimentoRobos.Iniciou antes da 1ª espera, Bateu no fim da volta e " +
                                  "Falhou no catch — senão o Vigia não percebe quando ele para (docs/mapa/README.md → Vigia)");
    }

    private static string AcharPasta(string relativo)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidato = Path.Combine(dir.FullName, relativo);
            if (Directory.Exists(candidato)) return candidato;
            dir = dir.Parent;
        }
        throw new DirectoryNotFoundException($"Não achei {relativo} subindo a partir de {AppContext.BaseDirectory}");
    }
}
