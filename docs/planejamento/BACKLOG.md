# Backlog e progresso

Documento vivo: **toda versão atualiza este arquivo** junto com o `frontend/public/CHANGELOG.md`
(regra no `CLAUDE.md`). Item que saiu do papel vai pra "Feito" com a versão; o detalhe de como
ficou mora no CHANGELOG e no código. "Feito" guarda só o mês corrente: na virada do mês as linhas
vão pro [HISTORICO.md](HISTORICO.md).

Atualizado em **16/11/2026** — produção na **v1.86.1** (nginx 1.30.6, Node 24.22.1, .NET 10).
A v1.87.0 está pronta na branch `feat/home-que-vende`, ainda sem PR.

Legenda: 🔨 em andamento · ⏳ esperando alguém · 📋 na fila · ✅ feito

---

## 🔨 Em andamento

| Item | Versão | Observação |
|---|---|---|
| **Home que vende (fase 2)** | v1.87.0 | Feita na branch `feat/home-que-vende` (já com o `main` da v1.86.1), falta abrir o PR. Chave `home-que-vende`: categorias + vantagens abaixo do topo, produtos antes de avisos/torneios, torneios somem sem evento, "+ Sacola" no `CartaoProduto` (`onAdd`) com `components/loja/AvisoSacola`; busca de Produtos sem acento (`/produtos?busca=`). **Pedido do Maikon em 16/11** (mesma chave): topo no modelo dele (título "Prepare seu próximo grande jogo!", botões Explorar produtos / Ver campeonatos, mascote = logo de Personalizar Site à direita, só depois do site-config carregar; sem a busca no topo), cabeçalho em 3 tons (faixa no `MenuLoja`), catálogo em 3 colunas com `CartaoProduto grande` → `CartaoCatalogo` (modelo de catálogo dele: tom pelo selo, `rotuloCategoria`, descrição, "Adicionar"; sem estrelas/favoritos, que não existem), Produtos com filtros + busca numa linha e grade única, página do produto com foto maior e "Ampliar", foto voando pra Sacola (`lib/voarParaSacola.ts`, `data-sacola` no `MenuLoja`). Carrossel descartado por ele ("o site está simples e assertivo"). Fase 3 na fila |
| **App Android da Liga (Flutter)** — PIM IV | — | `mobile/`: login, meus torneios, mesa, ranking da Liga; identidade visual da loja; APK de release apontando pra produção (#166). Entrega do PIM era 14/11: **confirmar se foi entregue** e passar pro Feito. O que sobrou está na fila (Loja e app) |

## ⏳ Esperando alguém

### Pauta pro Maikon

Tudo que depende dele, pra resolver numa conversa só:

1. **"Sistema cai com comanda aberta durante o campeonato"** — a causa provável foi corrigida na v1.84.1 (07/11: ao trocar de tela a conexão em tempo real caía e a tela ficava sem receber comanda/Pix/fechamento, com o selo "Conectado"); a v1.79.7 pôs o botão "Abrir o torneio" (quem abria a comanda pelo QR da mesa não voltava pro campeonato). **Perguntar se voltou a acontecer.** Se sim: qual tela, o que aparece, hora (print ou vídeo) — o Vigia já registra o erro de tela.
2. **Aprovar a home nova** (v1.87.0, já com o que ele pediu em 16/11: topo sem arte, 3 tons, fotos maiores) — substitui o antigo "ajustes visuais da home (v1.66.0)". Atenção: os 3 tons desfazem o "um azul só" que ele mesmo pediu na v1.66.0/v1.82.0 — ele confirmou a troca em 16/11.
3. **Regras da Liga**: prêmios por posição, desempate, mínimo de etapas, fechamento do mês. Sem isso o ranking não define prêmio. Já decidido em 22/10: premiação só por mês, sem temporada anual.
4. **Prazo de pagamento dos pedidos** (Pix 1h / balcão 3 dias) — ele pediu pra tirar o robô que cancelava; confirmar. Enquanto isso o Vigia mostra os pedidos parados.
5. **% no Pix de 21 produtos** de outras categorias — desde a v1.86.1 é só texto da vitrine (o Pix cobra preço cheio). Zerar ou manter como anúncio?
6. **Check-in por QR Code** (igual Bandai) — mandar prints do app da Bandai.
7. **Etapas de outubro jogadas no app externo** — lançar pela Central → "Lançar etapa de fora".
8. **Cor adicional em "Personalizar Site"** — qual elemento.
9. **Pietro: "sem baixa no estoque e fora do Financeiro"** — o único pedido dele foi cancelado em 20/10, sem venda. Item digitado na edição do crediário é só texto (não mexe em estoque nem no Financeiro); pra baixar estoque, lançar pela comanda ou pelo balcão como crediário. Confirmar como o item entrou.
10. **1º pedido real pago no Pix** — o pedido de 13/11 (o da v1.86.1) foi pago no Pix: conferir se aparece no Financeiro do dia como Pix e fechar o item.

### Outros

| Item | Quem | O que falta |
|---|---|---|
| Chaves da API Pokémon TCG e Riot novas | Taino | Gerar na conta do Maikon e rodar `bash deploy/configurar-chave.sh POKEMON_API_KEY` na VPS |
| Login com Google | Taino | Client ID do Google Cloud |

## 📋 Na fila

Por tema, na ordem sugerida.

### 1. Loja e app
- **Home que vende — fase 3**: filtros, ordenação e navegação em Produtos (atrás da chave `home-que-vende`).
- **App da Liga, pós-PIM**: tempo real (SignalR) na mesa, notificação, iPhone (Flutter Web/iOS), página de download do APK.

### 2. Desempenho
**Lentidão nas telas do painel** (Taino, 29/10). Medido: a API responde em 4–19 ms dentro da VPS e o banco em ~7 ms;
nenhum pedido ≥ 2 s no log. O tempo é a rede: a VPS fica em **Boston** e cada chamada do Brasil custa 150–700 ms.
Feito: Pix junto da lista de pedidos (v1.79.3). Próximos:
- Mover a VPS pra São Paulo (maior ganho, todas as telas).
- Juntar chamadas repetidas nas telas.
- Miniaturas das fotos (148 fotos = 48 MB, 7 acima de 1 MB).

### 3. Segurança
Feito: e-mail fora dos logs e teste de vazamentos (v1.82.2), custo/margem fora da API pública (v1.83.2). Falta:
- Alertas de log forging que sobraram no CodeQL.
- Cookies sem `Secure`.
- Revisão completa: permissões por rota e dependências.

### 4. Código mais limpo pra banca
Pedido do Taino (27/10), um PR por etapa. Feito: limpeza das chaves (v1.75.0–v1.77.0); Clean Architecture em
pedidos (v1.78.0), campeonatos (v1.79.0) e crediário (v1.80.0). Falta:
- **Back:** os controllers que falam com o banco direto — `AnalyticsController` (18), `ContasReceberController`,
  `UserController`, `MarketplaceController`, `LgpdController` e os menores.
- **Front:** configurar o ESLint, tirar os 81 `any`, levar pro `lib/api` as 6 telas que chamam a API por fora.

### 5. Chaves de funcionalidade pra limpar
Viram o jeito único quando o Maikon aprovar (como nas v1.75.0–v1.77.0):
- `vigia-sistema` — **fica**: é liga/desliga de verdade.
- `pokemon-preferido`, `home-visual-uniforme`, `campeonato-separado`, `pedido-pix-junto`, `pagamento-sem-retirada`,
  `relatorio-por-subcategoria` — Maikon ainda testando.
- `home-que-vende` — nova (v1.87.0), ligada.
- `pix-pedido-com-desconto` — desligada desde a v1.86.1; se ele não pedir de volta, sai na próxima limpeza.

### 6. Infra e CI
- Botão "Voltar versão".
- Checks obrigatórios novos no `main`.
- Conferir se o deploy ainda espera aprovação (o `CLAUDE.md` diz que sim; desde 03/11 o merge vai direto pra
  produção) e alinhar a documentação.
- Testes travados na pasta principal desta máquina ("Acesso negado" no executor) — hoje rodam na cópia `softNerd-pix`.
- Dependabot grandes, um por vez e com teste: Next 16, TypeScript 7.

### 7. Mais adiante
- "Excluir minha conta" (LGPD).
- Acessibilidade (WCAG): contraste, teclado, leitor de tela, rótulos.
- SaaS multi-loja (pausado).

## ✅ Feito em novembro

Meses anteriores: [HISTORICO.md](HISTORICO.md).

| Versão | Data | O quê |
|---|---|---|
| v1.87.1 | 16/11 | **Primeiro acesso pelo CPF com a regra do QR Code**: `cpf-lookup` e `setup-account` exigem o WhatsApp do cadastro (`AuthService.AcharCadastroDoPrimeiroAcessoAsync` reaproveita `ConferirWhatsAppDoCadastroAsync`, a mesma conferência e bloqueio por conta da mesa); só ativa cliente sem senha nem Google; busca devolve só o primeiro nome e responde igual pra CPF inexistente e dado que não bate. Tela `/primeiro-acesso` ganhou o campo WhatsApp. Acertar CPF+WhatsApp não zera as senhas erradas de conta já ativada. 10 testes novos em `AuthServiceTests` |
| v1.86.1 | 13/11 | **Desconto só na finalização** (Maikon: pedido saiu R$ 41,22 mais barato "sem eu pedir"): chave `pix-pedido-com-desconto` nasce desligada — Pix do pedido cobra o preço cheio, desconto só no "Registrar pagamento"/comanda/caixa. Ficha do cliente mostra soma dos itens e o desconto. No banco: Pokémon e One Piece com 0% no Pix e produtos delas sem % própria (21 produtos de outras categorias ainda têm % só como texto da vitrine) |
| v1.86.0 | 07/11 | **Procedures e triggers (PIM IV, etapa 7)**: bloco novo no fim de `postgres.sql` (idempotente): trigger `updated_at` em 12 tabelas, auditoria de estoque em `estoque_movimentos`, `fn_estoque_baixo`, `fn_fechamento_comandas`, `fn_saldo_crediario`, `pr_manutencao_banco`. `RelatoriosBancoController` (`/api/relatorios/banco`, 501 no SQLite). Teste SQL no CI; reverter com `scripts/reverter-procedures-triggers.sql` |
| v1.85.0 | 07/11 | **Modais de venda com rascunho**: `lib/useRascunho.ts` (localStorage, 12 h, só o que difere do padrão), `lib/useDispensarModal.ts` (Esc/clique fora só no modal do topo), `components/PagamentoIcone.tsx`. Fechar comanda e Nova Venda do PDV guardam pagamento/desconto/carrinho/cliente e fecham por Esc/clique fora; banner "Começar do zero"; confirmar mostra a forma de pagamento |
| v1.84.1 | 07/11 | **Tempo real das comandas**: `lib/signalr.ts` com conexão única contada por uso e parada com espera de 1,5 s (trocar de tela deixava a tela nova com conexão morta e o selo "Conectado"); `ouvirEstadoHub`, `garanteHub`, `recarregarSeDesconectado` (refetch a cada 30 s só enquanto desconectado) no cliente e no estoque; handlers removidos ao sair; `ComandaHub` aceita Admin e Operator como a API. Provável causa do "sistema cai com comanda aberta durante o campeonato" |
| v1.84.0 | 06/11 | **SEO e prévia de link (fase 1)**: produto com título/preço/foto no HTML (`app/produtos/[id]/layout.tsx`, dados `schema.org/Product`), `/sitemap.xml`, `/robots.txt`, dados da loja (`Store`) e imagem padrão `og-santuario.jpg`; foto em JPEG com fundo branco pra prévia (`/uploads/x?w=N&f=jpg`). Próximo: fase 2 (home que vende, atrás de chave) |
| v1.83.2 | 06/11 | **Vazamento: custo/margem do produto** — `GET /api/product`, `/{id}`, `/store` e `/barcode` devolviam a entidade (custo, margem, estoque mínimo) pra visitante/cliente. Agora `ProdutoPublicoDto` pra quem não é Admin/Operator; teste em `VazamentosTests` |
| v1.83.1 | 06/11 | **Pacotes**: Microsoft 10.0.14 (EF Core, JwtBearer, SignalR.Client, testes), Google.Apis.Auth 1.78, QRCoder 1.8.1, WebPush 1.0.13, SharpCompress 0.50.8. Fora de propósito: FluentAssertions 8 (licença paga), SkiaSharp 4 e MongoDB.Driver 3 (troca grande) |
| v1.83.0 | 06/11 | **Pix do pedido com o desconto da loja** (chave `pix-pedido-com-desconto`): `Services/Pedidos/DescontoPixPedido.cs` espelha `resolvePixPercent`/`calcPrecoVitrine`; `ReservationPixService` cobra com desconto e grava `pix_cobrancas.desconto_em_centavos`; venda do Pix com `DiscountInCents`; Vigia soma o desconto antes de comparar |
| v1.82.5 | 06/11 | **PDV: desconto em R$ visível** — recibo (impresso e tela), detalhe e histórico usavam `discountPercent > 0`; desconto em R$ grava % = 0 e sumia. Agora `discountInReais > 0` |
| v1.82.4 | 06/11 | **Fluxo do cliente no celular** (teste de ponta a ponta, 15 achados): `lib/rotulos.ts` (status/mesa/telefone), `AvatarCliente` (foto → Pokémon → inicial), `?tab=` genérico na Minha Conta, valor do Pix e erro fixo na reserva confirmada, pedidos com total e preço por item, inscrição com data/valor/vagas e volta pra `/cliente`, `GetUpcomingAsync` sem campeonato de dia passado, mascote fora do topo do cliente e do rodapé, "Entrar / Cadastrar" no menu, Libras à esquerda nas telas de entrada |
| v1.82.3 | 05/11 | **QR Pix da comanda com desconto**: `POST /api/comanda/{id}/pix` aceita `discountInCents`; baixa do Pix fecha a comanda com o mesmo desconto (desconto gravado na cobrança, `pix_cobrancas.desconto_em_centavos`); comanda que mudou depois do QR fica aberta e avisa os admins |
| v1.82.2 | 04/11 | **Teste de vazamentos**: inscritos de campeonato só admin (cliente via pagamento dos outros); e-mail fora do log do servidor (só código da conta; e-mail só na auditoria); demais rotas de cliente conferidas com 2 clientes (ok) |
| v1.82.1 | 04/11 | **Menu único da loja** (`MenuLoja`): principal, Produtos, produto e Sacola com o mesmo menu e Libras no menu (sem a mão flutuante); compartilhar do produto na linha do caminho |
| v1.82.0 | 04/11 | **Home**: topo num azul só (faixa+menu+fundo), arte fixa sem o mascote de IA (também fora dos menus), menu fixo de volta (`fixed`+`relative` deixava um vão de 64 px), VLibras no menu com `abrirVLibras()` (o seletor antigo não abria nada) |
| v1.81.0 | 03/11 | **Alarme**: selo arrastável "Alarme sem som — clique pra ativar" (o Chrome bloqueia som até o 1º clique) / "Alarme pronto · tela acordada"; Screen Wake Lock com rodada correndo |
| v1.80.1 | 03/11 | **Timer**: "finish" só vale com ≤ 3 s no relógio do servidor (PC fora da hora encerrava a rodada de todos); widget só lista timer de campeonato de hoje/ontem ainda aberto e o alarme só toca até 10 min depois do fim (liguinhas esquecidas tocavam todas); tique do alarme num Web Worker a cada 250 ms (aba em segundo plano atrasava até 1 min); hora do servidor descontando a ida e volta |
| v1.80.0 | 03/11 | **Crediário em camadas**: `CrediariosController` só HTTP; contas no `CrediarioContaService`, config dos lembretes no `CrediarioAvisoService`; 13 testes das contas; tirar item da edição zera o bloco de ajuste |
| v1.79.7 | 03/11 | **Liguinha**: relógio da rodada conta na hora do servidor (celular fora da hora atrasava o timer); botão "Abrir o torneio" em Meus Campeonatos e na aba Torneios (quem saía da tela do jogo não voltava) |
| v1.79.6 | 03/11 | **Liga Mensal**: tirada a frase "Top 4 do mês ganha brinde" do topo de `/liga` (pedido do Maikon) |
