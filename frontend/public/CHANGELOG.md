# Changelog — Santuário Nerd

## [v1.41.3] — 2026-10-09

### Segurança
- **Falha crítica do Next.js fechada**: o otimizador de imagens do Next 14 permitia, em certas condições, que alguém de fora executasse comandos no servidor. Ele foi desligado e a rota bloqueada — as imagens das cartas passam a vir direto dos sites das cartas, sem diferença pra quem usa. A correção definitiva vem com a atualização pro Next 15
- **Next.js 14.2.5 → 14.2.35** (a última da versão 14): corrige falhas de travamento e de cache
- Bibliotecas do site atualizadas dentro da mesma versão (axios, postcss, nanoid, ws, form-data, js-cookie e outras), fechando 30+ alertas de segurança

### Mudado
- Mudança de configuração do servidor web (nginx) não pausa mais os pedidos: é aplicada com o site rodando, sem reiniciar. Configuração com erro é recusada e a anterior continua no ar

## [v1.41.2] — 2026-10-09

### Mudado
- **Backup antes de toda atualização**: antes de mexer em qualquer coisa, a atualização copia os bancos (clientes, comandas, pré-vendas, vendas do site, crediário). Se a cópia falhar, a atualização nem começa. Além do backup diário que já existia
- **Atualizar ficou mais simples**: quando uma mudança é aprovada no GitHub, a atualização se prepara sozinha e espera um "Aprovar" — dá pra aprovar pelo celular, na hora mais tranquila da loja. Cada atualização mede, pedido a pedido, se o site ficou fora do ar em algum momento

## [v1.41.1] — 2026-10-09

### Mudado
- **Atualização sem tirar o site do ar**: até agora, cada atualização deixava o site e o painel fora por uns 15 segundos — quem fechasse uma comanda ou finalizasse uma venda nesse instante via erro. Agora a versão nova sobe ao lado da que está no ar, só recebe clientes depois de responder que está pronta, e a antiga termina o que estava fazendo antes de sair. Se a nova não subir, a antiga continua no ar e nada muda. Dá pra atualizar com a loja aberta
- O telão e os celulares da liguinha só piscam a conexão e voltam sozinhos

### Corrigido
- **"Voltar pra versão anterior" não voltava**: a instrução de emergência do deploy trocava a versão, mas o script de atualização puxava a última de novo e desfazia a volta sem avisar. Agora é um comando só: `bash deploy/update.sh <versão>`
- Ao desligar, a API tinha só 10 segundos pra terminar o que estava fazendo (o padrão do Docker) e podia cortar uma venda no meio; agora tem 35

## [v1.41.0] — 2026-10-09

### Novo
- **Mudanças com volta** (Configuração → Mudanças com volta, só o dono): toda mudança grande do sistema passa a entrar com um botão de liga/desliga. Se algo novo der problema na loja, é só desligar e o sistema volta ao jeito antigo na hora, sem esperar atualização. Cada chave explica o que muda ligada e desligada, mostra quem mexeu e quando, e avisa quando chega a hora de revisar. Toda mudança fica na auditoria

### Corrigido
- **Cliente com "0 visitas" que comprou na semana**: o histórico do cliente contava só comanda fechada — quem compra no caixa (PDV) aparecia com 0 visitas, sem primeira nem última visita, mesmo com milhares de reais gastos. Agora visita é cada dia em que o cliente fechou comanda ou comprou no balcão (duas compras no mesmo dia são uma visita)
- **"Clientes ativos" do painel** também ignorava as compras no caixa: quem só compra no PDV contava como inativo. Agora conta os dois
- **Operador barrado em telas do próprio menu**: Liga Mensal, painel da liguinha, Pré-vendas, Mercado de Cartas, Mensageria, Contas a Pagar/Receber e o envio de imagens apareciam no menu do operador com a permissão certa, mas davam "Sem permissão". Páginas públicas (como a Liga Mensal do site) também davam erro pro operador logado. Agora seguem as permissões do perfil dele. Entra com volta: **"Operador: acesso às telas do próprio menu"**
- **Liga Mensal juntava jogadores com o mesmo nome**: dois "João Silva" viravam uma linha só e um deles perdia os pontos. Agora cada jogador tem a sua linha; um lançamento manual entra no jogador de mesmo nome só quando há um só (com homônimos, fica numa linha à parte em vez de chutar). Campeonato cancelado deixa de somar pontos. Entra com volta: **"Liga Mensal: ranking por jogador"**
- **Liga Mensal com ano inválido** (ex.: digitado errado no endereço) dava erro no servidor; agora responde com a mensagem do problema

### Mudado
- Liga Mensal reorganizada: a regra saiu da porta de entrada da API pra um serviço próprio, com 26 testes novos (pontuação, mês de Brasília na virada das 21h, desempate, homônimos, lançamentos manuais e o caminho antigo). Um teste novo confere que o torneio da liguinha, ao encerrar, soma certo na Liga Mensal
- Teste novo que falha se uma rota de admin for criada sem dizer qual permissão do operador abre ela
- O robô que vigia o site a cada 30 min passa a conferir também a página de um campeonato e as chaves de funcionalidade

## [v1.40.0] — 2026-10-09

### Novo
- **Liguinha: torneio suíço dentro do site** (fase 1). Substitui o app de fora que a loja usava:
  - **Organizador** (Campeonatos → Torneio): escolhe melhor de 1 ou 3 e o tempo de rodada, abre o check-in e recebe um código de 5 letras (ex.: C4YN2). Gera cada rodada com um clique — quem tem a mesma pontuação joga entre si, sem repetir adversário, e o bye vai pro último colocado. Vê o que cada jogador lançou, resolve divergências, registra desistência e encerra
  - **Jogador** (santuarionerd.com/liga/jogar, feito pro celular): digita o código, escolhe o deck (dos "Meus decks" ou digitando), vê a mesa, o oponente e o relógio da rodada, e lança "Venci / Empatei / Perdi". Se os dois lançarem igual a partida fecha sozinha; se divergirem, vai pro organizador
  - **Telão** (/liga/torneio/…): relógio grande, mesas e classificação ao vivo, sem login — dá pra deixar numa TV da loja
  - Tudo atualiza na hora em todas as telas, sem precisar recarregar
  - Classificação no padrão do Play! Pokémon: 3 pontos a vitória, 1 o empate, desempate pela % de vitórias dos adversários (OWP)
  - Ao encerrar, a colocação de cada um e o pódio são gravados e **a Liga Mensal soma sozinha** (10/7/5/3/1, como sempre)
- **Timer de campeonato**: ao criar um timer, a opção "É de campeonato?" liga ele ao campeonato do dia. No torneio, ele reinicia sozinho a cada rodada. Se o organizador não criar, o torneio cria um
- **Entrar com Google** (pronto, ainda desligado): botão "Fazer login com o Google" na tela de entrar e "Continuar com o Google" na mesa do QR Code (que já abre a comanda). Não precisa de senha nem de lembrar senha. Primeira vez cria a conta com o e-mail confirmado pelo Google; quem já tem cadastro com o mesmo e-mail é ligado a ele, sem duplicar. Depois de entrar, o site pede só o WhatsApp (e o CPF, se quiser). Só para clientes — a equipe continua com e-mail e senha. Ao ligar o Google a um cadastro que já existia, a senha antiga é apagada e as sessões abertas caem: como o cadastro pelo site não confirma o e-mail, alguém poderia ter criado conta com o e-mail de outra pessoa — assim fica só quem provou ser dona do e-mail. Liga quando o Client ID do Google for configurado no servidor
- **Bloqueio de conta por senha errada**: na 5ª senha errada seguida a conta trava por 1 minuto; se continuar, 5 min, 15 min e 1 hora. Acertar ou redefinir a senha destrava. O bloqueio é **por conta**, não por rede — no wi-fi da loja, um cliente errando a senha não trava ninguém mais. E o aparelho onde a pessoa já entrou antes nunca fica travado: quem tenta adivinhar a senha do Maikon não consegue bloquear o PDV dele. Trocar a senha desliga essa confiança em todos os aparelhos

### Corrigido
- **Falha de segurança no QR Code da mesa**: o login pelo QR Code achava a conta só pelo CPF, sem senha e sem conferir o WhatsApp — quem soubesse o CPF de um cliente entrava na conta dele (até de operador ou admin, se tivesse CPF) e ainda trocava o nome e o WhatsApp do cadastro. Agora:
  - conta com senha (e toda conta da equipe) não entra pelo QR Code: a tela pede e-mail e senha e, depois de entrar, volta pra mesa com o botão "Abrir comanda na mesa"
  - conta sem senha só entra se o WhatsApp for o do cadastro — e, se o cadastro tem CPF, o CPF também
  - o QR Code nunca mais muda nome nem WhatsApp de quem já tem cadastro
  - dados que não batem contam como senha errada: na 5ª a conta trava
- **Login e renovação de sessão limitados pro site inteiro**: o limite contra força bruta valia como um balde só — 5 logins, cadastros ou renovações de sessão por minuto somando TODOS os clientes. Num teste com 24 jogadores entrando juntos, 16 eram barrados; e a renovação automática de sessão disputava esse mesmo balde. Agora o limite é por IP (30/min pra login e cadastro) e a renovação de sessão tem o seu próprio (120/min)
- **Loja inteira dividindo o mesmo limite de uso**: o limite geral (300 requisições/min) contava por IP, e no wi-fi da loja o PDV, as comandas e os celulares dos clientes dividiam o mesmo IP. Agora cada usuário logado tem o seu; por IP só quem não está logado. Testado com 48 jogadores num torneio de 6 rodadas, todos no mesmo IP, sem nenhum bloqueio
- **Mensagem pra "quem está em lista de espera" não chegava a ninguém**: quando a lista de espera virou a fila de pré-venda, os nomes foram pra fila nova, mas a mensageria continuou lendo a lista antiga (vazia). Agora ela lê a fila de pré-venda (só de produtos em pré-venda ativos)
- **Erro no carregamento das telas do admin** (só aparecia no console): o menu lateral lia o perfil antes da hora e o React refazia a tela inteira. Corrigido junto com o aviso do tema claro
- **Valores com ponto em mensagens do servidor**: o servidor de produção roda sem idioma configurado e escrevia dinheiro no formato americano — o cliente recebia "R$ 30.00" no WhatsApp e no e-mail do crediário, e o mesmo valia pra mensagens de erro na tela (crediário, cashback, desconto, Pix), e-mail de inscrição em campeonato e respostas do assistente. Agora todo texto pra pessoas sai "R$ 1.234,56". O Pix e a nota fiscal continuam com ponto, como os sistemas deles exigem. Achado pelo CI novo, que roda os testes no Linux

### Removido
- Código sem uso: a lista de espera antiga (8 rotas — o contador de fila de pré-venda do painel continua no mesmo endereço), a consulta antiga de crediário do cliente (`/api/crediarios/meu`), 26 chamadas do site que nenhuma tela usava e 14 migrations do banco (18 arquivos) que nunca rodavam (o banco é preparado pelos arquivos de SQL de inicialização)

## [v1.39.5] — 2026-10-07

### Mudado
- **Inicialização do banco organizada**: o arquivo de partida do servidor tinha 1.475 linhas, quase 900 delas de SQL que prepara o banco a cada início. O SQL foi pra arquivos próprios (`postgres.sql` e `sqlite.sql`) e o registro dos serviços pra outro arquivo — o de partida ficou com 426 linhas. Sem mudança visível
- **Fim de uma armadilha antiga**: um `{` ou `}` nesse SQL (até num comentário) impedia o servidor de subir. Agora o SQL roda direto no banco e as chaves não quebram mais nada
- Teste novo: a preparação do banco roda duas vezes seguidas sem erro e cria o admin uma vez só

## [v1.39.4] — 2026-10-07

### Mudado
- **Chamadas à API organizadas por assunto**: o arquivo com todas as chamadas do front ao servidor tinha 1.826 linhas. Agora é uma pasta com um arquivo por assunto (crediário, comandas, vendas, fiscal, relatórios etc.). Nenhuma tela muda — só fica mais fácil achar e mexer

## [v1.39.3] — 2026-10-07

### Mudado
- **Fuso de Brasília num lugar só no servidor**: a regra de "que dia é hoje em Brasília" estava copiada em 11 arquivos (relatórios, financeiro, comanda, PDV, fiscal, liga mensal, crediário, e-mail). Agora é uma só. Sem mudança visível — evita que uma cópia fique diferente das outras. A emissão de NFC-e passou a usar a mesma regra, que também funciona se o servidor rodar em Windows

## [v1.39.2] — 2026-10-07

### Corrigido
- **Valores com ponto no lugar da vírgula**: algumas telas mostravam "R$ 12.50" — valor de inscrição de campeonato (admin e página pública), total das notas fiscais, crédito/débito de saldo do cliente, documento da LGPD e conversão de preço das cartas

### Mudado
- **Dinheiro com separador de milhar em todo o sistema**: valores a partir de mil aparecem como "R$ 1.234,56" (antes "R$ 1234,56"), igual aos PDFs. Toda formatação de dinheiro e de "hoje" passa por um lugar só — eram 17 cópias da mesma função e cerca de 100 formatações escritas à mão

## [v1.39.1] — 2026-10-07

### Mudado
- **Site mais leve**: o ícone do site (o mascote) era uma imagem de 428 KB baixada em todas as páginas, mostrada com no máximo 56 pixels. Agora há versões no tamanho certo — o favicon tem 2 KB e a imagem das telas, 9 KB. O logo da página inicial era um SVG de 139 KB com uma imagem embutida; virou WebP de 39 KB. Na primeira visita são cerca de 500 KB a menos, o que pesa no celular com internet fraca
- **Ícone do app no celular**: o app instalado usava como ícone o logo retangular (1600×900) declarado como quadrado, o que podia sair distorcido. Agora usa o mascote em 192 e 512 pixels, com uma versão própria pra Android (com margem, que não é cortada) e outra pro iPhone (o iPhone não aceitava o ícone em SVG que estava configurado)
- **Ícone das notificações push**: era a imagem de 1600×900; agora é o mascote em 192 pixels

### Removido
- Imagens sem uso: `maikon-avatar.png`, `logo-sidebar.svg`, `icon-maskable.svg` e as versões pesadas do logo

## [v1.39.0] — 2026-10-07

### Corrigido
- **Venda de reserva gravada com forma de pagamento inválida**: na homologação de pré-venda, escolher Débito ou Crédito gravava os textos "Débito"/"Crédito" em vez dos códigos que o resto do sistema reconhece. Essas vendas ficavam fora da contagem de cartão do painel e apareciam como forma desconhecida nos relatórios por forma de pagamento. Havia 24 vendas assim (R$ 9.153,40) — são corrigidas sozinhas no deploy. A validação agora fica no registro da venda, então nenhum caminho consegue gravar forma inválida de novo

### Mudado
- **Formas de pagamento num catálogo único**: a lista de formas (e as regras de cada uma — precisa de cliente, gera pontos, quita crediário) estava copiada em vários lugares do sistema. Agora vem de um catálogo só, no servidor e no painel, com um teste que impede os dois de divergirem. Os nomes ficaram padronizados: "Crediário (30 dias)" virou "Crediário" (o prazo é escolhido na hora), "Pontos de Fidelidade" virou "Pontos" e "Cashback (Saldo)" virou "Cashback"

## [v1.38.2] — 2026-10-06

### Corrigido
- **Botões de liga/desliga quebrados pelo sistema**: cada tela tinha o seu feito à mão. No Fiscal a bolinha escapava do trilho quando ligada; em Configurações e no formulário de produto do Estoque, desligado no tema claro o trilho ficava quase branco, igual à bolinha, e parecia que o botão tinha sumido. Agora todos (Configurações, Estoque, Fiscal e avisos do Crediário) usam o mesmo componente, com medidas fixas e cinza visível nos dois temas, e são lidos corretamente pelo leitor de tela

## [v1.38.1] — 2026-10-06

### Corrigido
- **Histórico de vendas do PDV depois das 21h**: o "hoje" do histórico era calculado no horário de Londres — das 21h à meia-noite virava o dia seguinte. O rótulo "hoje" sumia, o botão "Hoje" levava pra um dia sem vendas e o calendário deixava escolher amanhã. Agora segue o calendário de Brasília

## [v1.38.0] — 2026-10-06

### Adicionado
- **Pagar uma parte pelo link**: na página de pagamento do crediário o cliente escolhe "Pagar outro valor" e digita quanto quer pagar agora (mínimo R$ 1,00, até o que falta na conta). A baixa é automática e a conta continua aberta com o restante
- **Pagar todas as contas num Pix só**: quem tem mais de uma conta aberta vê a opção "Pagar todas as contas" com o total. Um Pix só, e a baixa distribui o valor quitando primeiro a conta que vence antes. No perfil, o botão "Pagar tudo com Pix" aparece embaixo do total devido

## [v1.37.0] — 2026-10-06

### Adicionado
- **O cliente confere a própria dívida no perfil**: na aba Dívida, cada conta mostra quanto falta pagar, o total e quanto já foi pago, o vencimento, e "O que você levou" com tudo somado ("3× Coca Cola Lata"). Em "Ver histórico" aparece cada compra e cada pagamento, do mais recente pro mais antigo, com data e hora, de onde veio (comanda, compra no balcão), os produtos de cada compra, compras canceladas riscadas e ajustes de valor feitos pela loja
- **Extrato em PDF pro cliente**: botão "Extrato PDF" em cada conta baixa o mesmo documento da súmula da loja, sem as observações internas e sem a lista de lembretes
- **Contas já quitadas** ficam guardadas no perfil ("Ver contas já quitadas"), com o histórico e o extrato de cada uma

## [v1.36.1] — 2026-10-06

### Corrigido
- **Linha da compra ficava preta ao passar o mouse** no tema claro, escondendo o texto (a cor de destaque usada não tinha versão clara)
- **Botões de liga/desliga dos avisos escapavam do trilho** — a bolinha saía pra fora quando ligado
- **Dias de aviso marcados pareciam desligados** no tema claro (azul quase transparente). Agora o dia marcado tem fundo sólido
- **Texto do "Avisos automáticos" dizia "Desligado…" mesmo ligado** — agora acompanha o botão
- Avisos em amarelo e o aviso de "pago a mais" com contraste nos dois temas

## [v1.36.0] — 2026-10-06

### Mudado
- **Crediário com os itens somados**: a conta mostra um resumo com tudo junto — "23× Coca Cola Lata — R$ 115,00" em vez de 23 linhas de "1× Coca Cola Lata". Vale pras contas novas e pras antigas (que vinham como uma lista corrida enorme em "Compras anteriores"). O mesmo produto com preço diferente fica em linhas separadas. O detalhe de cada compra continua em "Ver por compra", e o perfil do cliente também passou a mostrar os itens somados

### Adicionado
- **Súmula do crediário em PDF**: botão "Súmula (PDF)" em cada conta gera o documento completo — dados da conta, totais (total, pago, saldo, situação), resumo dos itens somados, extrato com data e hora de cada compra, estorno e pagamento (de onde veio cada compra — comanda, venda no balcão, lançamento manual — e a forma de cada pagamento) com o saldo correndo, os itens de cada compra, os lembretes de vencimento enviados e espaço pra assinatura do cliente e da loja. Substitui o antigo "Imprimir", que só listava os itens

## [v1.35.1] — 2026-10-06

### Corrigido
- **Vencimento da conta nova vinha com um dia a mais à noite**: na janela "Conta de Crediário" (fechamento de comanda e PDV), a data sugerida de 30 dias e o limite mínimo do calendário eram calculados no horário de Londres — das 21h à meia-noite já pulavam pro dia seguinte. Agora seguem o calendário de Brasília
- **Rótulo da conta nova**: dizia "prazo 30 dias" mesmo depois de escolher outra data. Agora mostra a data escolhida ("Nova conta — vence 20/11/2026")

## [v1.35.0] — 2026-10-06

### Adicionado
- **Link pro cliente pagar o crediário por Pix**: cada conta tem um link próprio que abre no celular, sem login — mostra o saldo, o vencimento e as datas das compras, gera o Pix na hora e confirma sozinho quando o pagamento cai (dá baixa automática na conta). O link mostra só o primeiro nome do cliente e valores, nada de telefone, e-mail ou CPF, e não dá pra adivinhar
- **O aviso de vencimento leva o link**: com o Pix do Inter configurado, a mensagem de lembrete (WhatsApp, e-mail) vem com "Pague por Pix na hora, por este link". Cliente com várias contas recebe o link de cada uma
- **"Pagar com Pix" no perfil do cliente**: cada conta na aba Dívida tem o botão, que abre a mesma página de pagamento
- **Copiar link de pagamento** no botão "Avisar" do admin, pra mandar por onde quiser

### Mudado
- **Cobrança Pix reaproveitada**: abrir o link de novo, clicar duas vezes ou o admin usar "Cobrar via Pix" devolve a cobrança que ainda está valendo pro mesmo saldo, em vez de abrir outra no banco a cada clique

## [v1.34.0] — 2026-10-02

### Adicionado
- **Aviso automático de vencimento do crediário**: o sistema lembra o cliente sozinho nos dias escolhidos — por padrão 3 dias antes, no dia do vencimento e com 3, 7, 15 e 30 dias de atraso. A mensagem sai pelo sininho e push do app, por e-mail e, se ligado, pelo WhatsApp da loja. Cliente com mais de uma conta recebe uma mensagem só, com cada conta e o total em aberto. Cada aviso sai uma vez por vencimento (se o prazo for prorrogado, recomeça pela data nova), só a partir do horário escolhido e nunca depois das 20h, e quem já foi avisado à mão no dia não recebe outro
- **Configuração dos avisos**: botão "Avisos" no topo da tela do crediário — liga e desliga, escolhe os dias, o horário e os canais, e permite um recado no fim da mensagem (ex.: a chave Pix da loja). O WhatsApp vem desligado: mensagem automática pelo número da loja é escolha do dono. A tela mostra se o WhatsApp está conectado
- **Resumo do dia pro admin**: uma notificação por dia com quantas contas vencem hoje, quantas estão atrasadas e quanto somam, e pra quantos clientes saiu lembrete
- **Botão "Avisar" em cada conta**: mostra a mensagem antes de mandar e envia na hora pelos canais ligados. Sem o WhatsApp da loja conectado, "Pelo meu WhatsApp" abre a conversa no celular com o texto pronto, e dá pra copiar o texto
- **Último aviso no card**: cada conta mostra quando foi avisada e por onde ("Avisado 02/10, 12:00 · App, E-mail"), com o motivo quando algum canal falhou
- **Link do aviso abre direto na dívida**: a notificação leva o cliente pra aba Dívida do perfil

### Corrigido
- **E-mail de crediário aberto**: dizia que novas comandas ficariam bloqueadas enquanto houvesse dívida (não é verdade há tempos) e mostrava o vencimento no fuso do servidor. Agora aponta pra aba Dívida do perfil e mostra a data certa
- **Manual do crediário**: atualizado — falava em "um crediário por vez", em "Marcar como Pago" e em prazo renovado a cada pagamento, nada disso vale mais

## [v1.33.1] — 2026-10-01

### Corrigido
- **Cliente via só uma das dívidas**: quem tem mais de uma conta de crediário aberta (cada uma com seu prazo) via no perfil só a primeira. Agora a aba Dívida mostra o total devido e cada conta separada, com saldo, vencimento, aviso de vencida e o que foi comprado em cada dia
- **Conta vencida um dia antes**: o vencimento escolhido como data era gravado à meia-noite UTC — 21h da véspera no horário de Brasília — e a conta aparecia vencida na noite anterior. Agora vale até o fim do dia escolhido. As contas abertas que já existiam são corrigidas sozinhas no deploy
- **Contas vencidas fora do "valor em aberto"**: no filtro "Todos" da tela do crediário, as contas vencidas não entravam na contagem de abertas nem no saldo restante
- **Dois pagamentos ao mesmo tempo**: caixa e conferência automática do Pix lançando na mesma conta ao mesmo tempo podiam apagar um pagamento do outro. Agora a soma é feita direto no banco e, se a conta mudou no meio, o segundo lançamento é recusado com aviso pra recarregar
- **Quitar dívida com pontos ou cashback**: a tela não oferecia, mas o sistema aceitava Pontos, Cashback e até "Crediário" como forma de pagar a conta, sem descontar nada do cliente. Agora só Dinheiro, Pix e cartões
- **Quitação sem registro de pagamento**: existia um caminho antigo (sem uso na tela) que marcava a conta como paga sem lançar o pagamento — o dinheiro não aparecia no extrato. Foi removido

### Adicionado
- **Histórico de alterações do crediário**: editar o valor, o vencimento ou os itens de uma conta, e excluir uma conta, agora fica registrado na auditoria — quem fez, quando e qual era o valor antes

## [v1.33.0] — 2026-09-30

### Mudado
- **Crediário separado por compra**: a conta de crediário juntava os itens de todas as compras numa lista corrida só — numa conta que acumulava comanda, venda no balcão e mais comanda, ninguém sabia o que era de qual dia. Agora cada compra aparece numa linha própria, com data, origem (comanda, venda no balcão, lançamento manual) e valor, e os itens ficam fechados dentro dela. Compra estornada continua visível, riscada e marcada como estornada. Quando o valor da conta foi editado à mão e não bate com a soma das compras, a diferença aparece como "ajuste manual". A impressão e a edição de itens seguem o mesmo agrupamento. Contas antigas são convertidas sozinhas no primeiro start: o que já estava acumulado vira um bloco "Compras anteriores"

### Corrigido
- **Pagamento dividido passava do saldo**: no pagamento em dois métodos só o primeiro era comparado com o saldo — um Pix de R$ 50 + R$ 30 em dinheiro numa dívida de R$ 50 era aceito e registrava R$ 80 recebidos. Agora a soma dos dois é conferida
- **Pix pago depois do acerto sumia**: se a conta era acertada por outro meio com uma cobrança Pix ainda aberta e o cliente pagasse o Pix depois, o dinheiro caía no banco sem aparecer em lugar nenhum. Agora, ao lançar pagamento ou excluir a conta, as cobranças Pix abertas dela são canceladas no Inter (se o cliente tiver acabado de pagar, o sistema avisa e não lança duas vezes). E se mesmo assim um Pix for pago além do saldo, o pagamento é registrado inteiro e o que passou vira crédito no saldo do cliente
- **Estorno de compra acumulada não baixava a dívida**: estornar uma comanda que tinha sido somada numa conta já aberta devolvia o estoque mas deixava a dívida cobrando — o estorno só achava a comanda que abriu a conta. Agora cada compra é encontrada e só o valor dela sai da conta. Junto disso, o estorno deixou de ser travado por qualquer pagamento anterior na conta: só é recusado quando o que o cliente já pagou fica maior que o que sobra (aí tem devolução a acertar). E o valor baixado é o que de fato foi pro crediário, sem contar pontos, desconto e a parte paga em outro método

## [v1.32.1] — 2026-09-14

### Adicionado
- **Prazo pra pagar a inscrição editável na tela**: o tempo que a vaga fica guardada esperando o Pix (padrão de 30 minutos) só dava pra mudar direto no banco. Agora é um campo nos modais de novo campeonato e de edição, que só aparece quando o campeonato tem taxa — sem cobrança a vaga já é firme na hora. Aceita de 1 a 1440 minutos, e a contagem regressiva que o jogador vê passa a seguir o prazo configurado

### Corrigido
- **Timer de torneio ainda rodava fora do painel**: a v1.29.1 tirou o botão do timer da vitrine, mas o relógio por trás dele continuava ligado — com o dono logado no mesmo navegador, a consulta e o alarme seguiam rodando na loja e na tela da mesa. Agora o timer inteiro vive só no painel do admin

## [v1.32.0] — 2026-09-08

### Adicionado
- **Conferência de decks do campeonato**: botão novo na aba de participantes que abre a lista inteira de uma vez — quantos registraram deck, quantos estão com alguma irregularidade e quantos não registraram nada. Cada jogador mostra o deck, o total de cartas e o resumo da conferência; clicando, o deck abre **carta por carta**, com quantidade, coleção e número. As regras conferidas são as mesmas que o cliente vê ao montar o deck: tamanho do formato (60 cartas no Pokémon e Magic, 50 no One Piece e Riftbound) e limite de cópias (energia do Pokémon não conta, por regra oficial)
- **Folha de conferência impressa**: um deck ou o campeonato inteiro, um jogador por página, com caixinha pra riscar carta a carta, os alertas do deck no topo e espaço pra assinatura do juiz e do jogador. É o papel que vai pra mesa
- **Decks no histórico do cliente**: nova aba **Decks** ao lado de Campeonatos, em Clientes → Ver Histórico. Lista os decks que a pessoa montou no sistema (jogo, formato, número de cartas) e abre cada um carta por carta, na mesma tela de conferência. Serve pra conferir sem depender de o cliente estar inscrito em algum campeonato

### Mudado
- **"Ver deck" no lugar do olhinho**: na lista de participantes o acesso ao deck era um ícone de 14 pixels que ninguém achava. Agora é um botão escrito, e quem **não** registrou deck aparece marcado com "Sem deck" em vez de simplesmente não ter botão — antes não dava pra diferenciar quem não informou de quem não tinha onde clicar

## [v1.31.0] — 2026-09-08

### Adicionado
- **A cobrança da inscrição agora diz de quem ela é**: em cima do QR aparece "Inscrição de **Fulano** · jogador **#7**". Antes o jogador via só um QR e um valor — pagava sem nenhuma pista de que aquilo estava amarrado à conta dele, e ficava a dúvida de como a loja saberia quem pagou
- **Confirmação com identificação e caminho**: a tela de "Pagamento confirmado!" repete o nome e o número do jogador e aponta para **Meus Campeonatos**, onde a inscrição fica registrada com o selo de paga
- **Aviso quando o pagamento é confirmado**: quem pagou e fechou a tela não ficava sabendo de nada — a confirmação acontecia calada no servidor. Agora chega notificação no sininho e push: "Inscrição confirmada — pagamento recebido, sua vaga está garantida e você é o jogador #7". Vale também quando quem confirma é o robô, minutos depois

## [v1.30.0] — 2026-09-08

### Adicionado
- **Contagem regressiva da vaga na inscrição**: campeonato com taxa segura a vaga por 30 minutos (ou o prazo configurado), mas o jogador não via isso em lugar nenhum — pagava atrasado sem saber que existia prazo. Agora, junto do QR do Pix, aparece **"Sua vaga está guardada por 29:47"** correndo em tempo real, e quando o tempo acaba a mensagem explica que a vaga voltou pro público e que pagar ainda vale se o campeonato não tiver lotado. A contagem também aparece no painel do cliente, em Meus Campeonatos, enquanto o Pix está aberto
- **Botão "Já paguei"**: pergunta na hora ao banco se a taxa caiu, em vez de esperar o robô de conciliação, que só roda de 5 em 5 minutos. Se ainda não caiu, avisa sem drama e continua esperando
- **Confirmação automática na própria tela da inscrição**: enquanto o QR está aberto, a tela confere sozinha a cada 6 segundos e troca para "Pagamento confirmado!" assim que o Pix cai — antes a pessoa ficava olhando um QR sem retorno nenhum. O painel do cliente já fazia isso; agora a inscrição feita direto da vitrine também faz

## [v1.29.2] — 2026-09-08

### Corrigido
- **Balão do WhatsApp continuava no painel mesmo com o atendimento desligado**: a correção da v1.29.1 escondia o botão só quando a integração não estava "configurada" — e ela conta como configurada assim que o servidor sobe, porque a chave e o nome da instância vêm da configuração do próprio servidor, mesmo numa loja que nunca leu o QR Code. Agora o botão exige **celular pareado**: aparece quando o WhatsApp está de fato conectado e some quando não está, seja porque nunca foi ligado, porque a sessão caiu ou porque o serviço está fora do ar. O estado é reconferido a cada minuto, então ler o QR Code faz o botão aparecer sozinho, sem recarregar o painel. O atendimento completo continua no menu lateral, em Atendimento → WhatsApp

## [v1.29.1] — 2026-09-08

### Corrigido
- **Comanda ainda fechava sozinha com clique fora**: a correção da v1.29.0 pegou só parte das janelas. Faltavam justamente as da comanda — **Abrir comanda** (perdia o cliente escolhido e a mesa digitada), **Adicionar produto à comanda** (perdia a busca e a quantidade) e **Fechar comanda** (perdia forma de pagamento, desconto, pontos aplicados e a marcação de emitir nota, no meio do fechamento). Agora as três só fecham no X ou no botão de cancelar. Mesma correção no lançamento manual da Liga Mensal, na nova pré-venda e no cadastro de timer
- **Timer aparecia na vitrine do cliente**: a aba lateral do timer de torneio estava montada na base do site inteiro, então quando o dono estava logado no mesmo navegador ela aparecia por cima da loja e da tela de mesa do cliente. Voltou a ser coisa do painel — segue em todas as telas do admin, some do que o cliente vê
- **Botão de WhatsApp no painel sem a integração ligada**: o balão verde de atendimento ficava na tela mesmo sem o WhatsApp configurado, piscando contador de não-lidas que nunca ia chegar, e ainda consultava o servidor a cada 15 segundos. Agora ele só existe quando a integração está configurada, e aparece sozinho assim que ela for ligada
- **Botão "Falar com..." da vitrine sem número cadastrado**: se a loja apagasse o WhatsApp nas configurações do site, o botão flutuante continuava lá e levava pra um link vazio. Sem número, ele e o contato do rodapé simplesmente não aparecem

## [v1.29.0] — 2026-09-08

### Corrigido
- **Venda em andamento não some mais com um clique fora**: no modal de "Nova Venda" da frente de caixa, qualquer clique no fundo escurecido fechava a janela e levava junto o cliente escolhido, o carrinho e a forma de pagamento — sem aviso e sem como voltar. Agora a venda só é descartada no **X** (ou no "Cancelar" da primeira etapa). Mesma correção no modal de detalhe da venda, onde a forma de pagamento é editada, na edição de comanda e no estorno de comanda, que perdia o motivo digitado
- **Banner de cookies pedindo autorização de novo toda hora**: a escolha era guardada só no armazenamento do navegador, que é separado por endereço — quem entrava por `www.santuarionerd.com.br` depois de aceitar em `santuarionerd.com.br` respondia tudo outra vez. Agora a decisão também vai para um cookie válido no domínio inteiro, com validade de um ano, e vale nos dois endereços

### Mudado
- **Banner de cookies refeito**: card com visual do site (acompanha tema claro e escuro), em vez da faixa cinza colada no rodapé. Diz o que é guardado e para quê, com um botão **Personalizar** que abre as categorias: **Necessários** (login, sessão, segurança e a comanda da mesa — sempre ativos) e **Preferências** (tema da tela e a dispensa do convite de instalação do app, opcionais). Também deixa explícito que o site não usa rastreamento, publicidade nem venda de dados — não existem porque o sistema realmente não carrega nada de terceiros
- **Dá para mudar de ideia sobre os cookies**: novo link **"Preferências de cookies"** no rodapé reabre o banner já nas categorias. Recusar as opcionais agora apaga de verdade o que estava guardado (tema e dispensa do app), em vez de valer só dali pra frente
- **Banner não aparece mais no painel e no login**: ali é ferramenta de trabalho autenticada, e o card ficava por cima da frente de caixa. Segue aparecendo em toda a parte pública, inclusive na tela de mesa do cliente
- **Regra de modal padronizada**: janela com campo pra preencher fecha só no X ou no cancelar; janela só de leitura (gráfico, resumo do dia, atalhos de teclado) continua fechando com clique fora

## [v1.28.0] — 2026-08-24

### Adicionado
- **Forma de pagamento no histórico do cliente**: cada compra no painel do cliente agora mostra como foi paga — um selo com "Pix", "Dinheiro", "Crediário", e "Pix + Cashback" quando o pagamento foi dividido. Ao abrir a compra, a conta aparece inteira: pontos aplicados, desconto e quanto saiu em cada forma de pagamento. Compra antiga, de antes do sistema guardar isso, diz "forma de pagamento não registrada" em vez de deixar o espaço em branco
- **Compra no balcão aparece no histórico do cliente**: venda feita na frente de caixa com o cliente identificado só era visível pro admin — o cliente via só as comandas. Agora as duas coisas aparecem na mesma lista, em ordem de data, com ícone próprio pra cada origem. Venda de balcão sem cliente identificado continua fora, porque não tem a quem vincular
- **Filtro por forma de pagamento no histórico**: uma barra de botões no topo da lista — "Tudo", "Pix", "Dinheiro", e por aí — pra ver só as compras pagas de um jeito, com a quantidade em cada um. Só aparecem as formas que o cliente realmente usou, e compra dividida conta nas duas (Pix + Cashback aparece nos dois filtros)
- **Compra estornada aparece marcada, não some**: a compra desfeita pela loja fica na lista riscada, com selo "Estornada", a data e o motivo que a loja registrou — e não entra no "Gasto no Mês". Vale pra venda de balcão e pra comanda

### Mudado
- **"Gasto no Mês" do cliente agora soma comanda + balcão**: antes contava só comanda, então o total não batia com o que a própria tela mostrava

## [v1.27.4] — 2026-08-18

### Corrigido
- **Não dava pra digitar o preço no Mercado de Cartas**: o campo se reescrevia sozinho a cada tecla, então digitar "129,90" terminava em R$ 0,02 e só as setinhas funcionavam — de um centavo em um centavo. Agora o valor é digitado normalmente, aceita vírgula ou ponto, corta na segunda casa decimal e ignora letra. Vale pra anunciar carta nova e pra editar anúncio existente, que já abre com o preço preenchido
- **Preço alto ficava difícil de ler**: a carta de R$ 12.345,67 aparecia como "R$ 12345,67", sem separador de milhar, tanto no painel quanto na vitrine do cliente

## [v1.27.3] — 2026-08-17

### Corrigido
- **Cliente não via quantas unidades tinha reservado**: na aba "Pré-vendas" do painel do cliente, o card mostrava só o nome do produto — quem reservou duas ou três unidades via a mesma coisa de quem reservou uma, e ficava sem confirmação do que pediu. A quantidade aparecia no carrinho na hora de reservar e some depois de confirmar. Agora o card mostra **"2× Nome do Produto"**, tanto na pré-venda quanto na fila de espera. Do lado do admin a quantidade sempre apareceu — era só a tela do cliente que omitia

## [v1.27.2] — 2026-08-12

### Adicionado
- **Vencimento do crediário escolhido na abertura**: ao abrir conta nova — pelo fechamento da comanda, pela frente de caixa ou no cadastro manual de dívida — dá pra definir a data de vencimento em vez de aceitar os 30 dias fixos. Serve pro caso do produto que chega depois: a dívida não vence antes de o cliente receber a mercadoria. Em branco continua sendo 30 dias, e alterar o vencimento de uma conta já existente segue disponível no botão de editar da lista

### Mudado
- **Venda no crediário pela frente de caixa agora pergunta em qual conta lançar**: se o cliente já tem conta aberta, aparece a mesma escolha que o fechamento de comanda já oferecia — acumular numa conta existente ou **abrir conta nova com prazo próprio**. Antes o balcão grudava tudo na primeira conta aberta, sem perguntar, e não dava pra ter duas dívidas separadas (o caso do cliente com dois crediários)

### Corrigido
- **Extrato parecia brigar com a Receita**: o total do extrato aparecia maior que a Receita do topo (ex.: R$ 38.040,70 contra R$ 28.395,47) porque ele soma **entrada de caixa**, e recebimento de crediário entra no caixa sem ser receita nova — a venda fiada já tinha virado receita no dia em que foi feita. Nenhum dos dois números estava errado, faltava dizer isso: agora o painel mostra a conta separada — vendas do período, recebimento de crediário e o total que entrou no caixa
- **Compra nova renovava o prazo da dívida antiga**: ao acumular no crediário pelo PDV, o vencimento da conta inteira era jogado 30 dias pra frente, então dívida velha ganhava prazo novo a cada compra. Agora o vencimento da conta não é alterado ao acumular — o fechamento de comanda já se comportava assim

## [v1.27.1] — 2026-08-12

### Corrigido
- **Cliente que já tem conta conseguia se cadastrar de novo**: a checagem de duplicidade comparava o texto exatamente como foi digitado, então bastava mudar a pontuação — "529.982.247-25" passava por cima de "52998224725", e "+55 (17) 99112-2890" não era reconhecido como o mesmo "17991122890". Agora e-mail, CPF e WhatsApp são comparados normalizados (e a busca também limpa os cadastros antigos, que foram salvos formatados). Vale no cadastro pelo site, no cadastro feito pela loja, na correção de dados do cliente e no login por QR Code — que também criava conta repetida em vez de reencontrar a existente
- **"CPF inválido" para CPF válido**: digitar o CPF com ponto e traço era recusado, porque o validador exigia exatamente 11 dígitos sem pontuação. Agora aceita dos dois jeitos e guarda só os números
- **Aviso de cadastro repetido agora diz o que aconteceu**: em vez de um "erro ao criar conta" genérico, a tela marca o campo repetido (e-mail, CPF ou WhatsApp), explica que já existe conta com aquele dado e oferece o caminho — login ou "esqueci minha senha"
- WhatsApp duplicado passou a ser verificado no cadastro (antes só e-mail e CPF eram checados)

### Segurança
- Índices únicos de e-mail e CPF no banco, criados no deploy **apenas se não houver duplicados** — a checagem da aplicação continua valendo de qualquer forma

## [v1.27.0] — 2026-08-12

### Adicionado
- **Estorno de venda e de comanda**: venda lançada errada agora tem botão de desfazer — no detalhe da venda (frente de caixa) e no histórico de comandas fechadas. O estorno devolve os itens ao estoque, desfaz pontos e cashback usados, retira os pontos de fidelidade ganhos, baixa o crediário que a venda gerou e **tira o valor do faturamento**. Exige motivo, guarda quem fez e fica registrado na auditoria. A venda não é apagada: continua no histórico marcada como estornada
- **Extrato do período no Financeiro**: painel que mostra de onde veio cada real — venda de balcão, comanda, pedido do site, pré-venda e pagamento de crediário — com hora, cliente, forma de pagamento e quem lançou. As estornadas aparecem riscadas com o motivo, e o rodapé separa quanto entrou de quanto foi estornado
- **Total do pedido na pré-venda**: o kanban mostrava só o subtotal de cada item; agora o selo do carrinho traz o total do pedido inteiro, sem precisar somar na mão

### Corrigido
- **Excluir crediário não desfazia a venda**: o produto não voltava pro estoque e o valor continuava no faturamento, porque a receita pertence à venda e o crediário é só o registro da dívida — e venda de balcão nem tinha vínculo com o crediário que gerava. Agora a venda guarda esse vínculo e o estorno resolve os dois lados de uma vez
- Estorno é recusado quando a venda tem **NFC-e autorizada** (o cancelamento da nota tem prazo legal e vai à SEFAZ) ou quando o **crediário já recebeu pagamento**

## [v1.26.1] — 2026-08-11

### Mudado
- **Desconto em % agora aceita qualquer valor digitado**: o seletor só oferecia 5%, 10%, 15% e 20% — qualquer outro percentual obrigava a fazer a conta na mão e lançar em reais. Os atalhos continuam, e ao lado deles tem um campo pra escrever a % que quiser (0 a 100). Vale na **frente de caixa**, no **fechamento da comanda**, na **edição de comanda já fechada**, na **homologação de pré-venda** e no **desconto padrão** das Configurações. É tudo tela de admin — o cliente não escolhe desconto em lugar nenhum

## [v1.26.0] — 2026-08-11

### Adicionado
- **Pré-venda manual com vários itens**: a tela de registrar pré-venda em nome do cliente só aceitava um produto por vez — pra cada item era preciso refazer o modal inteiro, buscar o cliente de novo, e cada item virava um pedido solto (com Pix e homologação separados). Agora dá pra ir adicionando quantos produtos quiser no mesmo pedido, com uma lista pra revisar e remover antes de registrar. Tudo entra num pedido só, e se um item falhar nenhum estoque é baixado
- **Impressão de conferência dos itens** (sem valor fiscal) no PDV e na comanda: lista com quadradinho de check por item, quantidade, valor unitário, subtotal, total e linha de assinatura — pra conferir a mercadoria com o cliente na entrega. Sai em **bobina 80mm**, **bobina 58mm** ou **A4** (pra salvar em PDF). Não substitui NFC-e/cupom fiscal, que continua no fechamento

### Mudado
- **Carrinho do PDV mais largo**: com a coluna estreita o nome do produto ficava cortado no meio e pedido grande não dava pra conferir. A coluna cresceu, o nome aparece inteiro e a barra de rolagem ficou visível
- **Resumo antes de fechar a venda**: a caixinha dos itens na etapa de pagamento mostrava poucas linhas e cortava o nome. Agora é maior, mostra o nome completo, a variante e o total de produtos/unidades

## [v1.25.5] — 2026-08-11

### Corrigido
- **Proteção contra bloqueio do SEFAZ (cStat 656)**: o sistema agora conserva no banco um intervalo seguro de 1h05 entre sincronizações, inclusive após reiniciar; impede que o job automático e o botão manual consultem ao mesmo tempo; desabilita o botão com contagem regressiva; e não mostra mais o falso aviso verde de sucesso quando o SEFAZ bloquear a consulta

## [v1.25.4] — 2026-08-11

### Mudado
- **"Receita hoje" saiu da barra do Dashboard**, a pedido do Maikon. É só a retirada da tira do topo — o número continua sendo calculado normalmente e segue disponível na tab **Análises** e no **Financeiro**

## [v1.25.3] — 2026-08-11

### Corrigido
- **Fundo acinzentado no tema claro**: várias caixas do sistema (as opções de vitrine no cadastro de produto, os blocos de "Dica", os painéis do Financeiro, do Fiscal, do LGPD e das Integrações) apareciam com um cinza escuro chapado por cima do branco. Era o fundo do tema escuro vazando: quando a caixa tem transparência, o tema claro não estava trocando a cor. Agora essas caixas ficam no mesmo tom claro do resto da tela. O tema escuro não mudou em nada

## [v1.25.2] — 2026-08-10

### Mudado
- **Menu lateral reorganizado por tarefa**: existia um grupo "Gestão & Loja" com 16 itens onde Estoque e Categorias ficavam a sete linhas de distância. Agora são grupos curtos — Dia a dia, Catálogo, Clientes, Financeiro, Eventos, Divulgação, Configuração e Ajuda & Sistema — com o que se usa toda hora no topo. Estoque e Categorias ficaram vizinhos e Pré-vendas subiu pro "Dia a dia"
- **O Manual do Sistema entrou no menu** (Ajuda & Sistema). Antes só dava pra chegar nele por dentro da página "Sobre o Sistema"

### Corrigido
- **Manual reorganizado**: a numeração das seções era digitada à mão e já tinha virado 07, 07b, 07c, 07d, 07e. Agora é calculada sozinha (01 a 28) e as seções ficam em capítulos com os mesmos nomes do menu — o que você procura no manual está no mesmo lugar em que está na tela
- Seções novas de **Categorias, Vitrine (parcelamento e Pix), Análises de Clientes, Contas a Pagar/Receber, Liga Mensal e LGPD**, que não estavam documentadas
- A seção de reservas ainda ensinava o botão Homologar antigo, item a item — foi reescrita com o kanban, o carrinho saindo inteiro, o Pix do pedido e a correção de quantidade

## [v1.25.1] — 2026-08-10

### Adicionado
- **Desconto do Pix também item a item**: além do percentual por categoria, cada produto pode ter o seu no cadastro (campo "Desconto no Pix deste item"). Vazio herda da categoria — e da categoria pai, se for subcategoria — e cai no padrão da loja se ninguém tiver definido. **Zero** é decisão de verdade: aquele item não anuncia desconto no Pix, mesmo que a categoria dele tenha
- **O aviso do Pix agora aparece enquanto o cliente navega**, não só depois de abrir o produto: nos cards da vitrine da home, na listagem de Produtos ("R$ 189,14 no Pix · 3% OFF") e no modal de produto da home
- **Total no Pix na hora de fechar a reserva**: o carrinho mostra "Pagando no Pix R$ 260,96 — economia de R$ 13,83", com a conta feita item a item (um produto com 3% e outro com 10% no mesmo carrinho somam certo)

## [v1.25.0] — 2026-08-10

### Adicionado
- **Parcelamento e desconto do Pix na página do produto** (pedido do Maikon): abaixo do preço agora aparece "em até 12x de R$ 16,25 sem juros" e "ou R$ 189,14 com 3% OFF no Pix", igual às lojas grandes. É informação de vitrine — o desconto continua sendo aplicado por você no fechamento
- **O parcelamento é definido item a item**, no cadastro do produto (campo "Parcelar no cartão em até", junto dos botões de marketplace e destaque): deixou vazio, aquele produto não mostra parcelamento nenhum. Produto novo já vem preenchido com o padrão configurado em Personalizar Site — é só mudar ou limpar
- **Cada categoria pode ter o próprio percentual de Pix** (Categorias → Desconto no Pix): Pokémon com 3% enquanto o resto da loja segue o padrão. Subcategoria sem percentual herda o da categoria pai, e quem não tem nada usa o padrão da loja
- Em Personalizar Site → *Vitrine — cartão e Pix* ficam o percentual padrão do Pix, o parcelamento padrão de produto novo e a **parcela mínima** — esta última vale pra loja toda: produto barato parcela em menos vezes sozinho, pra não aparecer "12x de R$ 1,67"
- ⚠️ Os produtos que já estão cadastrados começam **sem parcelamento** (campo vazio). Quem quiser a linha do cartão neles precisa preencher o campo — em massa dá pra fazer depois, se valer a pena

### Corrigido
- **"Reservei 2 itens, só retirou um"**: quando o cliente reservava vários produtos de uma vez, o botão Homologar resolvia só a linha clicada e o resto do carrinho ficava em aberto pra sempre, sem aviso nenhum. Agora um clique homologa o pedido inteiro: o modal lista tudo que vai sair, o desconto é calculado sobre o total do carrinho e o caixa recebe **uma venda só**, com todos os itens. Se algum item for cancelado enquanto você preenche a tela, nada é homologado e o sistema avisa pra reabrir
- **Carrinho de reserva vazava entre contas**: o carrinho ficava salvo no navegador e não era apagado no logout — quem entrasse depois na mesma máquina via itens que nunca tinha escolhido (a bolinha roxa com produto de outra pessoa)
- **Risco de reserva duplicada**: quando o banco pedia pra repetir a operação (falha momentânea de conexão), a reserva da tentativa anterior podia ser gravada de novo junto com a nova, baixando o estoque duas vezes pelo mesmo pedido

## [v1.24.0] — 2026-07-30

### Corrigido — Nota fiscal
- **Nota com desconto era sempre recusada pela SEFAZ**: o desconto ia só no total da nota, sem aparecer em cada produto — e a Receita exige que os dois batam. Venda sem desconto passava, o que escondeu o problema. Agora o desconto é rateado entre os itens, com o acerto dos centavos que sobram da divisão
- **Venda vazia gastava um número fiscal**: fechar uma comanda sem produto com "emitir nota" marcado mandava uma nota em branco pra SEFAZ, que recusava — e o número da sequência já tinha sido consumido, virando um furo que depois precisa ser inutilizado. Agora o sistema avisa antes ("a nota fiscal precisa de pelo menos um produto") e não gasta número
- **Pix era sempre declarado como "dinâmico"**, mesmo quando o cliente pagava na chave fixa. Agora o sistema identifica sozinho: se a cobrança foi gerada pelo sistema, declara dinâmico; se foi na chave, declara estático
- **"Troco NaN" no cupom**: quem consultava a nota pelo QR Code via essa palavra no lugar do troco. Faltava informar o valor (sempre zero, já que o sistema cobra o valor exato)
- **Notas de fornecedor nunca eram baixadas**: a busca automática de NF-e emitidas contra o CNPJ da loja (que vira conta a pagar sozinha) falhava em toda tentativa, a cada 2 horas, por uma configuração faltando

### Corrigido — Dinheiro e números
- **Cotação do dólar estava travada em R$ 5,80 há semanas** — 13% acima da real. Toda carta do TCGPlayer saía mais cara do que devia. O sistema agora usa o **Banco Central** como fonte principal (oficial e sem limite de consulta) e avisa na tela, em amarelo, quando a cotação não é a atual — antes ele mostrava um valor antigo com cara de novo
- **Gráfico de crediário no Financeiro nunca funcionou**: mostrava "Sem dados" mesmo com dezenas de pagamentos listados logo abaixo. Agora mostra os recebimentos dia a dia, e ganhou **"Concedido × Recebido no período"** com a lista de crediários abertos — antes só existia o saldo acumulado, que ignorava o filtro de datas
- **Financeiro inflava o valor ao filtrar por forma de pagamento**: numa venda dividida (R$ 80 no cartão + R$ 20 em Pix), filtrar por Pix mostrava os R$ 100 inteiros, e por cartão mostrava os mesmos R$ 100 de novo. Agora cada filtro mostra só a parte paga naquela forma, e as partes somam o total exato

### Adicionado
- **Inscrição de campeonato direto pelo site**: quem clica em "Inscrever" na página inicial agora se inscreve de verdade, com a vaga reservada no nome dele, e o sistema pergunta **"deseja já pagar a taxa agora?"** oferecendo Pix na hora. Antes só dava pra mandar mensagem no WhatsApp e pagar na chegada. É preciso ter conta — é o que permite reservar a vaga e guardar o histórico de torneios do cliente
- A vaga é garantida **antes** do pagamento: se o campeonato lotar, ninguém paga por um lugar que não existe

### Corrigido — Telas
- **Top Clientes ficava ilegível no Painel Geral**: em tela de notebook menor os nomes sumiam ("Pa...", "Ar...") e o texto quebrava no meio da palavra por cima do valor. Agora as informações ficam empilhadas e legíveis em qualquer largura
- Os botões de forma de pagamento do filtro deixaram de ficar escondidos quando não cabiam na largura

## [v1.23.0] — 2026-07-30

### Corrigido
- **Financeiro inflava o valor ao filtrar por forma de pagamento**: numa venda dividida (ex: R$ 80 no cartão + R$ 20 em Pix), filtrar por Pix mostrava os R$ 100 inteiros — e filtrar por cartão mostrava os mesmos R$ 100 de novo. Agora cada filtro mostra só a parte paga naquela forma, e as partes somam exatamente o total do período. O custo e a margem acompanham a mesma proporção. O card "Formas de pagamento" já fazia a conta certa, então a tela se contradizia sozinha
- **Nota fiscal só saía quando o pagamento era em dinheiro**: cartão, Pix, crediário, pontos e cashback eram recusados pela SEFAZ na hora de emitir. Faltava um dado obrigatório que a Receita exige pra pagamento eletrônico, e uma descrição obrigatória no caso de crediário/pontos/cashback. Agora todas as formas emitem normalmente — vale testar em Homologação antes de confiar no dia a dia
- **Campo NCM travava ao colar com pontos**: colar "1905.90.90" deixava o campo em "190590" e não passava. Agora aceita colado com ou sem pontuação, e avisa quantos dígitos faltam enquanto você digita
- **Certificado de outra empresa era aceito**: dava pra subir um certificado digital que não é da loja e emitir nota em nome de terceiro. Agora o sistema confere o CNPJ do certificado contra o da loja
- **Pagamento de crediário aceitava qualquer forma de pagamento**: dava pra gravar uma forma que não existe, e ela virava uma linha fantasma no relatório financeiro
- Produto não pode mais ser salvo com preço, custo ou estoque negativo — isso chegava a gravar venda com valor negativo no caixa

### Adicionado
- **Análises de Clientes** (Clientes → Análises): ranking dos clientes que mais gastaram, com filtro de **período** (hoje, 7 dias, este mês, tudo ou datas escolhidas), **quantidade** (Top 10/20/50/todos), **forma de pagamento** e opção de **incluir as vendas do caixa**. Antes o Top Clientes somava tudo desde sempre e não dava pra recortar nada
- O mesmo filtro aparece no painel Top Clientes do Painel Geral
- **Campo CEST no cadastro de produto**, ao lado do NCM — obrigatório em produtos com substituição tributária, que sem ele têm a nota recusada

### Mudado
- **Tela de Clientes deixou de quebrar em tablet**: o painel de pontos/cashback da direita agora só aparece depois de escolher um cliente. Antes ele ficava sempre lá ocupando espaço, e em telas médias espremia a lista e desalinhava as linhas

## [v1.22.0] — 2026-07-27

### Mudado
- **O site agora é `santuarionerd.com.br`**: o endereço antigo (`santuarionerd.tech`) continua funcionando e leva pro novo automaticamente — link antigo salvo, QR Code impresso, link no Instagram, tudo continua abrindo normal e cai na página certa. Vale trocar o endereço nos materiais aos poucos, sem pressa
- **Você vai precisar entrar de novo**: por causa da troca de endereço, quem estava logado (admin e clientes) cai na tela de login uma única vez. Depois disso volta ao normal
- E-mails do sistema (recuperação de senha, aviso de fila de espera) agora levam pro endereço novo

## [v1.21.0] — 2026-07-08

### Adicionado
- **Cupom fiscal abre sozinho ao autorizar**: ao fechar uma comanda/venda com "Emitir cupom fiscal" marcado, o sistema agora espera a SEFAZ responder e já abre o cupom numa aba nova se autorizar (ou avisa o motivo se não). Antes a emissão era só em segundo plano, sem retorno nenhum na hora
- **Cliente vê a própria nota fiscal**: nova aba "Notas Fiscais" em Meu Perfil — o cliente acessa e imprime o cupom de qualquer nota autorizada, sem precisar pedir pro admin

### Corrigido
- Botão "Emitir nota fiscal" manual (histórico de comandas/vendas) também abre o cupom sozinho quando autoriza, igual o fluxo automático

## [v1.20.1] — 2026-07-08

### Adicionado
- **Personalizar Site** ganhou mais 2 cores (fundo da página e fundo dos cards, modo claro) e um **preview ao vivo** — o formulário mostra uma miniatura da navbar/hero/card atualizando em tempo real conforme você digita ou muda uma cor, antes de salvar

## [v1.20.0] — 2026-07-08

### Adicionado
- **Personalização do site** (Admin → Personalizar Site): nome da loja, WhatsApp, e-mail, endereço, nome de quem atende, textos da navbar/botões, títulos das seções (Torneios/Produtos/Pontos) e cores (primária, destaque, navbar) agora são editáveis pelo admin num formulário — sem precisar mexer em código. Enquanto ninguém edita nada, o site continua exatamente igual a antes (todo campo tem o valor atual como padrão). Primeiro passo pra virar base de um sistema white-label/multi-tenant

## [v1.19.0] — 2026-07-08

### Adicionado
- **Emissão de NFC-e deixa de ser automática**: ao fechar uma comanda ou registrar uma venda avulsa, agora aparece a opção "Emitir cupom fiscal (NFC-e) agora" — o admin decide na hora, em vez do sistema emitir sozinho sem avisar. Em Admin → Fiscal dá pra marcar quais formas de pagamento (Pix, Dinheiro, Cartão...) vêm com a opção pré-marcada por padrão; sem configurar nada, nenhuma emite sozinha
- Vendas fechadas sem nota fiscal podem receber a nota depois — botão "Emitir nota fiscal" no histórico de comandas e no detalhe de vendas avulsas
- Landing page: link "Mercado de Cartas" na navbar (desktop e mobile); "Produtos" e "Ver Produtos" agora navegam de verdade pra `/produtos` em vez de só rolar a página

### Melhorado
- E-mails de mensageria (anúncios) ganharam versão em texto puro além do HTML, cabeçalho `List-Unsubscribe` e link de descadastro no rodapé — reduz o risco de cair em spam
- Mensagem de "Pendente" no fiscal (Admin → Fiscal) agora mostra o motivo real (ex: certificado não configurado, dados da empresa incompletos) em vez de ficar sem explicação
- Push notification do navegador usa o logo do Santuário Nerd em vez do logo antigo do Maikon

### Corrigido
- Pontos aplicados numa comanda aberta não refletiam no total mostrado pro cliente nem no card do admin — o abatimento sempre foi real no fechamento, mas a tela deixava parecer que "usar pontos" não tinha feito nada

## [v1.18.0] — 2026-07-08

### Mudado
- **Mercado de Cartas deixou de ser C2C**: agora é uma vitrine só do Maikon — só o Admin anuncia carta (`/admin/marketplace`, botão "Novo anúncio"), clientes só navegam e marcam interesse, como sempre funcionou. O botão "Anunciar carta" que existia pro cliente (bloqueado desde antes, mostrava só um aviso) foi removido, junto com a aba "Meus anúncios" — ninguém além do Maikon nunca vai ter anúncio próprio agora
- Interessados numa carta agora aparecem direto na tabela do admin (clique no número de interesses) — WhatsApp de quem autorizou contato, mensagem e data, sem precisar ir na página pública

## [v1.17.0] — 2026-07-08

### Melhorado
- **Mensageria redesenhada**: passos numerados (Mensagem → Canal → Destinatários), preview ao vivo mostrando exatamente como a notificação vai aparecer pro cliente conforme você digita, e resumo do envio (canal, destinatários, se está pronto pra mandar) sempre visível ao lado
- **Pré-vendas redesenhada**: faixa com Aguardando/Em fila/Pré-vendas no topo, abas com contador de badge, lista de espera virou grade de cards de produto (com contagem já carregada, sem precisar abrir um por um), e reservas ganharam barra de progresso visual até o vencimento das 48h (fica vermelha quando está acabando o prazo)

## [v1.16.1] — 2026-07-08

### Corrigido
- **Preço promocional não aparecia pro admin ao adicionar item numa comanda**: o valor cobrado já saía certo (o backend nunca confiou no preço vindo do frontend), mas a lista de produtos mostrava o preço cheio — agora mostra o preço promocional com o de tabela riscado, igual já acontecia no PDV
- Mesmo ajuste no seletor de produto ao editar uma comanda já fechada

## [v1.16.0] — 2026-07-08

### Adicionado
- **Desconto em R$ (valor fixo)** no PDV e na Comanda, além do percentual já existente — igual ao Bling: toggle % ↔ R$ na venda avulsa (Etapa 3), e campo livre de desconto em R$ ao fechar qualquer comanda
- Comanda ganhou campo próprio de desconto administrativo, separado dos pontos de fidelidade do cliente — antes só dava pra dar desconto editando o histórico depois de fechada; agora dá direto no fechamento

### Corrigido
- **Relatório "Formas de Pagamento" (Financeiro e Histórico) subestimava a receita** de qualquer comanda em que o cliente usou pontos de fidelidade — o valor já vinha líquido de pontos ao fechar a comanda, mas o relatório descontava os pontos de novo por cima

## [v1.15.0] — 2026-07-07

### Adicionado
- **Pix na inscrição de campeonato**: pagamento da taxa é opcional (a vaga já vale na hora da inscrição) — o jogador vê um botão "Pagar inscrição via Pix" em Meus Campeonatos, com QR Code/copia-e-cola e confirmação automática; o Maikon acompanha quem pagou (Pix ou balcão) direto na lista de participantes, com botão para marcar pagamento manual de quem pagar no balcão
- **Aviso automático da fila de espera**: quando o estoque de um produto em pré-venda sai de zero, todo mundo na fila recebe notificação in-app + push + e-mail na hora, uma única vez por pessoa
- **Botão "Avisar fila"** em Admin → Pré-vendas → Lista de Espera: leva direto pra Mensageria com os clientes daquela fila já selecionados e o título/imagem do produto preenchidos
- **Minhas Filas** no perfil do cliente: nova aba mostra posição em cada lista de espera e reservas ativas com prazo de expiração, com botão pra sair/cancelar — sem precisar caçar o produto de novo

### Corrigido
- Extrato do Inter importava toda transação como despesa (inclusive Pix recebido) e pulava a maioria por falta de identificador único — a integração usava nomes de campo que não existem na API real do banco. Corrigido usando o schema real e o endpoint `/extrato/completo`, que traz o identificador necessário para não duplicar/perder lançamentos

## [v1.14.0] — 2026-07-07

### Adicionado
- **Pix na comanda do cliente**: quando o admin gera a cobrança, ela aparece **na hora** na tela do cliente (tempo real via SignalR) — QR Code, código copia-e-cola e botão **"Pagar no app do banco"** que abre a lista de apps do celular com o código já copiado; quem estiver com o site fechado recebe push no navegador
- **Confirmação automática do pagamento**: a tela do cliente verifica no Inter a cada 6 segundos — quando o Pix cai, a comanda fecha sozinha e os dois lados são avisados; o modal do admin também verifica sozinho a cada 5 segundos (sem precisar clicar em "Verificar pagamento")
- Se o cliente recarregar a página, a cobrança ativa reaparece (novo endpoint `GET /api/comanda/my/pix`)

### Corrigido
- "Verificar pagamento" mostrava erro genérico — agora exibe a mensagem real retornada pelo Inter quando a consulta falha

## [v1.13.1] — 2026-07-07

### Corrigido
- **Upload do certificado A1 rejeitado em produção ("senha incorreta")**: certificados ICP-Brasil mais antigos usam criptografia legada (RC2/3DES) que o OpenSSL do Linux desativa por padrão desde a versão 3 — e o .NET não confiava de forma consistente na configuração de ambiente pra reativar isso. A leitura do `.pfx` agora usa BouncyCastle (biblioteca própria, sem depender do OpenSSL do sistema) sempre que o carregamento nativo falhar — mesmo caminho usado no upload, na emissão de NFC-e e na Manifestação do Destinatário
- Testado com um certificado sintético gerado com o mesmo algoritmo legado antes de ir pra produção, incluindo assinatura digital real (o mesmo passo que a emissão de NFC-e faz) e rejeição correta de senha errada

## [v1.13.0] — 2026-07-06

### Adicionado
- **Manifestação do Destinatário ("DDA" fiscal)**: o sistema agora descobre automaticamente as NF-e que fornecedores emitem contra o CNPJ da loja, direto na SEFAZ (DFe Distribuição) — sem digitar nada
- **Contas a pagar automáticas**: as duplicatas (`<dup>`) do XML da NF-e viram lançamentos "a pagar" no financeiro, com vencimento, valor, parcela e fornecedor preenchidos; compras à vista geram lançamento único pelo total da nota
- **Aba "Notas Recebidas"** em `/admin/contas-receber`: lista as NF-e destinadas com status do pipeline (aguardando ciência → aguardando XML → contas geradas), botão "Sincronizar agora" e status da consulta automática
- **Ciência da Operação automática**: evento oficial 210210 registrado em lote na SEFAZ para liberar o download do XML completo
- **Cancelamento propagado**: se o fornecedor cancelar a NF-e, as contas a pagar pendentes dela são canceladas automaticamente
- Card SEFAZ em `/admin/integracoes` com botão de sincronização manual e orientação de configuração

### Corrigido
- **Pix sem QR Code e sem copia-e-cola**: o copia-e-cola agora é lido direto da resposta de criação da cobrança (`pixCopiaECola`), e o QR Code é gerado localmente (QRCoder) a partir dele — o modal nunca mais abre vazio quando o endpoint de QR do Inter falha
- **Upload do certificado A1 falhando no servidor**: habilitado o provider legacy do OpenSSL 3 no container — certificados ICP-Brasil empacotados com algoritmos antigos (RC2/3DES) eram rejeitados como "senha incorreta" no Linux; o erro do upload agora também mostra o detalhe técnico real

### Técnico
- Job em background a cada 2h (`SefazDistBackgroundService`), com tratamento de consumo indevido (cStat 656) e NSU incremental persistido por lote
- Novas: tabela `notas_destinadas` e coluna `dist_ultimo_nsu` em `fiscal_config` (criadas no startup)
- Reuso do certificado A1 criptografado e do `Zeus.Net.NFe.NFCe` já existentes — nenhuma dependência nova
- Deduplicação de contas por chave de acesso + número da duplicata (índice único existente em `external_transactions`)

---

## [v1.12.0] — 2026-07-06

### Adicionado
- **Mensageria** (`/admin/mensageria`): envio de notificações in-app, push no navegador e e-mail para clientes — por segmento (todos, com e-mail, crediário aberto, lista de espera, top 20 pontos) ou seleção manual
- **Imagem na notificação**: campo opcional de banner na mensageria — a imagem aparece na notificação in-app (sino), no push do navegador e no corpo do e-mail, com pré-visualização no painel antes do envio
- **Push no navegador**: notificações web push via VAPID — cliente recebe aviso mesmo com o site fechado; comando `gen-vapid` para gerar chaves no VPS
- **NFC-e** (`/admin/fiscal`): módulo completo de emissão de cupom fiscal eletrônico via DFe.NET, com certificado A1 e Natureza de Operação configuráveis
- **Pix Inter**: cobrança Pix com QR Code para Crediário e Comanda via API do Banco Inter (OAuth2 + mTLS, upload de certificado pelo painel de integrações)
- **Grade de variantes**: produtos com tamanho/cor funcionais no PDV e na comanda; estoque total reflete a soma das variantes
- **Fila de espera de pré-venda**: cliente entra na fila pela página pública do produto; admin vê a fila no drawer do produto, na aba Lista de Espera e em card no painel Análises, com botão "Vender"
- **Campeonatos — cadastro público**: criação de conta direto na inscrição do campeonato + vínculo de deck
- **Reset de senha funcional**: fluxo em duas fases em `/reset-password`

### Corrigido
- E-mail de anúncio agora escapa HTML do conteúdo e reaproveita a conexão SMTP no lote — falha em um destinatário não interrompe os demais; contador de enviados reflete apenas sucessos
- Hover quase invisível no tema claro em todo o site; banner promocional apagado pelo overlay escuro; título do modal de aviso ilegível no tema claro
- NCM genérico "inventado" removido do fiscal — nunca emite com valor chutado
- Referência circular ProductVariant→Product que sumia com todos os produtos do estoque
- Build de produção quebrado por `useSearchParams` sem Suspense

### Técnico
- Coluna `image_url` na tabela `notifications` (criada automaticamente no startup)
- `SendAnuncioAsync` retorna a contagem de e-mails enviados com sucesso; aceita imagem e link opcionais (botão "Ver no site")
- Service worker (`sw.js`) exibe o campo `image` do payload push

---

## [v1.11.0] — 2026-06-29

### Adicionado
- **Pré-vendas / Reservas** (`/admin/reservas`): clientes reservam produtos pelo app — estoque é bloqueado imediatamente mas a venda só entra no financeiro quando o admin "homologa"; na homologação, admin escolhe registrar como venda avulsa (frente de caixa) ou lançar em comanda aberta; opção de estender prazo +48h
- **Contas a Pagar / Receber** (`/admin/contas-receber`): módulo financeiro completo com lançamento manual, cards de resumo (a pagar, atrasado, vencendo em 7 dias, a receber, pago no mês) e marcação automática de contas vencidas como "atrasado"
- **Importação OFX**: upload de extrato bancário `.ofx` (qualquer banco que exporte nesse formato) — transações importadas automaticamente com deduplicação por FITID, já classificadas como pago
- **Integrações financeiras** (`/admin/integracoes`): painel com 4 fontes de dados — Inter PJ (OAuth2 + mTLS), Mercado Pago, SEFAZ NF-e (extrato de NF-e por CNPJ, requer certificado A1) e OFX manual; cada integração mostra status de conexão, última sincronização e botão de configurar
- **Criptografia AES-256-GCM**: Client Secrets e tokens OAuth armazenados no banco com criptografia simétrica de 256 bits; chave configurada via variável de ambiente `Encryption__Key` — nunca exposta em respostas de API
- **Marketplace bloqueado**: botão "Anunciar carta" exibe toast informativo enquanto o módulo de anúncios está em desenvolvimento; navegação, interesse e listagens existentes continuam funcionando normalmente

### Técnico
- Novas tabelas: `external_transactions` (transações de qualquer fonte) e `integration_configs` (credenciais criptografadas por integração)
- `EncryptionService`: AES-256-GCM, formato `Base64(nonce[12] + tag[16] + ciphertext)`; modo dev usa chave-zero; prod exige `Encryption__Key` configurado
- `OfxParserService`: parser regex para SGML/XML OFX; extrai FITID, TRNTYPE, DTPOSTED, TRNAMT, NAME/MEMO
- `SefazNfeService`: placeholder pronto para receber certificado A1 via `Sefaz:CertificatePath`
- `ContasReceberController`: CRUD completo + importação OFX + gestão de integrações (salva credenciais criptografadas, nunca as retorna)
- CNPJ Santuário Nerd `42.989.093/0001-79` pré-configurado para integração SEFAZ

---

## [v1.10.1] — 2026-06-28

### Adicionado
- **TCGdex — busca Pokémon em português**: integração com `api.tcgdex.net` (gratuita, sem autenticação) como fonte paralela à pokemontcg.io; agora é possível buscar pelo nome em português diretamente — "Transmissor da Equipe Rocket", "Mewtwo ex da Equipe Rocket", "Pikachu V" — sem precisar saber o nome em inglês
- **Fan-out paralelo**: as duas APIs rodam simultaneamente (`Task.WhenAll`); resultados são mesclados — pokemontcg.io fornece preços completos, TCGdex complementa com nomes PT e imagens WebP de alta qualidade
- **Imagens WebP via TCGdex**: cartas sem imagem no pokemontcg.io recebem automaticamente a imagem do TCGdex (`/low.webp` para thumbnail, `/high.webp` para modal)
- **Cartas exclusivas PT**: edições brasileiras não indexadas no pokemontcg.io aparecem nos resultados via TCGdex

### Corrigido
- **Resultados duplicados**: deduplicação por ID antes de retornar ao frontend elimina cartas repetidas
- **Aviso de idioma na UI**: placeholder e mensagem abaixo da busca indicam que Pokémon aceita nomes em inglês ou português; exemplos práticos (Rocket's Transmission, Dark Mewtwo, Rocket's Mewtwo ex) exibidos no admin
- **Fallback de imagem no deck builder**: `onError` nas tags `<img>` exibe o nome da carta se a URL falhar ao carregar

---

## [v1.10.0] — 2026-06-28

### Adicionado
- **Pokémon TCG — chave de API oficial**: integração com pokemontcg.io autenticada, eliminando limite de requisições da versão pública
- **Busca avançada Pokémon — 14 novos filtros**: além de nome, raridade e set, agora é possível filtrar por Subtipo (Basic/Stage 1/Stage 2/EX/GX/V/VMAX/VSTAR/Supporter/Item/Tool…), Tipo de Energia (Fire/Water/Grass/Lightning/Psychic/Fighting/Darkness/Metal/Dragon/Colorless/Fairy), Regulation Mark (A–H), Legalidade (Standard/Expanded/Unlimited), Série do set (Scarlet & Violet/Sword & Shield/Sun & Moon…), Código PTCGO, Artista, Evolui de, Número do Pokédex, HP mínimo/máximo e intervalo de data de lançamento do set
- **Busca somente por filtros**: agora é possível pesquisar sem digitar nome — apenas com filtros ativos (ex: "todas as cartas com Regulation Mark G legais em Standard")
- **Preços CardMarket (EUR) completos**: cada carta Pokémon agora exibe preços CardMarket — Média de venda, Tendência, Mais baixo, Ex+ baixo, Reverse Holo (venda/baixo/tendência) e médias de 1, 7 e 30 dias
- **Variantes TCGPlayer expandidas**: além de Normal, Holofoil, Reverse e 1ª Edição, agora exibe também Unlimited Normal e Unlimited Holo (relevantes para Base Set e coleções antigas)
- **Novos campos por carta**: SetSeries (série do set), SetPtcgoCode (código PTCGO), SetReleaseDate (data de lançamento), EvolvesFrom, EvolvesTo, NationalPokedexNumbers, Legalities (mapa de legalidade por formato)
- **Filtros Pokémon no Deck Builder**: os mesmos filtros avançados (subtipo, energia, reg mark, legalidade, série, PTCGO code, artista, evolui de) estão disponíveis na busca de cartas ao montar um deck
- **CardMarket no Deck Builder**: a prévia da carta no deck builder também exibe preços CardMarket (EUR: Tendência, Média, Mais baixo, Média 30d)

### Técnico
- Lucene query builder no backend constrói a query correta para cada filtro selecionado na UI
- `TcgController`: 14 novos `[FromQuery]` params + validação `hasFilters` (permite busca sem nome)
- `TcgApiClient`: `SearchPokemonCardsAsync` reescrito com builder completo; `MapPokemonCard` mapeia CardMarket + todos os novos campos; `ExtractAllPokemonPrices` inclui variantes Unlimited
- `ComandaDtos`: nova classe `CardMarketPricesApi` (13 campos); `TcgCardAllPrices` + `UnlimitedNormal`/`UnlimitedHolofoil`; `TcgApiCardResponse` + 8 novos campos
- `CardCache` (MongoDB): espelha todos os novos campos; nova classe `CardMarketCache`
- `lib/api.ts`: tipos `CardMarketPrices`, `TcgSearchParams`; `tcgApi.searchAdvanced(params)`

---

## [v1.9.0] — 2026-06-27

### Adicionado
- **Cartas TCG — filtros por jogo**: filtros dinâmicos de raridade, tipo e set aparecem automaticamente ao selecionar o jogo (Pokémon, MTG, Yu-Gi-Oh!, LoL Riftbound), seguindo os padrões de sites como Limitlesstcg, Scryfall e YGOProDeck
- **Cartas TCG — modal de detalhe da carta**: ao clicar numa carta, abre painel completo com imagem ampliada, todos os campos (HP, ATK/DEF, custo de mana, tipos, subtypes, artista), texto de regras/oracle/efeito, fraquezas e resistências (Pokémon), variantes de preço (Normal, Holo, Reverse, 1ª Ed.) em USD e R$ convertido
- **Cartas TCG — taxa BRL em tempo real**: widget no cabeçalho da tela de cartas mostra a cotação USD → R$ atualizada via AwesomeAPI, com indicador "Xmin atrás" e botão de refresh; cotação aplica-se ao preço de todas as cartas
- **Deck Builder — filtros por jogo**: mesmos filtros do admin (raridade, tipo, set) disponíveis na busca de cartas ao montar um deck
- **Deck Builder — prévia completa**: ao clicar numa carta, exibe texto de regras (MTG), efeito (YGO) e flavor text; fraquezas, resistências e custo de recuo (Pokémon); grid de variantes de preço (Normal / Holo / Reverse / 1ª Ed.) com USD + R$; HP dinâmico por jogo ("HP 120" para Pokémon, "3/4" para MTG, "ATK 2400 / DEF 2000" para YGO)
- **Deck Builder — busca por câmera**: botão de câmera abre galeria/câmera do celular (`<input capture="environment">`); imagem é processada e o texto detectado preenche o campo de busca automaticamente; funciona em 100% dos dispositivos iOS e Android
- **Deck Builder — importar lista**: importa listas no formato PTCG Live / Limitlesstcg (ex: `4 Pikachu PAL 058`); cartas são adicionadas ao deck sem desaparecer; suporte a múltiplas cartas em lote
- **LoL Riftbound — Riftcodex API**: integração com `api.riftcodex.com` (gratuita, sem autenticação) com 944 cartas; busca por nome, filtro por set; campos: nome, tipo, raridade, set, número, domínio, energy/might/power, texto da carta, imagem, keywords/tags
- **LoL Riftbound — Scrydex API**: fonte paralela opcional (`api.scrydex.com`) com preços de mercado (TCGPlayer); ativada configurando `TcgSettings:ScrydexApiKey` e `TcgSettings:ScrydexTeamId`; ignorada silenciosamente se não configurada
- **Multi-source com deduplicação**: busca de LoL Riftbound dispara Riftcodex + Scrydex em paralelo via `Task.WhenAll`; resultados fundidos por chave `nome::setCode::número`; campos faltantes preenchidos da fonte secundária; preços vêm do Scrydex quando disponível
- **Configuração TcgSettings**: nova seção no `appsettings.json` documentando as APIs de cada jogo com instruções de onde obter cada chave; Scryfall, YGOProDeck e Riftcodex não exigem configuração; Pokémon e Scrydex têm chaves opcionais

### Corrigido
- **Busca por código de set (PAL 058)**: busca retornava vazio porque o detector de query estruturada verificava `name.StartsWith("set:")` mas a query gerada era `set.ptcgoCode:PAL number:058`; corrigido para `name.Contains(':')`
- **Cache retornando resultados parciais**: MongoDB cache-aside devolvia apenas cartas já vistas antes; substituído por `IMemoryCache` com TTL de 5 minutos por chave de query — sempre consulta a API e cache o resultado completo
- **Filtros de jogo incorretos na tela de cartas admin**: lista de jogos usava `Magic: The Gathering` e `One Piece TCG` em vez de `Pokemon`, `MTG`, `Yu-Gi-Oh!`, `LoL Riftbound`
- **Importação de deck perdendo cartas**: `importDeckList()` chamava `onAdd({ tcgCardId: '__import__' })` que o componente pai ignorava; corrigido com callback `onImport(DeckCard[])` — pai faz merge das cartas importadas com o deck existente
- **Câmera de busca não funcionando**: `getUserMedia` + `TextDetector` não estão disponíveis na maioria dos navegadores móveis; substituído por `<input type="file" accept="image/*" capture="environment">`
- **MTG — informações trocadas**: `Hp` agora exibe `power/toughness`, `RegulationMark` recebe `manaCost`, `FlavorText` recebe `oracle_text`, `Types` recebe as cores da carta
- **YGO — ATK/DEF e efeito não apareciam**: `Hp` mapeado para `ATK xxx / DEF xxx` (ou nível/rank quando monster), `FlavorText` recebe `desc` (efeito da carta)
- **LoL Riftbound — schema errado no Riftcodex**: mapper usava campos planos (`rarity`, `set_code`, `image_url`) mas o schema real é aninhado (`classification.rarity`, `set.set_id`, `media.image_url`); reescrito completamente
- **LoL Riftbound — params errados na busca Riftcodex**: query usava `?q=` e `per_page=` em vez dos corretos `?query=` e `size=`

---

## [v1.8.1] — 2026-06-26

### Adicionado
- **Financeiro — Curva ABC**: classificação automática de produtos em A (80% da receita), B (95%) e C (restante); gráfico de Pareto com barras coloridas por classe, linha de acumulado e linhas de referência 80%/95%; tabela com colunas ordenáveis (Qtd, Preço Médio, Margem, Receita) e filtros por classe e categoria; painel explicativo do conceito ABC integrado
- **Financeiro — gráfico animado**: entrada suave com animação spring nas barras do gráfico de receita por dia (scaleY + easing cubic-bezier)
- **Financeiro — mini filtro de período**: contador de dias disponível diretamente abaixo do gráfico, sem precisar subir até o topo da página
- **Financeiro — pop-up de detalhe do dia**: ao clicar em uma barra do gráfico, abre modal com donut por forma de pagamento, receita, custo e margem daquele dia
- **Estoque — cards de resumo**: painel com total de peças em estoque, valor imobilizado, contagem de itens com estoque baixo e zerado
- **Estoque — filtros por situação**: chips Todos / Normal / Estoque Baixo / Zerado com contagens em tempo real; ao selecionar Baixo ou Zerado, lista é reordenada automaticamente do pior para o melhor
- **Estoque — drawer de detalhe do produto**: painel deslizante ao clicar em qualquer linha — exibe imagem, nome, categoria, código de barras, preço, custo, barra de margem, barra de estoque vs mínimo, valor imobilizado e botões rápidos de ajuste de quantidade
- **Frente de Caixa — layout 2 colunas no step de produtos**: catálogo de produtos à esquerda + painel de carrinho sempre visível à direita; feedback imediato ao adicionar itens sem precisar avançar para a próxima etapa
- **Assistente IA — navegação por voz**: comando de texto ou voz redireciona o usuário para qualquer página do sistema ("abre o estoque", "vai pro financeiro", "nova venda")
- **Assistente IA — entrada por voz**: botão de microfone no widget; fala é transcrita automaticamente e enviada ao Gemini (Chrome/Edge)
- **Assistente IA — resposta em voz**: toggle de alto-falante no cabeçalho do widget para leitura em voz alta das respostas em PT-BR
- **Assistente IA — contexto atualizado**: Gemini agora conhece todas as categorias da loja (Beyblade, Action Figures, Canecas, etc.), formas de pagamento dos últimos 30 dias, total de peças e produtos zerados em estoque

### Corrigido
- **Financeiro — tooltip saindo do viewBox em barras altas**: tooltip ficava cortado pelo viewBox em produtos com alta receita; corrigido com clamping de posição vertical
- **Financeiro — tooltip do Pareto saindo da área**: mesmo problema no gráfico de Pareto; corrigido com clamping horizontal e vertical
- **Financeiro — pizza 100% invisível**: quando apenas uma forma de pagamento cobria 100% das vendas, o arco SVG degenerava (ponto de início = fim) e ficava transparente; corrigido renderizando como dois semicírculos de 180°
- **Frente de Caixa — backdrop não cobrindo a sidebar**: modal com `position: fixed` ficava preso dentro do `<main overflow-auto>`, não cobrindo o menu lateral; corrigido com `createPortal` renderizando no `document.body`
- **Estoque — drawer sem imagem**: drawer usava apenas o campo `imageUrls` (array), mas a maioria dos produtos salva a imagem em `imageUrl` (string); corrigido com fallback para o campo singular
- **Sidebar — logo incorreta**: avatar do Maikon substituído pela logo oficial em todas as ocorrências da sidebar (desktop e mobile)

---

## [v1.8.0] — 2026-06-25

### Adicionado
- **Atalhos de teclado globais**: navegação por tecla única sem precisar clicar no menu — D (Dashboard), P (PDV), E (Estoque), U (Clientes), C (Crediário), F (Financeiro), R (Relatórios), A (Campeonatos); Esc fecha qualquer modal aberto
- **Painel de ajuda de atalhos**: tecla `?` abre/fecha overlay com todos os atalhos disponíveis e suas descrições
- **Badges de atalho no Sidebar**: ao passar o mouse sobre itens do menu no desktop, a tecla correspondente aparece discretamente ao lado do nome
- **Financeiro — gráfico de pizza para 1 dia**: quando o filtro cobre um único dia, o gráfico de barras é substituído automaticamente por um gráfico de pizza por forma de pagamento com hover interativo
- **Manual atualizado**: nova seção 11 "Atalhos de Teclado" com descrição de todos os atalhos disponíveis

### Corrigido
- **Financeiro — labels sobrepostas no gráfico de barras**: labels do eixo X eram exibidas em toda barra com receita — em meses completos causava ~25 labels sobrepostas; corrigido para exibir apenas labels espaçadas dinamicamente de acordo com a largura disponível
- **Login — mensagem de erro para rate limit**: erro 429 (muitas tentativas) mostrava "E-mail ou senha inválidos" — agora exibe "Muitas tentativas. Aguarde 1 minuto e tente novamente."
- **Rate limiting — IP real com Cloudflare**: o rate limiter usava o IP do nó Cloudflare como chave, fazendo todos os usuários compartilharem o limite de 5 logins/minuto; corrigido para usar o header `CF-Connecting-IP` (IP real do cliente)
- **Acesso de operadores ao Financeiro**: `AnalyticsController` usava `[Authorize(Roles="Admin")]` bloqueando operadores mesmo com permissão `financeiro`; corrigido para `[Authorize(Policy="AdminOnly")]`; `RotasPrefixo[Financeiro]` também atualizado com `/api/analytics/financeiro`
- **Race condition em saldo de pontos/cashback**: deduções simultâneas podiam resultar em saldo negativo; substituído por `ExecuteUpdateAsync` com UPDATE atômico no banco
- **MongoDB — busca TCG com regex de usuário**: input do usuário era passado diretamente a `BsonRegularExpression` permitindo ReDoS; corrigido com `Regex.Escape()`
- **Venda avulsa — erros silenciosos**: `catch(() => {})` na carga inicial e no refresh de vendas do dia substituído por `toast.error()` com mensagem descritiva

---

## [v1.7.5] — 2026-06-23

### Adicionado
- **Edição de comanda fechada (Admin)**: admin pode editar qualquer comanda já fechada — forma de pagamento, segundo pagamento, desconto, cliente e itens (adicionar, remover, alterar quantidade/preço); estoque é ajustado atomicamente e total recalculado automaticamente
- **Badge PROMOÇÃO com cor inline**: letras brancas garantidas via `style` inline, evitando inconsistência de carregamento do Tailwind CSS
- **Logo da mesa em moldura redonda**: tela de login agora exibe o mascote em container circular

### Corrigido
- **Modal de confirmação na comanda do cliente**: z-index elevado para `z-[60]` — não ficava mais escondido atrás do bottom sheet (`z-50`)
- **Mascote removido do cabeçalho da mesa**: o círculo com logo foi removido do header da tela de mesa; mascote mantido flutuando abaixo do cabeçalho
- **Segurança (5 vulnerabilidades)**: refresh token com hash SHA-256, COOKIE_SECURE sem bypass de env var, ProductService com update campo-a-campo e ajuste atômico de estoque com guard de negatividade

---

## [v1.7.4] — 2026-06-22

### Adicionado
- **Histórico de comandas — filtros**: nova barra de filtros na tab Histórico do dashboard com busca por nome do cliente e intervalo de horário (de HH:mm até HH:mm); breakdown por forma de pagamento e total refletem os resultados filtrados
- **Manual atualizado**: seções Dashboard (filtros do histórico), Crediário (recebimentos no financeiro + PDF) e Relatórios (relatório de crediário PDF) atualizadas na página Sobre

---

## [v1.7.3] — 2026-06-22

### Adicionado
- **Financeiro — Crediários recebidos no período**: o card "Crediários abertos" agora exibe no sub-texto o total recebido no período filtrado; ao clicar abre modal com lista detalhada de cada pagamento (cliente, valor, forma de pagamento, horário e observação)
- **Relatório PDF de Crediário**: novo PDF disponível na tela de Relatórios — mostra situação atual de todos os devedores (saldo, dias em atraso, vencimento, WhatsApp) e tabela completa de pagamentos recebidos no mês com subtotal ao final

---

## [v1.7.2] — 2026-06-22

### Corrigido
- **Financeiro — filtro "Hoje" zerado**: `toDateInput` usava `toISOString()` (UTC) em vez de data local — após 21h no Brasil o frontend mandava "amanhã" pro backend, resultando em dados zerados (exceto crediário, que não depende do filtro de data)
- **Gráfico de receita sem labels**: backend retornava dia no formato `dd/MM` mas frontend aplicava `.slice(5)` esperando `yyyy-MM-dd` — labels ficavam em branco; corrigido para ISO no AnalyticsController
- **PDFs de relatório com data incorreta**: funções de geração de PDF (Financeiro Mensal e PDV) usavam `toISOString()` para calcular início/fim, podendo retornar um dia a menos ou a mais por causa do UTC
- **Relatório de vendas e crediário sem fuso horário**: RelatoriosController usava UTC puro — vendas após 21h no Brasil (00h UTC do dia seguinte) podiam cair no mês errado; corrigido para horário de Brasília igual ao AnalyticsController

---

## [v1.7.1] — 2026-06-22

### Adicionado
- **Sistema de preferências por perfil**: VLibras, chat IA, intervalo de atualização do dashboard, painéis visíveis e desconto padrão do PDV configuráveis por usuário — mudanças aplicadas em tempo real sem recarregar a página
- **Dashboard redesenho**: 3 tabs (Ativas / Histórico / Análises) — comandas aparecem imediatamente ao abrir o painel, sem scroll
- **Tab Análises no dashboard**: painéis financeiros colapsáveis com persistência individual, esquema de cores do gráfico (Padrão, Azul, Neon) e intervalo de atualização automática configuráveis
- **PDV — Wizard 3 etapas**: fluxo guiado (cliente → itens → pagamento) com analytics integrados de pico de horário, top produtos e formas de pagamento usadas
- **PDV — Barra flutuante de finalização**: visível em todas as etapas, com desconto rápido embutido e total atualizado em tempo real
- **PDV — Segundo pagamento livre**: valor do segundo método pode ser qualquer valor (antes era calculado automaticamente pelo saldo restante)
- **Carrossel de banners**: rotação automática com setas de navegação na seção de avisos/destaques e no hero da landing page
- **Campeonatos**: confirmação de pré-inscrições recebidas pela landing page + pódio com lista completa de participantes
- **Chat IA**: botão arrastável com posição salva entre sessões, posição fixa configurável por canto da tela

### Corrigido
- Preferências exigiam F5 para serem aplicadas — agora propagam via Context React em tempo real para todos os componentes
- Margem financeira exibida como % sobre custo (padrão de mercado), não em reais absolutos
- Intervalo de polling do dashboard recria o timer imediatamente ao ser alterado nas configurações
- Interceptor de API redireciona por contexto (/admin → /login, /cliente → /entrar) em vez de sempre ir para /login
- Custo de vendas avulsas históricas corrigido via backfill automático

---

## [v1.7.0] — 2026-06-16

### Adicionado
- **Sistema de Perfis de Acesso**: admin cria perfis nomeados (ex: Caixa, Estoquista) com checklist de 14 permissões e os atribui a operadores
- **Aba Operadores** na tela de usuários: cadastro de operadores com e-mail, senha e perfil atribuído
- **Sidebar dinâmica**: operadores veem apenas as seções permitidas pelo seu perfil
- **Renovação automática de sessão**: token renovado silenciosamente a cada 45 min, evitando desconexão por inatividade
- **Manual do usuário** na página Sobre: 9 módulos explicados com seções expansíveis

### Corrigido
- Pontos de fidelidade não são mais acumulados quando cashback é usado em qualquer parte do pagamento (método principal ou secundário)
- Operadores redirecionados corretamente para o painel admin ao fazer login (antes iam para a tela de cliente)

---

## [v1.6.0] — 2026-06-15

### Adicionado
- **Histórico de cliente** na área de usuários: acesse comandas, vendas no caixa (PDV), crediários e campeonatos de cada cliente em um único painel
- Vendas avulsas no caixa agora vinculam o cliente identificado, permitindo rastreamento futuro no histórico
- Estatísticas do cliente: total de visitas, total gasto, primeira e última visita

### Corrigido
- **Crediário**: itens de todas as comandas acumuladas agora aparecem corretamente no painel de crediário — antes apenas a primeira comanda aparecia
- **Venda Avulsa (mobile)**: barra fixa no rodapé do celular com total e botão "Finalizar" sem precisar rolar a página
- **Crediário**: overflow de DateTime ao calcular período de itens de crediário aberto (erro 500 no servidor)

---

## [v1.5.0] — 2026-06-12

### Adicionado
- Página **Sobre o Sistema** com versionamento e histórico de atualizações
- Relatório **PDV** com receita dia a dia, top produtos e formas de pagamento
- Relatório **Clientes** com pontos, validade e status de atividade
- Relatório **Comandas Abertas** com filtro por dias de abertura

### Corrigido
- Datas do relatório PDV exibindo "Invalid Date" (backend enviava apenas dd/MM)
- Pontos de fidelidade expirando em 1 ano em vez de 30 dias em ComandaService e VendaAvulsaService
- Autenticação MongoDB habilitada em produção com script de migração sem downtime

---

## [v1.4.0] — 2026-05-20

### Adicionado
- Pré-inscrições de campeonatos via landing page pública
- Pódio de campeonatos visível no painel do admin
- Painel de LGPD e auditoria de ações

### Corrigido
- Dashboard: barras do gráfico ancoradas corretamente no bottom
- Card do gráfico não esticava mais com o grid

---

## [v1.3.0] — 2026-05-10

### Adicionado
- Relatório de estoque em PDF
- Relatório financeiro e operacional em PDF
- Sistema de crediário com vencimento e histórico de itens

### Corrigido
- Foto de perfil do cliente não aparecia na área administrativa
- QR Codes de gatilho com link correto para o produto

---

## [v1.2.0] — 2026-04-15

### Adicionado
- Frente de Caixa (Venda Avulsa) com múltiplas formas de pagamento
- Pontos de fidelidade: 1 ponto por R$1 gasto, validade de 30 dias
- Cashback e pagamento por pontos acumulados

---

## [v1.1.0] — 2026-03-20

### Adicionado
- Catálogo TCG com busca integrada à API externa
- Campeonatos com inscrições e gerenciamento de rodadas
- Anúncios e banners configuráveis pelo admin

---

## [v1.0.0] — 2026-03-01

### Adicionado
- Lançamento inicial do sistema Santuário Nerd
- Gestão de estoque, categorias e produtos
- Painel administrativo com dashboard financeiro em tempo real
- Comandas de mesa com abertura, itens e fechamento
- Área do cliente com pontos, histórico e perfil
