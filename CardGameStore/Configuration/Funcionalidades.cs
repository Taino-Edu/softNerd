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
    public const string CadastroCompletoPodeAdiar = "cadastro-completo-pode-adiar";
    public const string LiguinhaRelogioSeparado = "liguinha-relogio-separado";
    public const string FotosLeves = "fotos-leves";
    public const string VisualTopoELogin = "visual-topo-e-login";
    public const string LigaVisualNovo = "liga-visual-novo";
    public const string HomeDetalhesMaikon = "home-detalhes-maikon";
    public const string VitrineNova = "vitrine-nova";
    public const string VisualProdutoERodape = "visual-produto-e-rodape";
    public const string SacolaNova = "sacola-nova";
    public const string ClienteInicioNovo = "cliente-inicio-novo";
    public const string AdminEsqueletoNovo = "admin-esqueleto-novo";
    public const string ContaClienteNova = "conta-cliente-nova";
    public const string AdminTelasNovas = "admin-telas-novas";
    public const string TelaoNovo = "telao-novo";
    public const string LigaAnimacaoResultado = "liga-animacao-resultado";
    public const string AdminLiguinhaCentral = "admin-liguinha-central";
    public const string LigaModalidades = "liga-modalidades";
    public const string LoginTelasUnificadas = "login-telas-unificadas";
    public const string PedidoPixConsistente = "pedido-pix-consistente";
    public const string LiguinhaProntoNaMesa = "liguinha-pronto-na-mesa";
    public const string LiguinhaEntradaSimples = "liguinha-entrada-simples";
    public const string PedidoVendaNoPagamento = "pedido-venda-no-pagamento";
    public const string VigiaSistema = "vigia-sistema";
    public const string PokemonPreferido = "pokemon-preferido";
    public const string HomeVisualUniforme = "home-visual-uniforme";
    public const string PedidoPixJunto = "pedido-pix-junto";
    public const string CampeonatoSeparado = "campeonato-separado";

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

        new(CadastroCompletoPodeAdiar,
            Nome:       "Cliente: \"Complete seu cadastro\" com \"Agora não\"",
            OQueMuda:   "O aviso pra cadastrar e-mail e senha tem o botão \"Agora não\": quem abriu a comanda pela " +
                        "mesa segue usando a comanda e o aviso volta na próxima visita ao site.",
            SeDesligar: "Volta o aviso obrigatório: a pessoa só usa a área do cliente depois de cadastrar e-mail e senha " +
                        "(quem digitar um e-mail que já tem conta fica presa no aviso).",
            Padrao:     true,
            Desde:      "v1.42.1",
            RevisarEm:  new DateOnly(2026, 12, 15)),

        new(LiguinhaRelogioSeparado,
            Nome:       "Liguinha: soltar pareamentos sem ligar o relógio",
            OQueMuda:   "\"Soltar pareamentos\" só distribui as mesas; o relógio da rodada só corre quando o " +
                        "organizador clica em \"Começar rodada\" — dá tempo de todo mundo montar o setup.",
            SeDesligar: "Volta ao jeito da primeira versão: gerar a rodada já liga o relógio na hora.",
            Padrao:     true,
            Desde:      "v1.43.0",
            RevisarEm:  new DateOnly(2027, 1, 15)),

        new(FotosLeves,
            Nome:       "Site: fotos leves",
            OQueMuda:   "As fotos de produto, banner e campeonato vão pro site no tamanho em que aparecem e em WebP: " +
                        "a página inicial cai de ~4 MB pra menos de 1 MB e abre bem mais rápido no celular.",
            SeDesligar: "Volta a mandar a foto original, do tamanho em que foi enviada (PNG de até 2 MB por foto).",
            Padrao:     true,
            Desde:      "v1.44.0",
            RevisarEm:  new DateOnly(2027, 1, 15)),

        new(VisualTopoELogin,
            Nome:       "Site: topo novo e login dos clientes novo",
            OQueMuda:   "Topo da página inicial no azul do topo, com a etiqueta e a ilustração (mascote) de " +
                        "Personalizar Site; login dos clientes em duas partes (painel azul + formulário), sempre claro.",
            SeDesligar: "Volta o topo antigo (azul-petróleo, imagem = logo) e o login dos clientes antigo (cartão simples).",
            Padrao:     true,
            Desde:      "v1.45.0",
            RevisarEm:  new DateOnly(2027, 2, 1)),

        new(LigaVisualNovo,
            Nome:       "Liga Mensal: página nova",
            OQueMuda:   "Página pública da liga com pódio do top 3, ranking com o sprite do deck de cada jogador, " +
                        "decks do mês e meses em botões, no visual da loja.",
            SeDesligar: "Volta a lista simples de antes (nome, decks em texto e pontos).",
            Padrao:     true,
            Desde:      "v1.46.0",
            RevisarEm:  new DateOnly(2027, 2, 1)),

        new(HomeDetalhesMaikon,
            Nome:       "Página inicial: detalhes do modelo do Maikon",
            OQueMuda:   "Faixa fina acima do menu (texto em Personalizar Site), topo com cantos arredondados, " +
                        "três cartões curtos abaixo do topo, chamada \"Quero jogar\" antes do rodapé, rodapé no azul " +
                        "e o parcelamento no cartão nos cartões de produto.",
            SeDesligar: "A página inicial volta a ser como na v1.46.1 (sem faixa, sem cartões e chamada, rodapé claro).",
            Padrao:     true,
            Desde:      "v1.47.0",
            RevisarEm:  new DateOnly(2027, 2, 1)),

        new(VitrineNova,
            Nome:       "Loja: vitrine nova",
            OQueMuda:   "Na página inicial os produtos viram uma grade de 8 (sem o carrossel), com atalhos das " +
                        "categorias; cartão de produto novo (selo, parcelamento, Pix, últimas unidades) na home e em " +
                        "/produtos; botão Sacola com o carrinho de reserva na barra.",
            SeDesligar: "Volta o carrossel de destaques na home, a barra \"Loja\" e o cartão pequeno em /produtos.",
            Padrao:     true,
            Desde:      "v1.48.0",
            RevisarEm:  new DateOnly(2027, 2, 1)),

        new(VisualProdutoERodape,
            Nome:       "Loja: página do produto nova e rodapé no azul",
            OQueMuda:   "Página do produto com a barra da marca e a Sacola, caminho Início › Produtos › Categoria, " +
                        "preço com contraste, \"Últimas N\", garantias da loja e \"Você também pode gostar\"; " +
                        "o rodapé geral do site segue o azul do topo.",
            SeDesligar: "Volta a página do produto de antes (barra escura com o nome) e o rodapé geral roxo-escuro.",
            Padrao:     true,
            Desde:      "v1.49.0",
            RevisarEm:  new DateOnly(2027, 2, 1)),

        new(SacolaNova,
            Nome:       "Loja: sacola nova",
            OQueMuda:   "Carrinho de reserva no visual da loja: passos, itens com foto maior e \"+\" travado no estoque, " +
                        "resumo com o total no Pix e garantias; quem não está logado vê \"Entre pra ver sua sacola\" " +
                        "e volta pra sacola depois de entrar.",
            SeDesligar: "Volta o carrinho de antes — e quem não está logado volta a ser mandado pra página inicial.",
            Padrao:     true,
            Desde:      "v1.50.0",
            RevisarEm:  new DateOnly(2027, 2, 1)),

        new(ClienteInicioNovo,
            Nome:       "Cliente: área do cliente nova",
            OQueMuda:   "Na área do cliente (/cliente): barra no azul da loja com o logo de Personalizar Site, cartão de " +
                        "pontos com quanto valem em reais e atalhos pra Loja, Sacola, Liga, Mercado, Decks e Conta.",
            SeDesligar: "Volta a barra azul-petróleo com o logo antigo, o cartão de pontos simples e os 2 atalhos.",
            Padrao:     true,
            Desde:      "v1.50.0",
            RevisarEm:  new DateOnly(2027, 2, 1)),

        new(AdminEsqueletoNovo,
            Nome:       "Painel: menu lateral novo",
            OQueMuda:   "Menu lateral do painel no azul da loja (nos temas claro e escuro), com o logo de Personalizar Site, " +
                        "item ativo em destaque branco e rodapé (usuário, Ver Loja, tema, Sair) no mesmo estilo.",
            SeDesligar: "Volta o menu lateral branco (tema claro) / preto (tema escuro) com o logo antigo.",
            Padrao:     true,
            Desde:      "v1.51.0",
            RevisarEm:  new DateOnly(2027, 2, 1)),

        new(ContaClienteNova,
            Nome:       "Cliente: Minha conta organizada",
            OQueMuda:   "Em Minha conta: abas com nomes de cliente (Pontos, Compras, Reservas, Campeonatos, Crediário, Notas) " +
                        "em pílulas, pontos uma vez só com o valor em reais e como usar, \"voltar\" sempre pra área do cliente " +
                        "e Meus decks / Configurações / Sair juntos em \"Mais\".",
            SeDesligar: "Volta a grade de 6 abas (Histórico, Torneios, Pré-vendas, Dívida...), o saldo repetido e o voltar do navegador.",
            Padrao:     true,
            Desde:      "v1.52.0",
            RevisarEm:  new DateOnly(2027, 2, 1)),

        new(AdminTelasNovas,
            Nome:       "Painel: telas no azul da loja",
            OQueMuda:   "Dentro do painel, botões e destaques no azul da loja (eram azul-claro) e as marcas de status " +
                        "que eram roxas (fila de espera, pré-venda, cartão, variação) em azul-céu; no tema claro os tons " +
                        "claros escurecem pra dar leitura.",
            SeDesligar: "O painel volta ao azul-claro e ao roxo de status de antes. O site público não muda em nenhum dos dois casos.",
            Padrao:     true,
            Desde:      "v1.53.0",
            RevisarEm:  new DateOnly(2027, 2, 1)),

        new(TelaoNovo,
            Nome:       "Liguinha: telão novo com os sprites",
            OQueMuda:   "Telão do torneio no estilo da Liga Mensal, pra TV: relógio gigante em fonte pixel com barra de tempo, " +
                        "mesas com o sprite do deck de cada lado, classificação com sprite, deck, V-E-D, OWP e pontos, " +
                        "e pódio com sprites grandes quando o torneio encerra.",
            SeDesligar: "Volta o telão de antes (tema escuro simples, sem deck nem sprite).",
            Padrao:     true,
            Desde:      "v1.54.0",
            RevisarEm:  new DateOnly(2027, 2, 1)),

        new(LigaAnimacaoResultado,
            Nome:       "Liguinha: animação de vitória e derrota",
            OQueMuda:   "Na tela do jogador (/liga/jogar), quando o resultado da mesa é confirmado aparece uma animação em tela cheia " +
                        "com o Pokémon do deck: vitória (o seu pula e o do oponente desmaia, confete, +3 pts), derrota (o seu desmaia) " +
                        "ou empate (os dois balançam). No fim do torneio, a colocação com coroa pro campeão. A mesa mostra você vs oponente com os sprites.",
            SeDesligar: "A tela do jogador volta a mostrar só o texto do resultado e o nome do oponente, sem animação nem sprite.",
            Padrao:     true,
            Desde:      "v1.55.0",
            RevisarEm:  new DateOnly(2027, 2, 1)),

        new(AdminLiguinhaCentral,
            Nome:       "Painel: Central da Liguinha",
            OQueMuda:   "Item novo no menu do painel (Eventos → Central da Liguinha), no estilo do Challonge: lista de torneios com busca e filtro, " +
                        "criar torneio em um passo, adicionar jogadores por nome ou vários de uma vez, histórico de rodadas, classificação, " +
                        "Liga do mês ao lado e \"Lançar etapa de fora\" pra etapa jogada no papel ou em outro app entrar no histórico e na Liga.",
            SeDesligar: "O item some do menu e fica só o de antes (Campeonatos, Liga Mensal, Timers). Etapas já lançadas continuam no histórico.",
            Padrao:     true,
            Desde:      "v1.56.0",
            RevisarEm:  new DateOnly(2027, 2, 1)),

        new(LigaModalidades,
            Nome:       "Liga × Campeonato",
            OQueMuda:   "Ao criar, escolhe a modalidade: Liga (liguinha semanal, suíço, soma na Liga Mensal) ou Campeonato " +
                        "(evento avulso — por enquanto só inscrição e venda, NÃO soma na Liga). Os que já existiam continuam Liga.",
            SeDesligar: "A Liga Mensal volta a somar todo evento com colocação, seja Liga ou Campeonato (como antes).",
            Padrao:     true,
            Desde:      "v1.56.0",
            RevisarEm:  new DateOnly(2027, 2, 1)),

        new(LoginTelasUnificadas,
            Nome:       "Entrada: todas as telas no mesmo visual",
            OQueMuda:   "Cadastro, primeiro acesso pelo CPF, recuperar senha e o login do painel passam a usar a mesma moldura do " +
                        "/entrar (painel da marca + formulário), com o seletor Entrar | Criar conta e passos no primeiro acesso.",
            SeDesligar: "Essas telas voltam ao cartão escuro de antes (o /entrar segue a chave \"visual-topo-e-login\").",
            Padrao:     true,
            Desde:      "v1.57.0",
            RevisarEm:  new DateOnly(2027, 2, 1)),

        new(PedidoPixConsistente,
            Nome:       "Pedidos do site: Pix sempre junto com o pedido",
            OQueMuda:   "Cancelar um pedido não pago derruba o Pix dele no Inter (antes confere se não acabou de ser pago). " +
                        "Se um Pix cair num pedido já cancelado, o pedido volta como pago quando ainda tem estoque; sem estoque, " +
                        "os admins recebem aviso de reembolso pendente. Cancelar um item do carrinho não trava mais o Pix dos outros.",
            SeDesligar: "Cancelar o pedido deixa o Pix aberto (o cliente ainda consegue pagar), o Pix pago de pedido cancelado " +
                        "só fica anotado em Contas a receber, e o carrinho com item cancelado não gera mais Pix.",
            Padrao:     true,
            Desde:      "v1.59.2",
            RevisarEm:  new DateOnly(2027, 2, 1)),

        new(LiguinhaProntoNaMesa,
            Nome:       "Liguinha: botão \"Pronto\" na mesa",
            OQueMuda:   "Depois que os pareamentos saem, cada jogador aperta \"Estou pronto\" no celular quando estiver com os básicos em campo. " +
                        "O organizador vê quantas mesas estão prontas (e pode marcar a mesa de quem está sem celular); quando todas ficam " +
                        "prontas, a Central avisa com som e destaque pra começar a rodada. O telão mostra quem já está pronto.",
            SeDesligar: "Some o botão: o organizador volta a olhar as mesas e começar a rodada quando achar que todos montaram o setup.",
            Padrao:     true,
            Desde:      "v1.61.0",
            RevisarEm:  new DateOnly(2027, 3, 1)),

        new(LiguinhaEntradaSimples,
            Nome:       "Liguinha: entrada em uma tela e deck na tela do torneio",
            OQueMuda:   "No celular, quem já está num torneio vê só os torneios dele (o código fica atrás de \"Entrar em outro torneio\"). " +
                        "Quem não está vê só o código; depois de entrar vai pra tela do torneio. O deck (o Pokémon que aparece no telão e na Liga) " +
                        "se escolhe e troca na tela do torneio — vale pra quem entrou pelo \"Estou aqui\" ou foi adicionado pelo organizador.",
            SeDesligar: "Volta a tela de antes: torneios e formulário de código com deck juntos, e o deck só se escolhe ao entrar pelo código.",
            Padrao:     true,
            Desde:      "v1.61.1",
            RevisarEm:  new DateOnly(2027, 3, 1)),

        new(PedidoVendaNoPagamento,
            Nome:       "Pedidos do site: venda conta no pagamento",
            OQueMuda:   "Pedido do site pago no Pix vira venda na hora, no Financeiro do dia do pagamento, como Pix e pelo valor cobrado. " +
                        "O preço fica congelado no momento do pedido. Na retirada é só \"Entregar\" (sem forma de pagamento nem desconto). " +
                        "Pedido \"pagar na retirada\" vira venda quando é pago no balcão (Homologar). Cancelar pedido pago estorna a venda.",
            SeDesligar: "Volta como era: o pedido só vira venda no Financeiro quando alguém clica em Homologar, com o preço do produto naquele momento.",
            Padrao:     true,
            Desde:      "v1.62.0",
            RevisarEm:  new DateOnly(2027, 3, 1)),

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
            OQueMuda:   "Quando o cliente fecha o carrinho e já tem um pedido de pré-venda sem pagar (mesma forma de pagamento, ainda sem venda), " +
                        "os itens novos entram nesse pedido e o Pix sai com o total. Se o pedido já tinha Pix, ele é cancelado no Inter antes — " +
                        "conferindo se não foi pago; pago ou Inter fora do ar, os itens novos viram um pedido separado, como antes.",
            SeDesligar: "Cada carrinho fechado vira um pedido com o seu próprio Pix (o cliente paga cada um separado).",
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
    ];

    public static Funcionalidade? Buscar(string codigo) =>
        Catalogo.FirstOrDefault(f => f.Codigo == codigo);
}
