// =============================================================================
// RobosNaTrocaSemQuedaTests.cs — garantia que a troca sem queda depende
//
// Na troca sem queda (deploy/rollout.sh) a API nova sobe AO LADO da antiga e as
// duas ficam no ar por até ~1 minuto. Os robôs (Pix, NFC-e, avisos do crediário…)
// só não rodam em dobro porque todos esperam pelo menos 1 minuto antes da primeira
// volta — e o rollout desiste se a nova não responder em 45 s (45 + 7 de DNS = 52 s < 60).
// Robô novo que começa antes disso quebra a garantia: este teste falha.
// =============================================================================

using System.Text.RegularExpressions;

namespace CardGameStore.Tests.Deploy;

public class RobosNaTrocaSemQuedaTests
{
    [Fact]
    public void TodoRobo_EsperaPeloMenos1MinutoAntesDaPrimeiraVolta()
    {
        var pastaServicos = AcharPasta(Path.Combine("CardGameStore", "Services"));
        var robos = Directory.GetFiles(pastaServicos, "*.cs", SearchOption.AllDirectories)
            .Select(f => (Arquivo: Path.GetFileName(f), Texto: File.ReadAllText(f)))
            .Where(f => Regex.IsMatch(f.Texto, @":\s*BackgroundService\b"))
            .ToList();

        robos.Should().NotBeEmpty("a varredura precisa achar os robôs, senão o teste não protege nada");

        var problemas = new List<string>();
        foreach (var (arquivo, texto) in robos)
        {
            var inicio = texto.IndexOf("ExecuteAsync(", StringComparison.Ordinal);
            var primeiraVolta = inicio < 0 ? -1 : texto.IndexOf("while", inicio, StringComparison.Ordinal);
            var antesDaVolta = inicio < 0 || primeiraVolta < 0 ? "" : texto[inicio..primeiraVolta];

            var espera = Regex.Match(antesDaVolta, @"Task\.Delay\(\s*TimeSpan\.From(Minutes|Hours)\(\s*(\d+)");
            var ok = espera.Success && (espera.Groups[1].Value == "Hours" || int.Parse(espera.Groups[2].Value) >= 1);
            if (!ok) problemas.Add(arquivo);
        }

        problemas.Should().BeEmpty(
            "todo robô precisa de `await Task.Delay(TimeSpan.FromMinutes(1+), ct)` antes do while — " +
            "senão a API nova e a antiga rodam o robô juntas durante a troca (deploy/rollout.sh)");
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
