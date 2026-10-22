// =============================================================================
// NginxNaVersaoDoComposeTests.cs — trocar a versão do nginx tem que trocar de verdade
//
// O update.sh só dava "nginx -s reload" quando a montagem estava certa: trocar a imagem no
// docker-compose.prod.yml não fazia nada (o reload troca a config, não o programa) e a
// produção seguiria na versão velha achando que estava corrigida. Agora ele compara a
// imagem no ar com a do compose e recria quando muda (v1.64.3, nginx 1.27 → 1.30.6).
// =============================================================================

using System.Text.RegularExpressions;

namespace CardGameStore.Tests.Deploy;

public class NginxNaVersaoDoComposeTests
{
    [Fact]
    public void Compose_PrendeONginxNumaVersaoExata()
    {
        var compose = File.ReadAllText(Arquivo("docker-compose.prod.yml")).Replace("\r\n", "\n");
        var bloco = Regex.Match(compose, @"\n  nginx:\n(.*?)\n  [a-z]", RegexOptions.Singleline).Groups[1].Value;
        var imagem = Regex.Match(bloco, @"\n\s*image:\s*(\S+)").Groups[1].Value;

        imagem.Should().MatchRegex(@"^nginx:\d+\.\d+\.\d+-alpine$",
            "a porta de entrada da internet fica presa na versão corrigida, não num \"1.30\" que pode vir velho do cache");
    }

    [Fact]
    public void Update_RecriaQuandoAImagemMuda_EValidaComAImagemNova()
    {
        var update = File.ReadAllText(Arquivo("update.sh"));

        update.Should().NotMatchRegex(@"nginx:\d", "a versão do nginx mora só no compose; número solto aqui fica pra trás na próxima troca");
        update.Should().Contain("{{.Config.Image}}", "precisa comparar a imagem no ar com a do compose");
        update.Should().Contain("\"$IMAGEM_NGINX\" sh -c 'test -s /etc/nginx/snippets/locations.conf", "a config é validada com a imagem NOVA antes de trocar, e só vale se o container enxergar os nossos arquivos (montagem vazia passa no nginx -t)");
        update.Should().Contain("docker pull -q \"$IMAGEM_NGINX\"", "baixa antes de derrubar o antigo: a janela sem nginx fica só no stop/start");
    }

    /// <summary>Arquivo em deploy/ do repositório (pelo arquivo: no Windows "deploy" também casa com a pasta de testes Deploy).</summary>
    private static string Arquivo(string nome)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidato = Path.Combine(dir.FullName, "deploy", nome);
            if (File.Exists(candidato)) return candidato;
            dir = dir.Parent;
        }
        throw new FileNotFoundException($"deploy/{nome} não encontrado");
    }
}
