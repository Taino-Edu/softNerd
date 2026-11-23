# Product Backlog — Santuário Nerd

> Itens reais do projeto escritos como **histórias de usuário** (Como \<quem\>, quero \<o quê\>, para \<por quê\>). A coluna *Entrega* aponta a versão do
> CHANGELOG ou o PR em que o item foi entregue. Prioridade pela regra **MoSCoW** (M = deve ter, S = deveria, C = poderia). O backlog vivo está em
> `docs/planejamento/BACKLOG.md`; aqui está o recorte organizado por épico para o trabalho.

Legenda de situação: ✅ entregue · 🔨 em andamento · ⏳ na fila · ⏸ esperando decisão ou insumo de fora.

## Épico A — Frente de caixa e comanda

| ID | História | Prior. | Situação | Entrega |
|---|---|:-:|:-:|---|
| A1 | Como **operador**, quero registrar vendas no balcão com várias formas de pagamento e desconto, para fechar a venda sem sair do sistema | M | ✅ | v1.2.0; desconto em R$ v1.16.0 |
| A2 | Como **cliente**, quero ver a cobrança Pix da minha comanda na hora em que o atendente a gera, para pagar sem esperar | M | ✅ | v1.14.0 |
| A3 | Como **operador**, quero estornar uma venda ou comanda lançada errada sem apagar o histórico, para corrigir sem perder rastro | M | ✅ | v1.27.0 |
| A4 | Como **operador**, quero que a venda em andamento não se perca por um clique fora, para não refazer o carrinho | S | ✅ | v1.29.0 (bloqueio); v1.85.0 (rascunho guardado) |
| A5 | Como **operador e cliente**, quero que a tela de comandas atualize sozinha mesmo depois de trocar de tela, para não depender de F5 | M | ✅ | v1.84.1 |

## Épico B — Estoque e catálogo

| ID | História | Prior. | Situação | Entrega |
|---|---|:-:|:-:|---|
| B1 | Como **dono**, quero buscar cartas TCG na API externa ao cadastrar produto, para não digitar tudo | S | ✅ | v1.1.0 |
| B2 | Como **dono**, quero um relatório de estoque em PDF, para conferir e imprimir | S | ✅ | v1.3.0 |
| B3 | Como **cliente**, quero reservar um produto de pré-venda pelo site, para garantir minha unidade | M | ✅ | v1.11.0; pré-venda manual com vários itens v1.26.0 |
| B4 | Como **dono**, quero ver as vendas por subcategoria, para saber o que realmente gira | C | ✅ | v1.74.0 |

## Épico C — Pagamentos, financeiro e crediário

| ID | História | Prior. | Situação | Entrega |
|---|---|:-:|:-:|---|
| C1 | Como **jogador**, quero pagar a inscrição do campeonato por Pix, com a vaga segurada enquanto pago | M | ✅ | v1.15.0; vaga segurada v1.30.0 |
| C2 | Como **cliente do site**, quero que o Pix do pedido cobre o desconto que a loja anuncia, para pagar o preço que vi | M | ✅ | v1.83.0 |
| C3 | Como **dono**, quero que o financeiro some corretamente vendas com pagamento dividido, para não inflar a receita | M | ✅ | v1.23.0 |
| C4 | Como **cliente com fiado**, quero receber aviso de vencimento e pagar por um link Pix, inclusive uma parte | M | ✅ | v1.34.0, v1.35.0, v1.38.0 |
| C5 | Como **dono**, quero registrar o pagamento de um pedido por fora sem dá-lo como retirado | S | ✅ | v1.72.0 |

## Épico D — Liga, Liguinha e torneios

| ID | História | Prior. | Situação | Entrega |
|---|---|:-:|:-:|---|
| D1 | Como **organizador**, quero rodar o torneio suíço dentro do site (rodadas, mesas, relógio), para sair do app de fora | M | ✅ | v1.40.0 |
| D2 | Como **público da loja**, quero ver o telão com mesas, relógio e classificação ao vivo | M | ✅ | v1.54.0 |
| D3 | Como **organizador**, quero uma Central da Liguinha (painel de controle do torneio) | M | ✅ | v1.56.0 |
| D4 | Como **jogador**, quero avisar "estou pronto" para a rodada começar quando todos estiverem prontos | S | ✅ | v1.61.0 |
| D5 | Como **jogador**, quero que meu Pokémon preferido seja a minha foto no ranking | C | ✅ | v1.65.0, v1.67.0 |
| D6 | Como **dono**, quero separar Campeonato da Liga mensal | S | ✅ | v1.68.0 |
| D7 | Como **jogador**, quero um **aplicativo Android** para entrar no torneio, jogar a rodada e ver o ranking | M | ✅ | PR #159 e #160 (07/11) |
| D8 | Como **jogador de iPhone**, quero usar o mesmo app (via Flutter Web/PWA) | M | ⏳ | sprint 19 |
| D9 | Como **jogador**, quero ver a rodada mudar ao vivo no app, sem esperar a consulta periódica (SignalR) | S | ⏳ | sprint 19 |
| D10 | Como **dono**, quero regras de premiação da Liga (posição, desempate, mínimo de etapas) | S | ⏸ | decisão do Maikon |

## Épico E — Site público e cliente

| ID | História | Prior. | Situação | Entrega |
|---|---|:-:|:-:|---|
| E1 | Como **dono**, quero o site no meu domínio (santuarionerd.com.br), para a loja ter endereço próprio | M | ✅ | v1.22.0 |
| E2 | Como **cliente**, quero ver parcelamento e preço no Pix na página do produto, para decidir a compra | S | ✅ | v1.25.0 |
| E3 | Como **dono**, quero que o produto apareça com foto, nome e preço no Google e na prévia do WhatsApp | S | ✅ | v1.84.0 |
| E4 | Como **cliente no celular**, quero um fluxo de compra e comanda sem tropeços | M | ✅ | v1.82.4 |

## Épico F — Segurança, LGPD e qualidade

| ID | História | Prior. | Situação | Entrega |
|---|---|:-:|:-:|---|
| F1 | Como **dono**, quero perfis de acesso (caixa, estoquista) com permissões, para cada pessoa ver só o que precisa | M | ✅ | v1.7.0 |
| F2 | Como **dono**, quero que o custo e a margem dos produtos não vazem na API pública | M | ✅ | v1.83.2 |
| F3 | Como **equipe**, queremos mudanças grandes atrás de chave de funcionalidade, para reverter sem deploy | M | ✅ | v1.41.0 (16 versões entregues assim) |
| F4 | Como **equipe**, queremos o back em camadas (controllers só HTTP, regras em serviços) | S | ✅ | v1.78.0, v1.79.0, v1.80.0 |
| F5 | Como **equipe**, queremos a API numa versão com suporte longo (.NET 10) | M | ✅ | v1.70.0 |
| F6 | Como **dono**, quero um vigia que me avise quando algo do sistema falhar | S | ✅ | v1.63.0 |
| F7 | Como **titular de dados**, quero poder excluir minha conta (LGPD) | S | ⏳ | fila |
| F8 | Como **equipe**, queremos terminar a migração dos controllers restantes para serviços e configurar o ESLint | C | ⏳ | fila |

## Épico G — Dados e operação

| ID | História | Prior. | Situação | Entrega |
|---|---|:-:|:-:|---|
| G1 | Como **dono**, quero deploy sem queda, com backup antes e aprovação minha | M | ✅ | pipeline de deploy (azul/verde) |
| G2 | Como **equipe**, queremos o modelo de dados documentado (MER, lógico, dicionário) | M | ✅ | `docs/pim/banco/` |
| G3 | Como **equipe**, queremos regras de banco em procedures e triggers (auditoria, `updated_at`, relatórios) | S | ⏳ | sprint 19 |
| G4 | Como **equipe**, queremos um banco só (tirar o MongoDB), migrando as vendas do PDV com segurança | C | ⏳ | roteiro em `docs/planejamento/MONGO-FORA.md` (PR #158) |
| G5 | Como **dono**, quero que as telas do painel abram mais rápido (a VPS fica longe do Brasil) | S | ⏳ | fila |

## Pendências da fila priorizada

1. Lentidão nas telas do painel (rede até a VPS, não o código).
2. Segurança restante (cookies `Secure`, alertas de análise estática).
3. Código mais limpo para a banca (serviços restantes, ESLint, tirar `any`).
4. Botão "Voltar versão" e checagens obrigatórias novas na `main`.
5. Dependabot grandes (Next 16, TypeScript 7), um por vez.
