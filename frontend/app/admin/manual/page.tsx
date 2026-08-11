'use client'
import { useEffect } from 'react'

const LOJA = 'Santuário Nerd'
const VERSION = 'v1.25.5'
const DATA = '11/08/2026'

// Os capítulos são os MESMOS grupos do menu lateral, na mesma ordem: quem procura
// "onde mexo em categoria" acha no manual no mesmo lugar em que acha na tela.
// A numeração é calculada na renderização — antes era digitada à mão em cada seção
// e já tinha virado 07, 07b, 07c, 07d, 07e porque ninguém quis renumerar o resto.
const GRUPOS = [
  'Dia a dia',
  'Catálogo',
  'Clientes',
  'Financeiro',
  'Eventos',
  'Divulgação',
  'Configuração',
  'Ajuda & Sistema',
] as const

interface Secao {
  /** Capítulo — tem que ser um dos GRUPOS acima (mesmos nomes do menu lateral). */
  grupo: string
  titulo: string
  cor: string
  /** Posição dentro do capítulo. Sem isso, vale a ordem em que está neste arquivo. */
  ordem?: number
  itens: { t: string; d: string }[]
  dicas?: string[]
}

const SECOES: Secao[] = [
  {
    grupo: 'Dia a dia',
    titulo: 'Painel Geral (Dashboard)',
    cor: '#00F0A8',
    itens: [
      { t: 'Comandas em destaque', d: 'Ao abrir o dashboard, as comandas ativas aparecem imediatamente, sem scroll. Os 4 KPIs no topo (comandas ativas, receita do dia, valor em aberto, estoque baixo) ficam sempre visíveis.' },
      { t: 'Tab Ativas', d: 'Lista em tempo real de todas as comandas abertas, com busca por cliente e botão para abrir nova comanda.' },
      { t: 'Tab Histórico', d: 'Comandas fechadas e canceladas do dia selecionado. Inclui breakdown por forma de pagamento no topo.' },
      { t: 'Tab Análises', d: 'Painéis financeiros colapsáveis: detalhe do dia, gráfico de receita 7 dias, previsão do mês, patrimônio, top clientes, LGPD e pré-inscrições. Cada painel mantém estado aberto/fechado entre visitas.' },
      { t: 'Atualização automática', d: 'Intervalo configurável: 15s, 30s, 1 minuto ou manual. Também recebe eventos em tempo real via SignalR.' },
    ],
    dicas: [
      'Quais painéis aparecem na tab Análises é controlado em Configurações → Dashboard.',
      'O esquema de cores do gráfico (Padrão, Azul, Neon) é configurável por usuário.',
    ],
  },
  {
    grupo: 'Dia a dia',
    titulo: 'Comandas (Mesa / QR Code)',
    cor: '#3EC2F2',
    itens: [
      { t: 'Como funciona', d: 'O cliente escaneia o QR Code da mesa e abre a própria comanda. O sistema identifica o cliente automaticamente pelo CPF ou WhatsApp.' },
      { t: 'Adicionar itens', d: 'No painel admin, clique na comanda aberta e pesquise o produto. Você também pode adicionar itens manualmente com nome e preço.' },
      { t: 'Fechar a comanda', d: 'Clique em "Fechar Comanda", escolha a forma de pagamento (Dinheiro, Pix, Cartão, Crediário, Pontos ou Cashback) e confirme. O sistema desconta o estoque automaticamente.' },
      { t: 'Desconto em R$', d: 'No fechamento, informe um valor de desconto direto em reais (além do desconto em pontos que o cliente já tenha aplicado). Aparece separado no histórico e nos relatórios.' },
      { t: 'Emitir cupom fiscal', d: 'No fechamento aparece o checkbox "Emitir cupom fiscal (NFC-e) agora" — a nota só é emitida se você marcar. Vem pré-marcado conforme a forma de pagamento estar configurada em Fiscal → Emissão automática, mas você sempre pode mudar na hora.' },
      { t: 'Split de pagamento', d: 'É possível usar duas formas de pagamento ao mesmo tempo. Selecione a segunda forma e informe o valor dela.' },
      { t: 'Cancelar comanda', d: 'Se o cliente desistir, use "Cancelar". O estoque não é alterado e a comanda some do painel.' },
      { t: 'Agrupar itens', d: 'Itens iguais são somados automaticamente na visualização para facilitar a conferência.' },
    ],
    dicas: [
      'Comandas com status "Aberta" ainda não têm itens. "Em Andamento" já tem pelo menos um item adicionado.',
      'O admin pode abrir uma comanda manualmente em nome de um cliente pelo botão "Nova Comanda".',
      'Se fechar sem marcar "Emitir cupom fiscal", dá pra emitir depois pelo botão "Emitir nota fiscal" no histórico da comanda.',
    ],
  },
  {
    grupo: 'Dia a dia',
    titulo: 'Frente de Caixa (PDV)',
    cor: '#4ADE80',
    itens: [
      { t: 'Quando usar', d: 'Para vendas rápidas no balcão, sem QR Code. Ideal para clientes que chegam e pagam na hora.' },
      { t: 'Wizard 3 etapas', d: 'O PDV guia você por: 1) selecionar cliente, 2) adicionar produtos, 3) escolher pagamento. Navegue livremente entre etapas sem perder o carrinho.' },
      { t: 'Layout 2 colunas no step de produtos', d: 'Ao chegar na etapa de produtos, o modal expande mostrando o catálogo à esquerda e o carrinho à direita. Cada item adicionado aparece imediatamente no painel do carrinho com controles de quantidade — sem precisar avançar de etapa para ver o que foi adicionado.' },
      { t: 'Adicionar produtos', d: 'Pesquise pelo nome, categoria ou código de barras. Clique em + para adicionar; o produto vai direto para o carrinho ao lado.' },
      { t: 'Desconto — % ou R$', d: 'Na etapa de pagamento, escolha entre desconto percentual ou valor fixo em reais com o toggle % / R$. O desconto padrão (percentual) é pré-configurável nas Preferências.' },
      { t: 'Emitir cupom fiscal', d: 'Igual na comanda: aparece o checkbox "Emitir cupom fiscal (NFC-e) agora" antes de confirmar a venda. Vem pré-marcado conforme a forma de pagamento estar configurada em Fiscal → Emissão automática.' },
      { t: 'Split de pagamento', d: 'Selecione uma segunda forma de pagamento e informe o valor. O saldo restante é calculado automaticamente.' },
      { t: 'Analytics do PDV', d: 'Histórico com gráfico de pico de horário, top produtos vendidos no período e breakdown por forma de pagamento.' },
    ],
    dicas: [
      'O desconto padrão (0 a 20%) pode ser pré-configurado em Configurações → Frente de Caixa.',
      'Sem cliente selecionado, a venda é anônima — aparece apenas nos relatórios gerais.',
      'Se a venda foi registrada sem nota, dá pra emitir depois no detalhe da venda (histórico do PDV).',
    ],
  },
  {
    grupo: 'Catálogo',
    ordem: 5,
    titulo: 'Estoque (Produtos)',
    cor: '#FB923C',
    itens: [
      { t: 'Cards de resumo', d: 'Topo da tela exibe 4 cards em tempo real: total de peças em estoque, valor total imobilizado em estoque, quantidade de itens com estoque baixo e quantidade de itens zerados.' },
      { t: 'Filtros por situação', d: 'Use os chips Todos / Normal / Estoque Baixo / Zerado para filtrar a lista. Os filtros Baixo e Zerado reordenam automaticamente do pior para o melhor.' },
      { t: 'Drawer de detalhe', d: 'Clique em qualquer linha da tabela para abrir o painel lateral com imagem do produto, categoria, código de barras, preço, custo, barra de margem, barra de estoque vs mínimo, valor imobilizado e botões rápidos + / − de ajuste.' },
      { t: 'Cadastrar produto', d: 'Vá em Estoque → Novo Produto. Preencha nome, categoria, preço de custo, preço de venda e estoque inicial.' },
      { t: 'Estoque mínimo', d: 'Defina um estoque mínimo para receber alertas quando o produto estiver baixo. Aparece nos cards de resumo e no filtro de situação.' },
      { t: 'Promoção', d: 'Ative o campo "Em Promoção" e informe o preço promocional. O sistema usa o preço com desconto automaticamente nas vendas.' },
      { t: 'Código de barras', d: 'Cadastre o código de barras para agilizar vendas no caixa — basta escanear para adicionar o produto.' },
      { t: 'Ajuste de estoque', d: 'Para corrigir o estoque (entrada de mercadoria, inventário), use o botão de ajuste manual no drawer ou no modal de edição.' },
      { t: 'Desativar produto', d: 'Produtos inativos não aparecem nas vendas, mas o histórico é mantido. Use isso em vez de excluir.' },
    ],
    dicas: [
      'O estoque é descontado automaticamente a cada venda — comanda ou PDV.',
      'Produtos com estoque zerado ainda podem ser vendidos manualmente, mas aparecem com aviso.',
    ],
  },
  {
    grupo: 'Clientes',
    titulo: 'Clientes, Pontos & Cashback',
    cor: '#C084FC',
    itens: [
      { t: 'Cadastrar cliente', d: 'Clique em "Novo Cliente". Nome é obrigatório; CPF, WhatsApp e e-mail são opcionais, mas ajudam na identificação.' },
      { t: 'Pontos Maikon', d: 'A cada R$1 gasto, o cliente ganha 1 ponto. Os pontos expiram em 30 dias após a última compra e podem ser usados como desconto.' },
      { t: 'Pontos não acumulam com cashback', d: 'Se qualquer parte do pagamento usar cashback, o cliente não acumula pontos naquela venda.' },
      { t: 'Adicionar pontos manualmente', d: 'Selecione o cliente no painel e informe a quantidade de pontos e o motivo (ex: "Campeonato de Pokémon").' },
      { t: 'Cashback (Saldo)', d: 'Diferente de pontos — é saldo em reais que o cliente pode usar como pagamento. Crédite ou débite manualmente pelo painel.' },
      { t: 'Histórico completo', d: 'Clique em "Ver Histórico" no painel do cliente para ver todas as comandas, vendas no caixa, crediários e campeonatos em um único lugar.' },
    ],
    dicas: [
      'Pontos e cashback são coisas diferentes: pontos têm validade de 30 dias; cashback é saldo em reais sem validade.',
      'Para redefinir a senha de um cliente, use o botão "Redefinir Senha" no painel lateral.',
    ],
  },
  {
    grupo: 'Clientes',
    titulo: 'Crediário (Fiado)',
    cor: '#F97316',
    itens: [
      { t: 'O que é', d: 'O cliente leva os produtos e paga depois. O sistema cria uma dívida vinculada ao cliente com vencimento em 30 dias.' },
      { t: 'Como abrir', d: 'Ao fechar uma comanda ou venda avulsa, selecione "Crediário" como forma de pagamento. O cliente precisa estar cadastrado.' },
      { t: 'Um crediário por vez', d: 'Cada cliente só pode ter um crediário aberto. Novas compras no crediário acumulam no mesmo saldo.' },
      { t: 'Ver os itens', d: 'No painel de crediário, expanda o card do cliente para ver exatamente o que ele levou em todas as visitas.' },
      { t: 'Pagamento parcial', d: 'Clique em "Registrar Pagamento" e informe o valor pago e a forma de pagamento. O saldo é atualizado automaticamente.' },
      { t: 'Quitar o crediário', d: 'Quando o valor total for pago, clique em "Marcar como Pago". O cliente fica liberado para abrir um novo.' },
      { t: 'Crediário vencido', d: 'Aparece em vermelho no painel quando passou dos 30 dias sem pagamento. Use para cobrar os clientes em atraso.' },
    ],
    dicas: [
      'Pagar uma dívida de crediário NÃO gera pontos para o cliente.',
      'O vencimento é renovado automaticamente sempre que o cliente faz um pagamento parcial.',
    ],
  },
  {
    grupo: 'Eventos',
    titulo: 'Campeonatos',
    cor: '#FBBF24',
    itens: [
      { t: 'Criar campeonato', d: 'Vá em Campeonatos → Novo. Informe nome, jogo (Pokémon, Magic, etc.), data, taxa de inscrição e número máximo de participantes.' },
      { t: 'Status do campeonato', d: '"Planejado" → "Inscrições Abertas" → "Em Andamento" → "Finalizado". Mude o status conforme o evento avança.' },
      { t: 'Inscrever participantes', d: 'No painel do campeonato, adicione participantes manualmente ou deixe que eles se inscrevam pela landing page pública.' },
      { t: 'Pré-inscrições da landing page', d: 'Clientes sem conta podem se pré-inscrever pelo link público. Você aprova ou rejeita as pré-inscrições no painel.' },
      { t: 'Pix na inscrição (opcional)', d: 'O jogador pode pagar a taxa de inscrição na hora via Pix — botão "Pagar inscrição via Pix" em Meus Campeonatos, com QR Code/copia-e-cola e confirmação automática. A vaga já vale mesmo sem pagar, então pagamento no balcão continua funcionando normalmente.' },
      { t: 'Acompanhar pagamentos', d: 'Na lista de participantes, veja quem já pagou (Pix ou balcão) e marque manualmente o pagamento de quem pagar no balcão.' },
      { t: 'Definir colocações', d: 'Após o campeonato, clique no participante e informe o lugar (1º, 2º, 3º...). O sistema monta o pódio automaticamente.' },
    ],
    dicas: [
      'A taxa de inscrição paga no balcão é registrada manualmente — só o Pix confirma sozinho.',
      'Use "Cancelado" para campeonatos que não aconteceram para manter o histórico limpo.',
    ],
  },
  {
    grupo: 'Catálogo',
    titulo: 'Grade de Produtos (Tamanhos & Cores)',
    cor: '#34D399',
    itens: [
      { t: 'O que é a grade', d: 'Produtos de vestuário (camisas, moletons, bonés) podem ter variantes de tamanho e cor. Cada combinação tem estoque próprio e SKU único.' },
      { t: 'Ativar variantes', d: 'No cadastro ou edição do produto, marque "Tem variantes". O campo de estoque geral é substituído pela grade.' },
      { t: 'Criar grade completa', d: 'Clique em "Criar grade". Selecione os tamanhos (PP/P/M/G/GG/XGG) e as cores. O sistema cria automaticamente todas as combinações (ex: 3 tamanhos × 4 cores = 12 variantes).' },
      { t: 'Estoque por variante', d: 'Cada variante tem seu próprio estoque. O total no produto é a soma de todas as variantes.' },
      { t: 'Preço por variante', d: 'Se uma variante tiver preço diferente (ex: XGG mais caro), edite a variante e informe o preço. Sem preço = usa o preço do produto pai.' },
      { t: 'Vender variante', d: 'Na comanda ou PDV, ao adicionar um produto com grade, aparece um seletor de tamanho e cor. O estoque da variante escolhida é descontado.' },
    ],
    dicas: [
      'Produtos sem variantes não são afetados — a grade é opcional e ativada por produto.',
      'Para criar variantes individualmente (sem grade), use o botão "Adicionar variante" no painel da grade.',
    ],
  },
  {
    grupo: 'Dia a dia',
    titulo: 'Pré-vendas e Reservas do Site',
    cor: '#60A5FA',
    itens: [
      { t: 'O que é', d: 'Clientes reservam produtos pelo site sem precisar ir à loja. A reserva baixa o estoque na hora, sem prazo — fica reservada até ser paga, retirada ou cancelada.' },
      { t: 'Como o cliente reserva', d: 'Na página do produto, clique em "Comprar" (ou "Fazer pré-venda"). Se tiver grade, escolhe tamanho e cor. Dá pra juntar vários produtos e confirmar tudo de uma vez — vira um carrinho só.' },
      { t: 'Kanban de pedidos', d: 'Admin → Pré-vendas mostra duas colunas (Vendas × Pré-vendas, pela tag do produto) com as raias A pagar → Pago → Retirado. Cancelados ficam recolhidos no fim.' },
      { t: 'Homologar = confirmar a retirada', d: 'Clique em "Homologar" quando o cliente pagar/retirar. Escolha a forma de pagamento (dá pra dividir em duas) e, se quiser, um desconto na hora. Isso lança a venda no PDV — o estoque não é baixado de novo, já saiu na reserva.' },
      { t: 'Carrinho sai inteiro de uma vez', d: 'Se o pedido tem vários itens (selo "Carrinho de N"), homologar resolve o pedido todo num clique: o modal lista tudo que vai sair, o desconto é calculado sobre o total e o caixa recebe uma venda só, com todos os itens.' },
      { t: 'Pix da reserva', d: 'O botão "Pix" gera a cobrança do pedido inteiro pra mandar no WhatsApp. Quando o cliente paga, o pedido sobe sozinho pra raia "Pago · aguardando retirada".' },
      { t: 'Corrigir quantidade', d: 'O botão "Qtd" ajusta a quantidade de um pedido lançado errado, devolvendo ou baixando a diferença no estoque.' },
      { t: 'Cancelar', d: 'Admin ou o próprio cliente cancelam a qualquer momento — o estoque volta na hora. Pré-venda já paga só o admin cancela, porque o estorno é combinado à parte.' },
    ],
    dicas: [
      'A reserva não é uma venda: nada entra no caixa até você homologar.',
      'Se um item do carrinho for cancelado enquanto você preenche a tela de homologação, nada é homologado e o sistema avisa pra reabrir — nunca sai pela metade.',
    ],
  },
  {
    grupo: 'Catálogo',
    ordem: 10,
    titulo: 'Categorias e Subcategorias',
    cor: '#FBBF24',
    itens: [
      { t: 'Pra que serve', d: 'A categoria organiza o produto no site, no cardápio do cliente e nos filtros do estoque. Cadastre em Catálogo → Categorias.' },
      { t: 'Emoji', d: 'O emoji da categoria aparece na tela do cliente e na comanda — ajuda a bater o olho e achar rápido.' },
      { t: 'Ordem de exibição', d: 'Menor número aparece primeiro. Use pra deixar as categorias que mais vendem no topo.' },
      { t: 'Subcategoria', d: 'Escolha uma "categoria pai" pra virar subcategoria (ex: "One Piece" dentro de "Card Games"). Só um nível de aninhamento é permitido, de propósito — mais que isso vira labirinto na hora de cadastrar produto.' },
      { t: 'Desconto do Pix por categoria', d: 'Cada categoria pode ter o próprio percentual de desconto do Pix anunciado no site (ex: Pokémon com 3% enquanto o resto da loja segue o padrão). Vazio = herda da categoria pai e, se ela também não tiver, do padrão da loja.' },
      { t: 'Remover categoria', d: 'Os produtos vinculados NÃO são apagados — apenas ficam sem categoria definida, e é só reeditar cada um.' },
    ],
    dicas: [
      'Categoria é só organização de vitrine: mudar não mexe em preço, estoque nem histórico de venda.',
    ],
  },
  {
    grupo: 'Catálogo',
    titulo: 'Vitrine — Parcelamento e Desconto do Pix',
    cor: '#00A88F',
    itens: [
      { t: 'O que o cliente vê', d: 'Abaixo do preço, na página do produto: "em até 12x de R$ 16,25 sem juros" e "ou R$ 189,14 com 3% OFF no Pix". O preço no Pix também aparece nos cards da vitrine, na listagem de produtos e no total do carrinho.' },
      { t: 'É vitrine, não cobrança', d: 'Esses números são só o anúncio. O desconto de verdade continua sendo o que você digita na hora de fechar a venda no caixa ou na comanda.' },
      { t: 'Parcelamento é por item', d: 'No cadastro do produto, campo "Parcelar no cartão em até". Vazio = aquele item não mostra parcelamento nenhum. Produto novo já vem preenchido com o padrão configurado em Personalizar Site.' },
      { t: 'Desconto do Pix — 4 níveis', d: 'O sistema procura nesta ordem: o percentual do próprio item → o da categoria dele → o da categoria pai → o padrão da loja. Vazio significa "herda"; ZERO significa "este item não tem desconto no Pix", mesmo que a categoria dele tenha.' },
      { t: 'Parcela mínima', d: 'Em Personalizar Site → Vitrine. Vale pra loja toda e derruba o número de parcelas em item barato: um produto de R$ 39,90 marcado como 12x aparece como "7x de R$ 5,70" em vez de "12x de R$ 3,33".' },
      { t: 'Desligar', d: 'Percentual do Pix zero na loja toda tira a linha do Pix; parcelamento vazio no item tira a linha do cartão daquele produto.' },
    ],
    dicas: [
      'Os produtos que já estavam cadastrados começam sem parcelamento — a linha do cartão só aparece depois que você preencher o campo no item.',
      'Arredondamento é sempre a favor: a parcela arredonda pra cima (a soma nunca fica abaixo do preço) e o centavo do Pix pra baixo (a favor do cliente).',
    ],
  },
  {
    grupo: 'Clientes',
    titulo: 'Análises de Clientes',
    cor: '#818CF8',
    itens: [
      { t: 'Onde fica', d: 'Clientes → Análises. É o ranking de quem mais gastou, com filtros de verdade — diferente do Top Clientes do Painel Geral, que é um resumo.' },
      { t: 'Filtro de período', d: 'Hoje, 7 dias, este mês, tudo, ou um intervalo de datas escolhido a dedo.' },
      { t: 'Quantidade e forma de pagamento', d: 'Top 10/20/50 ou todos, e recorte por forma de pagamento (só quem pagou em Pix, só crediário, etc.).' },
      { t: 'Incluir vendas do caixa', d: 'Por padrão o ranking soma comandas; ligue a opção pra somar também as vendas avulsas identificadas no PDV.' },
    ],
    dicas: [
      'Venda de balcão sem cliente selecionado é anônima e não entra em ranking nenhum — identifique o cliente no PDV se quiser que conte.',
    ],
  },
  {
    grupo: 'Financeiro',
    titulo: 'Contas a Pagar e a Receber',
    cor: '#F59E0B',
    itens: [
      { t: 'Pra que serve', d: 'Controle do que a loja tem pra pagar (fornecedor, aluguel, energia) e pra receber fora do caixa do dia.' },
      { t: 'Lançar conta', d: 'Informe descrição, valor, vencimento e se é a pagar ou a receber. Dá pra marcar como paga/recebida quando quitar.' },
      { t: 'Nota de fornecedor vira conta', d: 'As NF-e emitidas contra o CNPJ da loja são baixadas automaticamente e viram conta a pagar, sem digitação.' },
      { t: 'Vencidas em destaque', d: 'O que passou do vencimento aparece em vermelho, pra cobrança e pagamento não escaparem.' },
    ],
  },
  {
    grupo: 'Eventos',
    titulo: 'Liga Mensal',
    cor: '#A3E635',
    itens: [
      { t: 'O que é', d: 'Ranking mensal que soma as colocações dos campeonatos do mês: 1º lugar = 10 pontos, 2º = 7, 3º = 5, 4º = 3 e os demais participantes = 1.' },
      { t: 'De onde vêm os pontos', d: 'Direto das colocações que você já lança em cada campeonato — não precisa cadastrar nada duas vezes.' },
      { t: 'Lançamento manual', d: 'Em Eventos → Liga Mensal dá pra digitar jogador e pontos direto, sem campeonato cadastrado. Serve pra migrar o histórico que estava anotado no papel.' },
      { t: 'Página pública', d: 'O ranking do mês fica visível pros clientes em /liga, com o link na navbar do site.' },
    ],
    dicas: [
      'Mudou a colocação de um campeonato? O ranking da liga se ajusta sozinho — ele é calculado na hora, não é uma tabela separada.',
    ],
  },
  {
    grupo: 'Ajuda & Sistema',
    titulo: 'LGPD & Auditoria',
    cor: '#94A3B8',
    itens: [
      { t: 'Pedidos do titular', d: 'A tela lista os pedidos de acesso, correção ou exclusão de dados feitos pelos clientes, com prazo de resposta e histórico do que foi respondido.' },
      { t: 'Consentimento de cookies', d: 'O site pede consentimento e guarda o registro — é o que comprova a autorização se alguém questionar.' },
      { t: 'Trilha de auditoria', d: 'Ações sensíveis (reserva manual, mudança de permissão, exclusão de dados) ficam registradas com quem fez e quando.' },
      { t: 'Contato do cliente no Mercado de Cartas', d: 'O WhatsApp do interessado só aparece pro admin se o próprio cliente autorizou na hora de marcar interesse.' },
    ],
  },
  {
    grupo: 'Catálogo',
    titulo: 'Mercado de Cartas (Vitrine)',
    cor: '#F472B6',
    itens: [
      { t: 'O que é', d: 'Vitrine de cartas avulsas do próprio Maikon — só o Admin anuncia. Clientes só navegam e marcam interesse, não postam anúncios (não é C2C).' },
      { t: 'Anunciar carta', d: 'Admin → Mercado de Cartas → "Novo anúncio". Foto, jogo, condição (NM/LP/MP/HP/DMG), preço e descrição.' },
      { t: 'Condições de carta', d: 'NM = Near Mint (perfeita) • LP = Light Played (levemente usada) • MP = Moderate Played • HP = Heavy Played • DMG = Damaged (danificada).' },
      { t: 'Interesse', d: 'Cliente clica "Tenho interesse" na carta e pode deixar uma mensagem. Pode autorizar (ou não) compartilhar o WhatsApp com o Maikon.' },
      { t: 'Ver interessados', d: 'Em Admin → Mercado de Cartas, clique no número de interesses da carta. Se o cliente autorizou o contato, aparece botão de WhatsApp direto pra combinar a venda.' },
      { t: 'Gestão', d: 'Admin edita, remove ou muda o status do anúncio (Disponível / Reservado / Vendido) direto na tabela do Mercado de Cartas.' },
    ],
    dicas: [
      'LGPD: o WhatsApp do cliente só aparece pro Admin se o próprio cliente autorizou explicitamente ao marcar interesse.',
      'Menores precisam declarar que têm 18 anos ou autorização dos responsáveis pra marcar interesse.',
    ],
  },
  {
    grupo: 'Dia a dia',
    titulo: 'Fila de Espera (produto que ainda não chegou)',
    cor: '#38BDF8',
    itens: [
      { t: 'O que é', d: 'Para produtos em pré-venda com estoque zerado, o cliente entra numa fila de espera pelo site em vez de reservar. Diferente da reserva (que exige estoque disponível).' },
      { t: 'Aviso automático de reestoque', d: 'Quando o estoque do produto sai de zero, todo mundo na fila recebe aviso automático (in-app + push + e-mail) na hora, uma única vez por pessoa.' },
      { t: 'Botão "Avisar fila"', d: 'Em Admin → Pré-vendas → Lista de Espera, o botão "Avisar fila" leva direto pra Mensageria com os clientes daquela fila já selecionados e o título/imagem do produto preenchidos — útil pra mandar um aviso extra além do automático.' },
      { t: 'Minhas Filas (cliente)', d: 'No perfil do cliente, a aba "Filas" mostra a posição em cada lista de espera e as reservas ativas com prazo, com botão pra sair/cancelar.' },
    ],
    dicas: [
      'A fila de espera não garante o produto — é por ordem de chegada quando o estoque volta.',
      'Pré-vendas e Reservas ficam na mesma página (Admin → Pré-vendas), em abas separadas.',
    ],
  },
  {
    grupo: 'Financeiro',
    titulo: 'Relatórios',
    cor: '#22D3EE',
    itens: [
      { t: 'Relatório PDV', d: 'Mostra todas as vendas avulsas do período: receita dia a dia, top produtos vendidos e formas de pagamento usadas.' },
      { t: 'Relatório de Clientes', d: 'Lista todos os clientes com pontos, cashback e status de atividade. Ajuda a identificar quem está ativo e quem parou de visitar.' },
      { t: 'Comandas Abertas', d: 'Mostra as comandas que estão há mais dias abertas. Útil para identificar clientes que ainda não fecharam a conta.' },
      { t: 'Relatório Financeiro', d: 'Visão consolidada de receitas por período, formas de pagamento e ticket médio.' },
      { t: 'Exportar PDF', d: 'Cada relatório tem botão de exportação em PDF para imprimir ou compartilhar.' },
    ],
  },
  {
    grupo: 'Configuração',
    titulo: 'Perfis de Acesso (Operadores)',
    cor: '#A78BFA',
    itens: [
      { t: 'O que são perfis', d: 'Perfis permitem criar usuários operadores com acesso restrito. Você define quais módulos cada perfil pode acessar.' },
      { t: 'Criar um perfil', d: 'Vá em Administração → Perfis de Acesso → Novo Perfil. Dê um nome (ex: "Caixa") e marque as permissões desejadas.' },
      { t: 'Permissões disponíveis', d: 'Dashboard, PDV, Comandas, Estoque, Categorias, Clientes, Crediário, Campeonatos, Financeiro, Relatórios, Anúncios, Cartas TCG, QR Codes e LGPD.' },
      { t: 'Atribuir perfil a operador', d: 'Em Clientes → aba Operadores, crie ou edite um operador e selecione o perfil. O operador verá apenas os módulos do perfil ao fazer login.' },
      { t: 'Alterar permissões', d: 'Edite o perfil a qualquer momento. As mudanças valem na próxima vez que o operador fizer login.' },
      { t: 'Excluir perfil', d: 'Só é possível excluir um perfil se nenhum operador estiver usando. Reatribua os operadores antes.' },
    ],
    dicas: [
      'Admin sempre tem acesso a tudo — perfis se aplicam apenas a operadores.',
      'Um operador sem perfil atribuído não consegue acessar nenhum módulo.',
    ],
  },
  {
    grupo: 'Divulgação',
    titulo: 'Anúncios, Banners & Catálogo TCG',
    cor: '#FB7185',
    itens: [
      { t: 'Criar anúncio', d: 'Vá em Anúncios → Novo. Escolha o tipo, escreva o texto, adicione imagem e defina data de expiração se necessário.' },
      { t: 'Banners do hero', d: 'Aparecem como fundo rotativo do hero da landing page. Cadastre múltiplos banners para rotação automática.' },
      { t: 'Avisos e destaques', d: 'Carrossel rotativo abaixo do hero com setas de navegação. Pausa automaticamente ao tocar.' },
      { t: 'Expiração automática', d: 'Defina uma data de expiração e o anúncio some automaticamente. Útil para promoções com prazo.' },
      { t: 'Catálogo TCG', d: 'Catálogo integrado de cartas (Pokémon, Magic, etc.) com preços de mercado. Pesquise por nome e adicione diretamente na comanda.' },
    ],
  },
  {
    grupo: 'Ajuda & Sistema',
    titulo: 'Atalhos de Teclado',
    cor: '#F472B6',
    itens: [
      { t: 'Navegar pelo teclado', d: 'Quando nenhum campo de texto está focado, pressione uma tecla para ir direto à página: D → Dashboard, P → PDV (Frente de Caixa), E → Estoque, U → Clientes, C → Crediário, F → Financeiro, R → Relatórios, A → Campeonatos.' },
      { t: 'Ver todos os atalhos', d: 'Pressione ? (shift + /) em qualquer tela para abrir o painel de atalhos com a lista completa. Pressione ? novamente ou Esc para fechar.' },
      { t: 'Fechar com Esc', d: 'A tecla Esc fecha modais, painéis flutuantes e o painel de atalhos. Funciona em qualquer contexto.' },
      { t: 'Badges no menu lateral', d: 'Ao passar o mouse sobre um item do menu no desktop, aparece a tecla de atalho correspondente em destaque ao lado do nome.' },
      { t: 'Não interfere com digitação', d: 'Os atalhos de navegação ficam desativados enquanto você digita em campos de texto, busca ou formulários — só a tecla ? continua ativa.' },
    ],
    dicas: [
      'Os atalhos de letras são case-insensitive — maiúscula ou minúscula, funciona igual.',
      'Para navegar com teclado no celular (teclado físico Bluetooth), os atalhos funcionam normalmente.',
    ],
  },
  {
    grupo: 'Configuração',
    titulo: 'Configurações e Preferências',
    cor: '#94A3B8',
    itens: [
      { t: 'Preferências por perfil', d: 'Cada usuário tem configurações salvas no servidor. Mudanças refletem em todos os dispositivos e são aplicadas em tempo real, sem recarregar a página.' },
      { t: 'Assistente IA — botão', d: 'Ative/desative o chat IA. Escolha entre botão arrastável (posição salva entre sessões) ou fixo em um dos 4 cantos da tela.' },
      { t: 'VLibras — Acessibilidade', d: 'Ative/desative o widget de tradução em Libras e defina em qual canto da tela ele aparece.' },
      { t: 'Dashboard — Painéis', d: 'Controle quais painéis aparecem na tab Análises: detalhe financeiro, gráfico 7 dias, previsão do mês, patrimônio, top clientes, LGPD e pré-inscrições.' },
      { t: 'Dashboard — Intervalo e cores', d: 'Configure o intervalo de atualização automática (15s, 30s, 1min ou manual) e o esquema de cores do gráfico (Padrão, Azul, Neon).' },
      { t: 'Frente de Caixa — Desconto padrão', d: 'Pré-selecione o desconto padrão (0 a 20%) que aparece ao abrir uma nova venda no PDV.' },
    ],
    dicas: [
      'Todas as mudanças são aplicadas em tempo real — sem precisar recarregar a página.',
      'Use "Resetar layout" nas configurações do Dashboard para reabrir todos os painéis colapsados.',
    ],
  },
  {
    grupo: 'Financeiro',
    ordem: 10,
    titulo: 'Financeiro & Curva ABC',
    cor: '#38BDF8',
    itens: [
      { t: 'Filtro de período', d: 'Selecione o intervalo de datas no topo ou use o mini filtro abaixo do gráfico para ajustar o período sem precisar rolar a página.' },
      { t: 'Gráfico de receita por dia', d: 'Barras animadas com entrada suave. Clique em qualquer barra para abrir o detalhe do dia: donut por forma de pagamento, receita, custo e margem.' },
      { t: 'Gráfico de formas de pagamento', d: 'Pizza interativa mostrando a proporção de cada método. Quando há apenas um método no período, a pizza aparece completa sem erro visual.' },
      { t: 'Visão Simples', d: 'Tabela de produtos com receita, quantidade, preço médio, custo e margem. Colunas ordenáveis por clique.' },
      { t: 'Curva ABC', d: 'Classifica automaticamente os produtos pela contribuição na receita: A = top 80% (produtos mais importantes), B = 80–95%, C = restante. Use para decidir o que priorizar no estoque.' },
      { t: 'Gráfico de Pareto', d: 'Visualização da Curva ABC com barras coloridas por classe e linha de acumulado. Linhas de referência nos 80% e 95% facilitam a leitura.' },
      { t: 'Filtros na Curva ABC', d: 'Clique em qualquer badge de classe (A, B ou C) ou em uma categoria para filtrar a tabela. Clique novamente para limpar o filtro.' },
    ],
    dicas: [
      'Classe A = poucos produtos que respondem por 80% da receita — são os que nunca podem faltar no estoque.',
      'O mini filtro de período abaixo do gráfico atualiza os dados sem disparar uma nova requisição separada — usa o mesmo estado do filtro do topo.',
    ],
  },
  {
    grupo: 'Configuração',
    ordem: 20,
    titulo: 'Fiscal — Emissão de NFC-e',
    cor: '#EAB308',
    itens: [
      { t: 'Configurar a empresa', d: 'Em Admin → Fiscal, preencha CNPJ, razão social, inscrição estadual, endereço completo e regime tributário (Simples Nacional). Todos os campos são obrigatórios pra emitir NFC-e.' },
      { t: 'Certificado digital A1', d: 'Envie o arquivo .pfx do certificado A1 e a senha. O sistema valida e guarda criptografado — nunca aparece de novo em texto puro depois de salvo.' },
      { t: 'Natureza de Operação', d: 'Cadastre CFOP/CSOSN uma vez (ex: "Venda dentro do estado") e marque uma como padrão. Produtos sem natureza específica usam a padrão automaticamente.' },
      { t: 'NCM é obrigatório', d: 'Todo produto vendido por NFC-e precisa ter o NCM cadastrado (Admin → Estoque), copiado da nota fiscal de compra do produto — o sistema nunca inventa ou sugere um NCM sozinho.' },
      { t: 'Emissão não é mais automática', d: 'Ao fechar uma comanda ou registrar uma venda avulsa, a nota só é emitida se você marcar o checkbox "Emitir cupom fiscal" no momento do fechamento — o sistema não emite nota sozinho sem perguntar.' },
      { t: 'Formas de pagamento com auto-emissão', d: 'Em Fiscal → Emissão automática, marque quais formas de pagamento (Pix, Dinheiro, Cartão...) vêm com o checkbox já pré-marcado no fechamento. Por padrão nenhuma vem marcada — é sempre uma escolha explícita até você configurar isso.' },
      { t: 'Emitir nota depois (manual)', d: 'Se a venda foi fechada sem nota, use o botão "Emitir nota fiscal" no histórico da comanda ou no detalhe da venda avulsa a qualquer momento depois.' },
      { t: 'Acompanhar notas emitidas', d: 'A lista de notas em Admin → Fiscal mostra status (Pendente, Autorizada, Rejeitada, Cancelada, Contingência) e o motivo quando não autoriza — ex: certificado não configurado, produto sem NCM.' },
      { t: 'Reprocessar e cancelar', d: 'Notas pendentes ou rejeitadas podem ser reprocessadas manualmente. Notas autorizadas podem ser canceladas dentro de 30 minutos da emissão, com justificativa de pelo menos 15 caracteres.' },
      { t: 'Cupom e QR Code', d: 'Cada nota autorizada tem uma página de cupom pra imprimir ou mostrar pro cliente, com QR Code oficial da SEFAZ. Quando marca "Emitir cupom fiscal" no fechamento, o cupom abre sozinho numa aba nova assim que a SEFAZ autoriza — sem precisar ir procurar em Admin > Fiscal.' },
      { t: 'Impressão térmica', d: 'O botão "Imprimir" da página do cupom usa o diálogo de impressão do navegador, formatado pra 80mm — funciona com qualquer impressora térmica instalada como impressora normal do Windows/sistema. Não é automático: alguém precisa clicar em Imprimir e escolher a térmica.' },
      { t: 'Cliente vê a própria nota', d: 'Em Meu Perfil > Notas Fiscais, o cliente vê as próprias notas emitidas e pode abrir/imprimir o cupom de qualquer uma que já autorizou — sem precisar pedir pro admin.' },
      { t: 'Exportar XMLs pro contador', d: 'Exporte um ZIP com os XMLs autorizados e cancelados de qualquer período — manual, ou automático todo dia 1 do mês por e-mail pro contador cadastrado.' },
    ],
    dicas: [
      'Retry automático: notas pendentes ou em contingência são retransmitidas à SEFAZ periodicamente sem precisar fazer nada.',
      'O NCM tem que vir da nota de compra real do fornecedor — nunca é adivinhado, pra evitar risco de classificação fiscal errada.',
      'Configure "Emissão automática" só depois de confirmar que a emissão manual está funcionando direito pra aquela forma de pagamento.',
    ],
  },
  {
    grupo: 'Catálogo',
    titulo: 'Cartas TCG & Deck Builder',
    cor: '#F59E0B',
    itens: [
      { t: 'Jogos suportados', d: 'Pokémon TCG (pokemontcg.io), Magic: The Gathering (Scryfall), Yu-Gi-Oh! (YGOProDeck) e LoL: Riftbound (Riftcodex + Scrydex). As APIs de Scryfall, YGOProDeck e Riftcodex são gratuitas e sem chave. Pokémon e Scrydex têm chaves opcionais configuráveis no backend.' },
      { t: 'Busca por nome', d: 'Digite o nome (ou parte) da carta na barra de busca e selecione o jogo. Os resultados aparecem em grade com imagem, nome e preço em USD e R$.' },
      { t: 'Busca em português ou inglês', d: 'A busca Pokémon aceita nomes em português ou inglês — o sistema consulta simultaneamente a pokemontcg.io (inglês, preços) e a TCGdex (português nativo). Exemplos PT: "Transmissor da Equipe Rocket", "Mewtwo ex da Equipe Rocket", "Pikachu V". Exemplos EN: "Rocket\'s Mewtwo ex", "Dark Blastoise".' },
      { t: 'Busca por código de set', d: 'Busca pela combinação set + número retorna a carta exata. Pokémon: "PAL 058" (código PTCGO) ou "sv3pt5 094" (ID do set). MTG: "MH3 232". YGO: "DUNE-EN001" ou passcode (89631139). LoL: "OGN-296".' },
      { t: 'Busca somente por filtros', d: 'Para Pokémon, é possível buscar sem digitar nome — apenas com filtros. Exemplo: clique em Filtros, selecione "Regulation Mark G" + "Standard" e pressione Buscar para ver todas as cartas legais com aquela marca.' },
      { t: 'Filtros básicos por jogo', d: 'Pokémon: raridade, supertipo (Pokémon/Trainer/Energy), set. MTG: raridade, tipo de carta, set. Yu-Gi-Oh!: tipo de monstro/magia/armadilha, atributo, set. LoL Riftbound: raridade, tipo, set.' },
      { t: 'Filtros avançados — Pokémon', d: 'Clique no ícone de filtros para expandir: Subtipo (Basic/Stage 1/Stage 2/EX/GX/V/VMAX/VSTAR/Supporter/Item…), Tipo de Energia (Fire/Water/Grass…), Regulation Mark (A a H), Legalidade (Standard/Expanded/Unlimited), Série do set (Scarlet & Violet/Sword & Shield…), Código PTCGO, Artista, Evolui de, Nº Pokédex, HP mínimo/máximo, Data de lançamento (de/até).' },
      { t: 'Detalhe da carta', d: 'Clique em qualquer carta para abrir o painel completo: imagem ampliada, HP/ATK-DEF/Força-Resistência (adaptado ao jogo), set, série, raridade, tipos, artista, texto de regras ou efeito, fraquezas e resistências (Pokémon), variantes de preço TCGPlayer (USD) com todas as versões (Normal, Holo, Reverse, 1ª Ed., Unlimited), preços CardMarket (EUR: Tendência, Média, Avg 30d, Reverse Holo) e conversão para R$.' },
      { t: 'Preços TCGPlayer e CardMarket', d: 'Cada carta Pokémon exibe preços separados por variante: Normal, Holofoil, Reverse Holofoil, 1ª Edição Normal, 1ª Edição Holo, Unlimited Normal, Unlimited Holo — cada uma com low/mid/high/market em USD. O CardMarket exibe em EUR: Média de venda, Tendência, Mais baixo, Reverse Holo Trend, Médias 1d/7d/30d.' },
      { t: 'Taxa BRL em tempo real', d: 'O widget de cotação no topo da tela mostra USD → R$ atualizado automaticamente. Todos os preços TCGPlayer são convertidos para R$ usando essa taxa.' },
      { t: 'Adicionar ao estoque', d: 'No detalhe da carta (admin), use o botão "Adicionar ao Estoque" para criar um produto baseado nos dados da carta TCG — já preenche nome, imagem e preço sugerido.' },
      { t: 'Deck Builder', d: 'Acesse em Minha Conta → Meus Decks. Crie um deck para um jogo específico e use a busca integrada para adicionar cartas. Os mesmos filtros avançados do admin estão disponíveis na busca do deck.' },
      { t: 'Busca por câmera', d: 'No Deck Builder, clique no ícone de câmera para fotografar uma carta. O sistema recorta a faixa inferior (onde fica o código) e tenta detectar o código automaticamente — se não detectar, você digita manualmente e confirma.' },
      { t: 'Importar lista', d: 'Cole uma lista no formato PTCG Live / Limitlesstcg (ex: "4 Pikachu PAL 058" / "2 Raichu PAR 021") e clique em Importar. O sistema busca cada carta e adiciona ao deck respeitando os limites de cópias.' },
    ],
    dicas: [
      'Pokémon usa duas APIs em paralelo: pokemontcg.io (inglês, preços TCGPlayer + CardMarket) e TCGdex (português nativo, imagens WebP). Digitar em PT ou EN dá o mesmo resultado.',
      'LoL: Riftbound usa duas APIs em paralelo — Riftcodex (gratuita) e Scrydex (opcional, com preços de mercado). Se a Scrydex não estiver configurada, o Riftcodex funciona sozinho.',
      'O cache de busca tem TTL de 5 minutos — refazer a mesma busca dentro desse período retorna resultado imediato sem chamar a API.',
      'Para cartas antigas (Base Set, Gym, Neo…), o preço de mercado mais completo é o CardMarket (EUR) — o TCGPlayer tem menos vendedores internacionais nessas coleções.',
    ],
  },
  {
    grupo: 'Ajuda & Sistema',
    titulo: 'Assistente IA — Voz & Navegação',
    cor: '#A78BFA',
    itens: [
      { t: 'Como acessar', d: 'Clique no botão roxo flutuante no canto da tela (arrastável). O widget abre acima do botão.' },
      { t: 'Perguntas sobre a loja', d: 'Pergunte sobre vendas do dia, estoque baixo, crediários em aberto, top produtos e muito mais. O assistente responde com dados reais em tempo real.' },
      { t: 'Navegação por comando', d: 'Digite ou fale "abre o estoque", "vai pro financeiro", "abre a frente de caixa" e o assistente navega automaticamente para a página e fecha o widget.' },
      { t: 'Entrada por voz', d: 'Clique no ícone de microfone no campo de texto. Fale normalmente em português — a transcrição é enviada automaticamente ao assistente. Disponível no Chrome e Edge.' },
      { t: 'Resposta em voz', d: 'Clique no ícone de alto-falante no cabeçalho do widget para ativar leitura em voz alta das respostas em PT-BR.' },
      { t: 'Sugestões rápidas', d: 'Quando o chat está vazio, aparecem sugestões de perguntas e comandos para facilitar o uso.' },
    ],
    dicas: [
      'O microfone funciona melhor no Chrome e Edge — Firefox não tem suporte nativo ao reconhecimento de voz.',
      'Os dados enviados ao assistente são anonimizados (LGPD): nomes de clientes são substituídos por "Cliente #N" antes de ir ao Google Gemini.',
    ],
  },
  {
    grupo: 'Divulgação',
    titulo: 'Mensageria (Avisos aos Clientes)',
    cor: '#7C3AED',
    itens: [
      { t: 'Como funciona', d: 'Envie um aviso (título, texto, imagem opcional e link) pra um grupo de clientes de uma vez — por notificação in-app, e-mail ou os dois.' },
      { t: 'Passo a passo', d: 'Fluxo em 3 passos: escreva a mensagem, escolha o canal (in-app / e-mail / ambos), escolha os destinatários (segmento de clientes ou seleção manual).' },
      { t: 'Preview ao vivo', d: 'Enquanto você digita, aparece uma prévia mostrando exatamente como a notificação vai aparecer pro cliente.' },
      { t: 'Segmentos de clientes', d: 'Envie pra todos, só ativos, aniversariantes do mês, ou outros recortes prontos — sem precisar montar lista manualmente.' },
      { t: 'Vindo da Lista de Espera', d: 'O botão "Avisar fila" em Pré-vendas já abre a Mensageria com os clientes daquela fila selecionados e o produto preenchido — só revisar e enviar.' },
      { t: 'E-mail sem cara de spam', d: 'Os e-mails enviados por aqui têm versão em texto simples além do HTML e um link de descadastro no rodapé, seguindo boas práticas de entrega de e-mail em massa.' },
    ],
    dicas: [
      'Use com moderação — mensagens em excesso fazem o cliente ignorar ou se descadastrar.',
      'A prévia ao vivo ajuda a pegar erro de digitação antes de mandar pra centenas de clientes de uma vez.',
    ],
  },
  {
    grupo: 'Configuração',
    ordem: 10,
    titulo: 'Personalizar Site',
    cor: '#F59E0B',
    itens: [
      { t: 'Onde fica', d: 'Admin → Personalizar Site (seção Administração no menu). Formulário simples — preenche e clica em Salvar, sem precisar mexer em código.' },
      { t: 'Identidade', d: 'Nome do site (aparece na navbar, título principal e rodapé), frase de apresentação abaixo do título, endereço/cidade e nome de quem atende (usado em textos como "Falar com [nome]").' },
      { t: 'Contato', d: 'Número de WhatsApp (com DDI, ex: 5517999999999) e e-mail de contato — usados no botão flutuante, rodapé e nos links de "falar no WhatsApp" da landing page.' },
      { t: 'Cores', d: 'Cor primária (azul), cor de destaque (amarelo), cor da navbar, fundo da página e fundo dos cards — escolha pelo seletor de cor ou digite o código hexadecimal. Fundo e cards só valem no modo claro; o modo escuro mantém a paleta própria dele.' },
      { t: 'Textos da navbar', d: 'Nomes dos links (Torneios, Produtos, Mercado de Cartas, Pontos) e dos botões "Ver Eventos" / "Ver Torneios" / "Ver Produtos".' },
      { t: 'Textos das seções', d: 'Etiqueta e título de cada seção da landing page (Torneios, Produtos, Pontos) e o parágrafo do programa de fidelidade.' },
      { t: 'Preview ao vivo', d: 'Uma miniatura da navbar, hero e um card de exemplo aparece ao lado do formulário, atualizando em tempo real conforme você digita ou muda uma cor — sem precisar salvar pra ver o resultado.' },
      { t: 'Ver o resultado', d: 'Clique em "Ver site" no topo da página pra abrir a landing de verdade em outra aba e conferir as mudanças já salvas.' },
    ],
    dicas: [
      'Enquanto nada é preenchido, o site continua exatamente como está hoje — todo campo já vem com o valor atual como padrão.',
      'Esse painel é a base pro sistema virar white-label no futuro — quanto mais aqui, menos precisa mexer em código depois.',
      'O menu lateral do admin (Painel Geral, Estoque, etc.) ainda não é personalizável por aqui — só a página pública.',
    ],
  },
]

export default function ManualPdfPage() {
  useEffect(() => {
    document.title = `Manual do Sistema — ${LOJA} ${VERSION}`
  }, [])

  // Seções na ordem dos capítulos, já numeradas de 01 em diante. Seção com grupo
  // desconhecido (erro de digitação) cai no fim em vez de sumir sem aviso.
  // Dentro do capítulo vale o campo `ordem` (menor primeiro) e, no empate, a ordem
  // em que a seção está no arquivo — assim só quem precisa sair do lugar leva número.
  const ordenar = (lista: Secao[]) =>
    lista
      .map((s, i) => ({ ...s, _i: i }))
      .sort((a, b) => ((a.ordem ?? 50) - (b.ordem ?? 50)) || (a._i - b._i))

  const capitulos: { grupo: string; secoes: (Secao & { _i: number })[] }[] =
    GRUPOS.map(grupo => ({ grupo: grupo as string, secoes: ordenar(SECOES.filter(s => s.grupo === grupo)) }))
          .filter(c => c.secoes.length > 0)

  const orfas = SECOES.filter(s => !GRUPOS.includes(s.grupo as typeof GRUPOS[number]))
  if (orfas.length > 0) capitulos.push({ grupo: 'Outros', secoes: ordenar(orfas) })

  let contador = 0
  const numerado = capitulos.map(c => ({
    ...c,
    secoes: c.secoes.map(s => ({ ...s, num: String(++contador).padStart(2, '0') })),
  }))

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'Inter', sans-serif;
          background: #fff;
          color: #111;
          font-size: 13px;
          line-height: 1.55;
        }

        .page { max-width: 820px; margin: 0 auto; padding: 32px 40px; }

        /* Botão — some no print */
        .print-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #00F0A8;
          color: #000;
          font-weight: 700;
          font-size: 13px;
          border: none;
          border-radius: 10px;
          padding: 10px 20px;
          cursor: pointer;
          margin-bottom: 32px;
        }
        .print-btn:hover { background: #00d494; }

        /* Capa */
        .capa {
          border-bottom: 3px solid #00F0A8;
          padding-bottom: 24px;
          margin-bottom: 32px;
        }
        .capa-badge {
          display: inline-block;
          background: #00F0A820;
          color: #00b87a;
          border: 1px solid #00F0A840;
          border-radius: 20px;
          padding: 3px 12px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .05em;
          text-transform: uppercase;
          margin-bottom: 12px;
        }
        .capa h1 {
          font-size: 26px;
          font-weight: 800;
          color: #0C3D5A;
          margin-bottom: 4px;
        }
        .capa-meta {
          font-size: 12px;
          color: #6b7280;
          margin-top: 6px;
        }

        /* Índice */
        .indice { margin-bottom: 32px; }
        .indice h2 { font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 10px; }
        .indice-grupo { margin-bottom: 10px; break-inside: avoid; }
        .indice-grupo-label {
          font-size: 11px;
          font-weight: 800;
          color: #0C3D5A;
          margin-bottom: 2px;
        }
        .indice-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 32px; }

        /* Capítulo (mesmo nome do grupo do menu lateral) */
        .capitulo {
          font-size: 15px;
          font-weight: 800;
          color: #0C3D5A;
          background: #f3f4f6;
          border-left: 4px solid #00F0A8;
          padding: 8px 12px;
          border-radius: 0 8px 8px 0;
          margin: 28px 0 16px;
          break-after: avoid;
          page-break-after: avoid;
        }
        .indice-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #374151; padding: 3px 0; }
        .indice-num { font-weight: 700; color: #9ca3af; font-size: 11px; width: 20px; }

        /* Seção */
        .secao {
          margin-bottom: 28px;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .secao-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
          padding-bottom: 8px;
          border-bottom: 2px solid #f3f4f6;
        }
        .secao-num {
          font-size: 11px;
          font-weight: 800;
          color: #9ca3af;
          min-width: 22px;
        }
        .secao-title {
          font-size: 15px;
          font-weight: 700;
          color: #111;
          flex: 1;
        }
        .secao-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        /* Itens */
        .item { display: flex; gap: 10px; margin-bottom: 6px; }
        .item-bullet {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #f3f4f6;
          border: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          font-weight: 700;
          color: #9ca3af;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .item-t { font-weight: 600; color: #111; font-size: 12px; }
        .item-d { color: #4b5563; font-size: 12px; margin-top: 1px; }

        /* Dicas */
        .dicas { margin-top: 8px; background: #f9fafb; border-radius: 8px; padding: 8px 12px; border-left: 3px solid #00F0A8; }
        .dicas-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #00b87a; margin-bottom: 4px; }
        .dica { font-size: 11px; color: #4b5563; margin-bottom: 2px; }
        .dica::before { content: '→ '; color: #00b87a; font-weight: 700; }

        /* Rodapé */
        .rodape { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af; }

        @media print {
          .print-btn { display: none !important; }
          body { font-size: 12px; }
          .page { padding: 16px 24px; max-width: 100%; }
          .capa h1 { font-size: 22px; }
          .secao { margin-bottom: 20px; }
          @page { margin: 1.5cm; size: A4; }
        }
      `}</style>

      <div className="page">
        {/* Botão imprimir */}
        <button className="print-btn" onClick={() => window.print()}>
          🖨️ Imprimir / Salvar como PDF
        </button>

        {/* Capa */}
        <div className="capa">
          <div className="capa-badge">Manual do Usuário</div>
          <h1>{LOJA} — Sistema de Gestão</h1>
          <div className="capa-meta">
            Versão {VERSION} &nbsp;·&nbsp; Atualizado em {DATA} &nbsp;·&nbsp; Uso interno
          </div>
        </div>

        {/* Índice — agrupado igual ao menu lateral */}
        <div className="indice">
          <h2>Índice</h2>
          {numerado.map(c => (
            <div key={c.grupo} className="indice-grupo">
              <div className="indice-grupo-label">{c.grupo}</div>
              <div className="indice-grid">
                {c.secoes.map(s => (
                  <div key={s.num} className="indice-item">
                    <span className="indice-num">{s.num}</span>
                    <span>{s.titulo}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Seções */}
        {numerado.map(c => (
          <div key={c.grupo}>
            <div className="capitulo">{c.grupo}</div>

            {c.secoes.map(s => (
              <div key={s.num} className="secao">
                <div className="secao-header">
                  <span className="secao-num">{s.num}</span>
                  <span className="secao-title">{s.titulo}</span>
                  <span className="secao-dot" style={{ background: s.cor }} />
                </div>

                {s.itens.map((item, i) => (
                  <div key={i} className="item">
                    <span className="item-bullet">{i + 1}</span>
                    <div>
                      <div className="item-t">{item.t}</div>
                      <div className="item-d">{item.d}</div>
                    </div>
                  </div>
                ))}

                {s.dicas && s.dicas.length > 0 && (
                  <div className="dicas">
                    <div className="dicas-label">Dicas</div>
                    {s.dicas.map((d, i) => (
                      <div key={i} className="dica">{d}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {/* Rodapé */}
        <div className="rodape">
          <span>{LOJA} · Sistema de Gestão Interno</span>
          <span>{VERSION} · {DATA}</span>
        </div>
      </div>
    </>
  )
}
