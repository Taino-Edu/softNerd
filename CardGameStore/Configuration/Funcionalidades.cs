// =============================================================================
// Funcionalidades.cs — catálogo das chaves de funcionalidade ("mudança com volta")
//
// Regra da casa: mudança GRANDE de comportamento entra atrás de uma chave. O jeito
// antigo continua no código; se o novo der problema em produção, o dono desliga a
// chave em /admin/funcionalidades e o sistema volta na hora, sem deploy.
//
// Ciclo de vida de uma chave (docs/mapa/README.md → "Mudança grande: sempre com volta"):
//   1. nasce aqui, com o código novo e o antigo lado a lado, os dois com teste;
//   2. sobe ligada (Padrao: true) — a volta é pra emergência, não pra testar em produção;
//   3. passada a data de RevisarEm sem problema, um PR apaga o código antigo,
//      a chave daqui e a linha dela no banco.
//
// Este arquivo é a fonte da verdade: o banco (tabela funcionalidades) só guarda
// quem foi mudado à mão. Chave que não está aqui não existe.
// =============================================================================

namespace CardGameStore.Configuration;

/// <param name="Codigo">Identificador estável (kebab-case). Vai pro banco e pro front.</param>
/// <param name="Nome">Como aparece na tela do admin.</param>
/// <param name="OQueMuda">O comportamento novo, em linguagem de loja.</param>
/// <param name="SeDesligar">O que acontece ao voltar pro jeito antigo.</param>
/// <param name="Padrao">Estado enquanto ninguém mexeu.</param>
/// <param name="Desde">Versão em que a chave entrou.</param>
/// <param name="RevisarEm">Data pra apagar o jeito antigo, se nada deu errado.</param>
public sealed record Funcionalidade(
    string   Codigo,
    string   Nome,
    string   OQueMuda,
    string   SeDesligar,
    bool     Padrao,
    string   Desde,
    DateOnly RevisarEm);

public static class Funcionalidades
{
    public const string LigaMensalPorJogador = "liga-mensal-por-jogador";
    public const string OperadorAcessoPeloMenu = "operador-acesso-pelo-menu";

    public static readonly IReadOnlyList<Funcionalidade> Catalogo =
    [
        new(LigaMensalPorJogador,
            Nome:       "Liga Mensal: ranking por jogador",
            OQueMuda:   "Cada jogador do sistema tem a sua linha, mesmo com nome igual ao de outro. " +
                        "Campeonato cancelado não soma pontos.",
            SeDesligar: "Volta a juntar por nome: dois jogadores com o mesmo nome viram uma linha só " +
                        "e um deles perde os pontos. Campeonato cancelado volta a somar.",
            Padrao:     true,
            Desde:      "v1.41.0",
            RevisarEm:  new DateOnly(2026, 12, 1)),

        new(OperadorAcessoPeloMenu,
            Nome:       "Operador: acesso às telas do próprio menu",
            OQueMuda:   "O operador consegue usar Liga Mensal, painel da liguinha, Pré-vendas, Mercado de Cartas, " +
                        "Mensageria, Contas a Pagar/Receber e o envio de imagens, conforme as permissões do perfil dele. " +
                        "Páginas públicas e de cliente funcionam pra ele como pra qualquer pessoa logada.",
            SeDesligar: "Volta a regra antiga: essas telas aparecem no menu do operador, mas dão \"Sem permissão\". " +
                        "Só o dono consegue usá-las.",
            Padrao:     true,
            Desde:      "v1.41.0",
            RevisarEm:  new DateOnly(2026, 12, 1)),
    ];

    public static Funcionalidade? Buscar(string codigo) =>
        Catalogo.FirstOrDefault(f => f.Codigo == codigo);
}
