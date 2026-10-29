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
    public const string VigiaSistema = "vigia-sistema";
    public const string PokemonPreferido = "pokemon-preferido";
    public const string HomeVisualUniforme = "home-visual-uniforme";
    public const string PedidoPixJunto = "pedido-pix-junto";
    public const string CampeonatoSeparado = "campeonato-separado";
    public const string PagamentoSemRetirada = "pagamento-sem-retirada";
    public const string RelatorioPorSubcategoria = "relatorio-por-subcategoria";

    public static readonly IReadOnlyList<Funcionalidade> Catalogo =
    [

        new(VigiaSistema,
            Nome:       "Vigia do sistema: alertas automáticos e erros de tela",
            OQueMuda:   "A cada 10 minutos o sistema procura o que ficou torto (Pix pago de pedido cancelado, pedido pago sem venda, " +
                        "venda travada, Pix com valor diferente, estoque negativo, pedido parado) e mostra em Configuração → Alertas do sistema; " +
                        "os importantes vão pro sininho. Erro numa tela do site mostra \"Algo deu errado — tentar de novo\" e vira alerta com a tela e o erro.",
            SeDesligar: "O robô para, a tela de alertas some e os erros de tela deixam de ser registrados (a tela amigável de erro continua).",
            Padrao:     true,
            Desde:      "v1.63.0",
            RevisarEm:  new DateOnly(2027, 4, 1)),

        new(PokemonPreferido,
            Nome:       "Conta do cliente: \"Qual o seu Pokémon preferido?\"",
            OQueMuda:   "Depois de criar a conta e em Minha Conta, o cliente escolhe o Pokémon preferido (busca por nome ou número, " +
                        "\"Me surpreenda\", versão brilhante). Ele aparece animado ao lado da foto em Minha Conta e no perfil público.",
            SeDesligar: "Some a escolha e o Pokémon do perfil; o que o cliente já escolheu fica guardado e volta se ligar de novo.",
            Padrao:     true,
            Desde:      "v1.65.0",
            RevisarEm:  new DateOnly(2027, 4, 1)),

        new(HomeVisualUniforme,
            Nome:       "Home: um azul só, topo mais justo e letras no mesmo tamanho",
            OQueMuda:   "Na página inicial, títulos, textos e destaques saem todos do azul da marca (o \"Cor do topo\" de Personalizar Site); " +
                        "a faixa de aviso, o menu e o rodapé ficam no mesmo tom. O topo perde os círculos e o espaço vazio, e nenhum texto fica abaixo de 12px.",
            SeDesligar: "Volta a home de antes: azul-céu nos destaques, azul-petróleo nos títulos, faixa mais escura que o menu, círculos no topo e rótulos de 10–11px.",
            Padrao:     true,
            Desde:      "v1.66.0",
            RevisarEm:  new DateOnly(2027, 4, 15)),

        new(PedidoPixJunto,
            Nome:       "Pré-venda: itens novos entram no pedido sem pagar (um Pix só)",
            OQueMuda:   "Quando o cliente fecha o carrinho (ou o admin lança a pré-venda por ele) e já tem um pedido de pré-venda sem pagar " +
                        "(mesma forma de pagamento, ainda sem venda), os itens novos entram nesse pedido e o Pix sai com o total. Se o pedido já " +
                        "tinha Pix, ele é cancelado no Inter antes — conferindo se não foi pago; pago ou Inter fora do ar, os itens novos viram " +
                        "um pedido separado, como antes.",
            SeDesligar: "Cada carrinho fechado ou lançamento do admin vira um pedido com o seu próprio Pix (o cliente paga cada um separado).",
            Padrao:     true,
            Desde:      "v1.69.0",
            RevisarEm:  new DateOnly(2027, 4, 15)),

        new(CampeonatoSeparado,
            Nome:       "Campeonato separado da Liga",
            OQueMuda:   "Evento de modalidade Campeonato roda fora da Liga: no celular do jogador fica em /campeonato/jogar e o telão em " +
                        "/campeonato/torneio, com o nome e os links do campeonato. A Liguinha (celular e Central do admin) mostra só Liga; " +
                        "campeonato se abre pela tela de Campeonatos.",
            SeDesligar: "Volta como antes: Liga e Campeonato juntos na Liguinha (Central com a aba Tudo/Liga/Campeonatos) e o telão de todos em /liga.",
            Padrao:     true,
            Desde:      "v1.68.0",
            RevisarEm:  new DateOnly(2027, 4, 15)),

        new(PagamentoSemRetirada,
            Nome:       "Pedidos: registrar pagamento sem dar como retirado",
            OQueMuda:   "Em Pedidos, \"Registrar pagamento\" lança a venda no Financeiro e o pedido vai pra \"Pago · aguardando retirada\", " +
                        "igual ao Pix pago pelo site — serve pra quem paga adiantado por fora (dinheiro, cartão, chave da loja). " +
                        "A entrega fica pro botão Entregar. \"Pagou e retirou\" faz as duas coisas de uma vez, como o Homologar.",
            SeDesligar: "Volta só o Homologar: lançar o pagamento já marca o pedido como retirado e ele sai da tela.",
            Padrao:     true,
            Desde:      "v1.72.0",
            RevisarEm:  new DateOnly(2027, 5, 1)),

        new(RelatorioPorSubcategoria,
            Nome:       "Relatório de vendas por subcategoria",
            OQueMuda:   "Em Relatórios → Vendas, cada categoria-pai (ex.: Cartas) mostra o total e, dentro, as subcategorias " +
                        "(Pokémon, One Piece, Riftbound…) com os produtos de cada uma. O total do pai é sempre a soma das filhas.",
            SeDesligar: "Volta a lista de antes: uma linha por subcategoria, sem o total da categoria-pai.",
            Padrao:     true,
            Desde:      "v1.74.0",
            RevisarEm:  new DateOnly(2027, 5, 1)),
    ];

    public static Funcionalidade? Buscar(string codigo) =>
        Catalogo.FirstOrDefault(f => f.Codigo == codigo);
}
