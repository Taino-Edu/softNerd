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
    public const string PixPedidoComDesconto = "pix-pedido-com-desconto";
    public const string HomeQueVende = "home-que-vende";
    public const string AvisosPraEquipe = "avisos-pra-equipe";
    public const string MenuLateralEnxuto = "menu-lateral-enxuto";
    public const string HomeVitrines = "home-vitrines";
    public const string CartasComoProduto = "cartas-como-produto";
    public const string PrecoReferenciaCartas = "preco-referencia-cartas";
    public const string HomeEventosNoTopo = "home-eventos-no-topo";
    public const string PrecoReferenciaEstoque = "preco-referencia-estoque";
    public const string DolarTempoRealCartas = "dolar-tempo-real-cartas";
    public const string PdvResponsivo = "pdv-responsivo";
    public const string ComandaTelas = "comanda-telas";
    public const string AvisosPedidoCliente = "avisos-pedido-cliente";
    public const string ComprovanteInscricao = "comprovante-inscricao";
    public const string ComprovanteCompra = "comprovante-compra";
    public const string AvisoInscricaoLoja = "aviso-inscricao-loja";
    public const string ComandaPelaConta = "comanda-pela-conta";

    public static readonly IReadOnlyList<Funcionalidade> Catalogo =
    [

        new(ComandaPelaConta,
            Nome:       "Comanda: cliente abre pela própria conta",
            OQueMuda:   "Na conta do cliente aparece o botão \"Abrir comanda\", sem precisar ler o QR Code da mesa. A comanda abre sem " +
                        "mesa (a loja vê de quem é no Painel Geral) e o cliente pede os itens como faz hoje. Se a trava \"Só abre na loja\" estiver ligada " +
                        "em Configurações, o celular precisa estar dentro do raio da loja (pede a localização uma vez).",
            SeDesligar: "Volta como era: a comanda só abre pelo QR Code da mesa ou pela loja no painel.",
            Padrao:     true,
            Desde:      "v1.101.0",
            RevisarEm:  new DateOnly(2027, 1, 25)),

        new(AvisoInscricaoLoja,
            Nome:       "Campeonato: a loja é avisada de inscrição nova",
            OQueMuda:   "Quando um jogador garante a vaga sozinho (inscrição grátis pelo site ou Pix da inscrição pago), os admins e os " +
                        "operadores com a permissão Campeonatos recebem no sininho e no celular quem entrou, em qual campeonato, o número do " +
                        "jogador e quantas vagas já foram. Vaga só segurada esperando o Pix não avisa. Cada tipo dá pra ignorar no sininho.",
            SeDesligar: "Volta como era: a loja só vê as inscrições abrindo a lista de participantes.",
            Padrao:     true,
            Desde:      "v1.100.0",
            RevisarEm:  new DateOnly(2027, 1, 24)),

        new(ComprovanteCompra,
            Nome:       "Comprovante de compra pro cliente: por e-mail e na conta",
            OQueMuda:   "Compra no nome de um cliente cadastrado (comanda fechada, venda no Frente de Caixa com cliente, pedido do site " +
                        "pago) manda o comprovante por e-mail com os itens, o desconto, o total e a forma de pagamento. Em Minha conta → " +
                        "Compras, cada compra ganha o botão \"Comprovante\" (dá pra salvar em PDF). O cliente desliga os e-mails em Configurações.",
            SeDesligar: "Nenhum e-mail de compra sai e o botão some do histórico.",
            Padrao:     true,
            Desde:      "v1.99.0",
            RevisarEm:  new DateOnly(2027, 1, 24)),

        new(ComprovanteInscricao,
            Nome:       "Campeonato: comprovante de inscrição e cobrança por e-mail",
            OQueMuda:   "Quando a vaga fica garantida (Pix pago, campeonato grátis ou pago no balcão), o jogador recebe por e-mail o " +
                        "comprovante da inscrição e ganha o botão \"Comprovante\" em Meus Campeonatos (dá pra salvar em PDF). Quando a loja " +
                        "inscreve ou cobra o jogador, ele recebe um e-mail com o botão \"Pagar inscrição\" que abre o site (o código Pix não " +
                        "vai no e-mail). O jogador pode desligar esses e-mails em Configurações.",
            SeDesligar: "Nenhum e-mail de inscrição sai e o botão \"Comprovante\" some (o aviso no sininho continua).",
            Padrao:     true,
            Desde:      "v1.98.0",
            RevisarEm:  new DateOnly(2027, 1, 24)),

        new(AvisosPedidoCliente,
            Nome:       "Avisos do pedido pro cliente: pagamento confirmado e pedido cancelado pela loja",
            OQueMuda:   "O cliente recebe no sininho e no celular quando o Pix do pedido é confirmado, quando a loja registra o pagamento " +
                        "feito por fora e quando a loja cancela o pedido (ou tira da fila). Antes ele só via o Pix confirmado se estivesse " +
                        "com a tela aberta, e não sabia do cancelamento.",
            SeDesligar: "Volta como era: o cliente só recebe aviso quando a loja registra o pedido pra ele.",
            Padrao:     true,
            Desde:      "v1.97.0",
            RevisarEm:  new DateOnly(2027, 1, 24)),

        new(ComandaTelas,
            Nome:       "Comandas: telas de itens e fechamento",
            OQueMuda:   "No Painel Geral, Adicionar itens mantém o catálogo aberto e atualiza o total da comanda. Fechar comanda abre a tela de pagamento.",
            SeDesligar: "Os botões de adicionar e fechar voltam a abrir as janelas anteriores.",
            Padrao:     true,
            Desde:      "v1.96.0",
            RevisarEm:  new DateOnly(2027, 1, 23)),

        new(PdvResponsivo,
            Nome:       "PDV: venda em tela responsiva",
            OQueMuda:   "Nova venda abre no painel. No computador, catálogo e carrinho ficam lado a lado. No celular, o caixa alterna entre os dois. O pagamento tem sua própria etapa.",
            SeDesligar: "Volta a janela de venda em três etapas. Os rascunhos continuam disponíveis.",
            Padrao:     true,
            Desde:      "v1.96.0",
            RevisarEm:  new DateOnly(2027, 1, 23)),

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

        new(PixPedidoComDesconto,
            Nome:       "Pix do pedido do site com o desconto da loja",
            OQueMuda:   "O Pix gerado pelo site pro pedido cobra o preço com o desconto do Pix que a loja anuncia " +
                        "(o do produto, senão o da categoria, senão o padrão da loja) — o mesmo \"R$ X no Pix\" da vitrine e da sacola. " +
                        "A venda registrada quando o Pix cai sai com esse desconto.",
            SeDesligar: "O Pix do pedido volta a cobrar o preço cheio (o desconto do Pix fica só como texto da vitrine). " +
                        "QR já gerado continua com o valor que tinha. Desconto, só o que o Maikon der no \"Registrar pagamento\".",
            // Desligada desde 13/11: a loja não quer desconto automático no pedido — o Maikon escolhe na
            // hora de receber (o pedido de 13/11 saiu R$ 41,22 mais barato "sem eu pedir").
            Padrao:     false,
            Desde:      "v1.83.0",
            RevisarEm:  new DateOnly(2027, 5, 1)),

        new(HomeQueVende,
            Nome:       "Home que vende: catálogo com produtos em cima, fotos maiores e \"+ Sacola\" no cartão",
            OQueMuda:   "Na página inicial, o topo segue o modelo do Maikon: título \"Prepare seu próximo grande jogo!\", botões " +
                        "\"Explorar produtos\" e \"Ver campeonatos\" e o mascote (logo de Personalizar Site) à direita; o cabeçalho fica em 3 tons de azul (a faixa mais " +
                        "escura em todas as páginas da loja). Logo abaixo vêm as categorias e as vantagens " +
                        "(cartão, retirada na loja, pontos) e em seguida os produtos — antes dos avisos e torneios. No computador, home e " +
                        "Produtos ficam em 3 colunas com foto e letras maiores, e a página do produto tem foto maior com \"Ampliar\". " +
                        "Os cartões ganham \"+ Sacola\" e a foto voa até a Sacola ao adicionar. Sem torneio marcado, a seção de torneios some.",
            SeDesligar: "Volta como antes: nome da loja no topo, um azul só, torneios primeiro, os 3 cartões curtos, 4 colunas, foto menor na " +
                        "página do produto e o botão \"Ver produto\" no cartão.",
            Padrao:     true,
            Desde:      "v1.87.0",
            RevisarEm:  new DateOnly(2027, 5, 6)),

        new(AvisosPraEquipe,
            Nome:       "Avisos de pedidos e Pix do site pra equipe toda, com sininho no painel",
            OQueMuda:   "Pré-venda nova, cliente que entra na fila de espera e Pix pago de pedido do site viram aviso no sininho do painel " +
                        "(com o número de não lidos e um aviso na tela quando chega) — pros admins e também pros operadores cujo perfil " +
                        "tem Pré-vendas. O item Pré-vendas do menu mostra quantos pedidos esperam.",
            SeDesligar: "Volta como antes: os avisos de pedido vão só pros admins, fila de espera e Pix pago não avisam, e o painel não tem sininho " +
                        "(só a bolinha em Mensageria).",
            Padrao:     true,
            Desde:      "v1.88.0",
            RevisarEm:  new DateOnly(2027, 5, 17)),

        new(MenuLateralEnxuto,
            Nome:       "Menu do painel enxuto: grupos que abrem e fecham e rodapé compacto",
            OQueMuda:   "No menu lateral do painel cada grupo (Catálogo, Clientes, Financeiro…) abre e fecha no título; fica aberto o " +
                        "\"Dia a dia\" e o grupo da tela atual, e o que você abrir fica lembrado no aparelho. O rodapé (usuário, Ver Loja, tema, " +
                        "Sair) vira uma linha só, sobrando espaço pros itens.",
            SeDesligar: "Volta o menu de antes: todos os grupos sempre abertos e o rodapé com o cartão do usuário e os botões um embaixo do outro. " +
                        "(A barra de rolagem própria do menu continua.)",
            Padrao:     true,
            Desde:      "v1.88.0",
            RevisarEm:  new DateOnly(2027, 5, 17)),

        new(HomeVitrines,
            Nome:       "Home com agenda, Mais vendidos e Novidades (modelo do Maikon de 17/11)",
            OQueMuda:   "Na página inicial: logo abaixo do topo vêm os 3 cartões (Produtos pra jogar, Feito pra comunidade, Uma loja de quem joga) " +
                        "e a agenda \"Campeonatos & eventos\" (campeonato semanal, liga mensal, torneios especiais), que aparece mesmo sem campeonato " +
                        "marcado. As categorias saem da home (ficam só em Produtos). Depois de Em Destaque entram \"Mais vendidos\" (o que mais saiu " +
                        "em comanda e no Frente de Caixa nos últimos 90 dias) e \"Novidades\" (cadastrados nos últimos 30 dias, que ganham o selo " +
                        "\"Novo\" no cartão). O topo fica mais baixo (arte com 390px) e a home usa as cores do modelo do Maikon.",
            SeDesligar: "Volta a home da v1.87: categorias e vantagens logo abaixo do topo, só a vitrine Em Destaque, topo mais alto, cores de " +
                        "Personalizar Site e sem o selo \"Novo\".",
            Padrao:     true,
            Desde:      "v1.90.0",
            RevisarEm:  new DateOnly(2027, 5, 17)),

        new(CartasComoProduto,
            Nome:       "Mercado de Cartas vende: carta avulsa vira produto com reserva (pedido do Maikon de 19/11)",
            OQueMuda:   "As cartas avulsas da loja são cadastradas como produto (em Marketplace → Nova carta, com jogo, estado, coleção, " +
                        "idioma, quantidade e o botão \"Ver na Liga\" pra conferir o menor preço). No Mercado de Cartas o cliente põe a carta " +
                        "na sacola e reserva/paga no Pix como qualquer produto; o estoque baixa sozinho e a carta também sai no Frente de Caixa. " +
                        "As cartas avulsas não aparecem em Produtos nem na home — só no Mercado.",
            SeDesligar: "O Mercado volta a ser só vitrine com \"Tenho interesse\" (os anúncios antigos) e o Marketplace do painel volta a cadastrar " +
                        "anúncios. As cartas cadastradas como produto passam a aparecer em Produtos como produto comum (continuam no estoque e no PDV).",
            Padrao:     true,
            Desde:      "v1.91.0",
            RevisarEm:  new DateOnly(2027, 5, 19)),

        new(PrecoReferenciaCartas,
            Nome:       "Preço de referência das cartas: catálogo de todos os jogos e preço de mercado todo dia",
            OQueMuda:   "No cadastro da carta avulsa, \"Buscar no catálogo\" (jogo → coleção → carta) preenche nome, coleção, número, raridade " +
                        "e foto e mostra o preço de mercado (TCGplayer, em dólar) convertido pela cotação do dia, com a sugestão de preço " +
                        "pela regra da loja. Todo dia, depois das 17h30, o robô \"Preço das cartas\" atualiza a referência e guarda o histórico " +
                        "(variação de 7 e 30 dias na lista). Só as cartas marcadas com \"Ajustar o preço sozinho\" têm o preço de venda trocado.",
            SeDesligar: "Some o \"Buscar no catálogo\" e a coluna de referência; o robô para e nenhum preço muda sozinho. " +
                        "As cartas continuam à venda com o preço que tinham; o cadastro volta a ser só à mão.",
            Padrao:     true,
            Desde:      "v1.92.0",
            RevisarEm:  new DateOnly(2027, 5, 20)),

        new(HomeEventosNoTopo,
            Nome:       "Home: torneios e pontos lá em cima",
            OQueMuda:   "Na página inicial, \"Próximos Torneios\" (com o calendário dos dias) e \"Ganhe pontos a cada visita\" vêm logo " +
                        "depois da agenda \"Campeonatos & eventos\", antes das vitrines de produto — o cliente vê os dias e os pontos sem " +
                        "descer a página toda.",
            SeDesligar: "Volta a ordem da v1.90: vitrines de produto primeiro, torneios e pontos no fim da página.",
            Padrao:     true,
            Desde:      "v1.93.0",
            RevisarEm:  new DateOnly(2027, 5, 20)),

        new(PrecoReferenciaEstoque,
            Nome:       "Preço de referência também nos produtos do Estoque (boosters, boxes, decks)",
            OQueMuda:   "Na gaveta \"Detalhes do Produto\" do Estoque, \"Ligar ao catálogo\" (jogo → coleção → produto selado) liga o produto " +
                        "ao preço de mercado do TCGplayer, como as cartas avulsas: a gaveta mostra a referência em reais, a variação de 7 e 30 dias " +
                        "e a sugestão pela regra da loja. O robô \"Preço das cartas\" atualiza esses produtos todo dia; o preço de venda só muda " +
                        "sozinho no produto marcado com \"Ajustar o preço sozinho\".",
            SeDesligar: "Some o bloco de referência da gaveta do Estoque e o robô volta a ler só as cartas avulsas. Os produtos continuam " +
                        "com o preço que tinham; a ligação fica guardada e volta se ligar de novo.",
            Padrao:     true,
            Desde:      "v1.94.0",
            RevisarEm:  new DateOnly(2027, 5, 23)),

        new(DolarTempoRealCartas,
            Nome:       "Preço de referência em reais com o dólar de agora (mercado)",
            OQueMuda:   "O preço de referência das cartas e dos lacrados é convertido pelo dólar comercial de agora (AwesomeAPI, lido no " +
                        "máximo a cada 10 minutos), não mais pela PTAX do último dia útil. Reais vêm primeiro em todo lugar, com o dólar ao lado e " +
                        "a hora da cotação. Se o mercado não responder, usa a PTAX oficial do Banco Central e avisa na tela.",
            SeDesligar: "Volta a converter pela PTAX oficial do Banco Central (só muda em dia útil). O resto continua igual.",
            Padrao:     true,
            Desde:      "v1.95.0",
            RevisarEm:  new DateOnly(2027, 5, 23)),
    ];

    public static Funcionalidade? Buscar(string codigo) =>
        Catalogo.FirstOrDefault(f => f.Codigo == codigo);
}
