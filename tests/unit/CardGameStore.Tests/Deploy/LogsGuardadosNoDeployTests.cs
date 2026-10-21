// =============================================================================
// LogsGuardadosNoDeployTests.cs — o log de um container não pode sumir no deploy
//
// Até a v1.63, o rollout.sh apagava o container antigo (docker rm) e o log ia junto:
// quando o Maikon relatou "o sistema caiu", não havia o que ler. Agora todo docker rm
// do rollout guarda o log antes (guardar_log). Este teste trava isso.
// =============================================================================

using System.Text.RegularExpressions;

namespace CardGameStore.Tests.Deploy;

public class LogsGuardadosNoDeployTests
{
    [Fact]
    public void TodoDockerRm_GuardaOLogAntes()
    {
        var linhas = File.ReadAllLines(Rollout());

        var remocoes = linhas.Select((l, i) => (Linha: l.Trim(), I: i))
            .Where(x => Regex.IsMatch(x.Linha, @"^docker rm\s+""\$(\w+)""")).ToList();
        remocoes.Should().NotBeEmpty("a varredura precisa achar os docker rm, senão o teste não protege nada");

        foreach (var (linha, i) in remocoes)
        {
            var alvo = Regex.Match(linha, @"^docker rm\s+""\$(\w+)""").Groups[1].Value;
            var anterior = linhas.Take(i).Reverse().Select(l => l.Trim()).FirstOrDefault(l => l.Length > 0 && !l.StartsWith('#'));
            anterior.Should().Be($"guardar_log \"${alvo}\"",
                $"a linha {i + 1} (\"{linha}\") apaga o container sem guardar o log dele antes");
        }
    }

    [Fact]
    public void GuardarLog_NaoDerrubaODeploy()
    {
        var texto = File.ReadAllText(Rollout()).Replace("\r\n", "\n");
        var funcao = Regex.Match(texto, @"guardar_log\(\)\s*\{(.*?)\n\}", RegexOptions.Singleline).Groups[1].Value;

        funcao.Should().NotBeEmpty();
        funcao.Should().Contain("if ", "falha ao guardar (disco, permissão) não pode parar a troca — set -e mataria o deploy");
        funcao.Should().Contain("-mtime", "logs guardados precisam de prazo pra não encher o disco da VPS");
        funcao.Should().Contain("umask 077", "log pode ter dado de cliente (LGPD): arquivo só do root");

        // Com set -e, comando solto que falha mata o deploy (aconteceu no teste: mkdir -m no Windows)
        var soltos = funcao.Split('\n').Select(l => l.Trim())
            .Where(l => Regex.IsMatch(l, @"^(mkdir|chmod|find|install|rm)\b") && !l.Contains("|| true"))
            .ToList();
        soltos.Should().BeEmpty("todo comando que pode falhar no guardar_log precisa de \"|| true\" ou estar num if");
    }

    /// <summary>deploy/rollout.sh do repositório (pelo arquivo: no Windows "deploy" também casa com a pasta de testes Deploy).</summary>
    private static string Rollout()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidato = Path.Combine(dir.FullName, "deploy", "rollout.sh");
            if (File.Exists(candidato)) return candidato;
            dir = dir.Parent;
        }
        throw new FileNotFoundException($"Não achei deploy/rollout.sh subindo a partir de {AppContext.BaseDirectory}");
    }
}
