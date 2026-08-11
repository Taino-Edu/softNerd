# Changelog — Santuário Nerd

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
