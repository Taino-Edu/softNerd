# MER conceitual — Santuário Nerd

> Gerado/atualizado por `scripts/gerar-modelo-dados.py`. Os diagramas abaixo aparecem direto no GitHub (Mermaid); as imagens prontas pro trabalho escrito estão em `img/` (SVG e PNG).

O MER conceitual descreve o **negócio**: as entidades que a loja reconhece (comanda, produto, crediário, campeonato...) e como se relacionam, sem se prender a nomes de tabela ou tipos de coluna. O modelo lógico (próximo documento) desce ao nível das tabelas.

## Como ler

| Notação | Significado |
|---|---|
| `||--o{` | um para muitos (obrigatório de um lado, opcional do outro) |
| `|o--o{` | um (opcional) para muitos |
| `}o..o|`, `||..o{` (linha **tracejada**) | relação que existe no sistema mas **sem chave estrangeira no banco** (a aplicação garante), ou que aponta pro MongoDB |
| `PK` | identificador da entidade |

## Visão geral

```mermaid
erDiagram
  PERFIL ||--o{ USUARIO : "define permissões"
  USUARIO ||--o{ COMANDA : abre
  USUARIO ||--o{ RESERVA : faz
  USUARIO ||--o{ CREDIARIO : deve
  USUARIO ||--o{ PARTICIPANTE : "se inscreve como"
  USUARIO ||--o{ DECK : monta
  USUARIO ||--o{ ANUNCIO_CARTA : anuncia
  COMANDA ||--o{ ITEM_COMANDA : contem
  PRODUTO ||--o{ ITEM_COMANDA : "é vendido em"
  PRODUTO ||--o{ VARIANTE : "tem grade de"
  PRODUTO ||--o{ RESERVA : "é reservado em"
  COMANDA ||--o{ COBRANCA_PIX : gera
  COMANDA ||--o{ CREDIARIO : "origina"
  CREDIARIO ||--o{ LANCAMENTO : "é composto por"
  CREDIARIO ||--o{ PAGAMENTO : "é quitado por"
  CAMPEONATO ||--o{ PARTICIPANTE : reune
  CAMPEONATO ||--o{ RODADA : "se divide em"
  RODADA ||--o{ PARTIDA : tem
  PARTICIPANTE ||--o{ PARTIDA : joga
  VENDA_AVULSA }o..o| USUARIO : "pode identificar (MongoDB)"
  VENDA_AVULSA ||..o{ COBRANCA_PIX : "pode originar (MongoDB)"
```

## Acesso e identidade

Quem usa o sistema: clientes, equipe, perfis de permissão, sessões, avisos ao usuário e LGPD.

```mermaid
erDiagram
  PERFIL ||--o{ USUARIO : "define permissões de"
  USUARIO ||--o{ SESSAO : "mantém"
  USUARIO ||--o{ NOTIFICACAO : "recebe"
  USUARIO ||--o{ INSCRICAO_PUSH : "registra"
  USUARIO |o--o{ CONSENTIMENTO_COOKIES : "dá"
  USUARIO |o--o{ SOLICITACAO_LGPD : "faz"
  USUARIO {
    uuid id PK
    string nome
    string email
    string cpf
    string whatsapp
    string papel "cliente, operador ou administrador"
    int pontos
    decimal saldo
    string pokemon_preferido
  }
  PERFIL {
    uuid id PK
    string nome
    string permissoes
  }
  SESSAO {
    uuid id PK
    datetime expira_em
    string dispositivo
  }
  NOTIFICACAO {
    uuid id PK
    string titulo
    bool lida
  }
  INSCRICAO_PUSH {
    uuid id PK
    string endpoint
  }
  CONSENTIMENTO_COOKIES {
    string id PK
    string escolha
  }
  SOLICITACAO_LGPD {
    string id PK
    string tipo
    string situacao
  }
```

## Catálogo e estoque

O que a loja vende: categorias (com subcategorias), produtos, variações de tamanho/cor e lista de espera.

```mermaid
erDiagram
  CATEGORIA |o--o{ CATEGORIA : "tem subcategorias"
  CATEGORIA ||..o{ PRODUTO : "classifica (pelo nome)"
  PRODUTO ||--o{ VARIANTE : "tem grade de"
  PRODUTO ||--o{ LISTA_ESPERA : "tem fila de"
  USUARIO |o--o{ LISTA_ESPERA : "entra na"
  CATEGORIA {
    uuid id PK
    string nome
    decimal desconto_pix
  }
  PRODUTO {
    uuid id PK
    string nome
    string categoria
    decimal preco
    decimal custo
    int estoque
    bool pre_venda
  }
  VARIANTE {
    uuid id PK
    string tamanho
    string cor
    int estoque
  }
  LISTA_ESPERA {
    uuid id PK
    datetime entrou_em
  }
  USUARIO {
    uuid id PK
    string nome
  }
```

## Comanda, reservas e pagamentos

Venda na mesa (comanda), pré-venda/reserva do site, cobranças Pix e integração bancária.

```mermaid
erDiagram
  USUARIO ||--o{ COMANDA : abre
  COMANDA ||--o{ ITEM_COMANDA : contem
  PRODUTO ||--o{ ITEM_COMANDA : "é vendido em"
  USUARIO ||--o{ RESERVA : faz
  PRODUTO ||--o{ RESERVA : "é reservado em"
  VARIANTE |o--o{ RESERVA : "escolhida em"
  COMANDA ||--o{ COBRANCA_PIX : gera
  RESERVA }o..o| COBRANCA_PIX : "paga por (grupo de reserva)"
  VENDA_AVULSA ||..o{ COBRANCA_PIX : "pode originar (MongoDB)"
  VENDA_AVULSA }o..o| RESERVA : "homologa (MongoDB)"
  COMANDA {
    uuid id PK
    string status
    string forma_pagamento
    decimal desconto
    int pontos_aplicados
    datetime estornada_em
  }
  ITEM_COMANDA {
    uuid id PK
    string nome_no_momento "snapshot"
    decimal preco_no_momento "snapshot"
    int quantidade
  }
  RESERVA {
    uuid id PK
    uuid grupo_reserva
    string situacao
    int quantidade
  }
  COBRANCA_PIX {
    uuid id PK
    string txid
    decimal valor
    string situacao
  }
  VENDA_AVULSA {
    string id "ObjectId do MongoDB"
    decimal total
    string forma_pagamento
    datetime vendida_em
  }
  TRANSACAO_EXTERNA {
    uuid id PK
    string tipo
    decimal valor
    string situacao
  }
  CONFIG_INTEGRACAO {
    uuid id PK
    string origem
    datetime ultima_sincronizacao
  }
```

## Crediário

Contas a receber do cliente: dívida, lançamentos, pagamentos parciais e avisos de cobrança.

```mermaid
erDiagram
  USUARIO ||--o{ CREDIARIO : deve
  COMANDA ||--o{ CREDIARIO : "origina"
  CREDIARIO ||--o{ LANCAMENTO : "é composto por"
  CREDIARIO ||--o{ PAGAMENTO : "é quitado por"
  CREDIARIO ||--o{ AVISO_COBRANCA : "gera"
  CREDIARIO ||--o{ COBRANCA_PIX : "pode ser pago por"
  COMANDA ||..o{ LANCAMENTO : "origina (sem FK)"
  VENDA_AVULSA ||..o{ LANCAMENTO : "origina (MongoDB)"
  CREDIARIO {
    uuid id PK
    decimal valor
    date vencimento
    string situacao
  }
  LANCAMENTO {
    uuid id PK
    decimal valor
    string observacao
  }
  PAGAMENTO {
    uuid id PK
    decimal valor
    datetime pago_em
  }
  AVISO_COBRANCA {
    uuid id PK
    string canal
    datetime enviado_em
  }
  CONFIG_AVISO {
    uuid id PK
    bool ativo
    string horario
  }
```

## Campeonatos, Liga e torneios

Campeonatos e Liga mensal, inscritos, rodadas e partidas do torneio suíço, decks e cronômetros.

```mermaid
erDiagram
  CAMPEONATO ||--o{ PARTICIPANTE : reune
  USUARIO ||--o{ PARTICIPANTE : "se inscreve como"
  CAMPEONATO ||--o{ PRE_INSCRICAO : "recebe"
  CAMPEONATO ||--o{ RODADA : "se divide em"
  RODADA ||--o{ PARTIDA : tem
  PARTICIPANTE ||--o{ PARTIDA : "joga como A"
  PARTICIPANTE ||--o{ PARTIDA : "joga como B"
  USUARIO ||--o{ DECK : monta
  DECK }o..o| PARTICIPANTE : "usado por (sem FK)"
  CAMPEONATO |o--o{ COMANDA : "consome em"
  PARTICIPANTE |o--o{ COMANDA : "abre"
  PARTICIPANTE ||--o{ COBRANCA_PIX : "paga inscrição por"
  CAMPEONATO |o..o{ CRONOMETRO : "marca tempo de (sem FK)"
  CAMPEONATO {
    uuid id PK
    string nome
    string jogo
    string modalidade "Liga ou Campeonato"
    int vagas
    decimal taxa
    string situacao
    int rodada_atual
  }
  PARTICIPANTE {
    uuid id PK
    bool pago
    datetime check_in
    int desistiu_na_rodada
    int colocacao
  }
  RODADA {
    uuid id PK
    int numero
    datetime iniciada_em
  }
  PARTIDA {
    uuid id PK
    int mesa
    string relatorio_a
    string relatorio_b
    string resultado
  }
  DECK {
    uuid id PK
    string nome
  }
  CRONOMETRO {
    uuid id PK
    int duracao_segundos
    string estado
  }
  LANCAMENTO_LIGA {
    uuid id PK
    string jogador
    int pontos
  }
  PRE_INSCRICAO {
    uuid id PK
    string nome
  }
```

## Mercado de cartas

Anúncios de cartas entre jogadores e os interessados em cada anúncio.

```mermaid
erDiagram
  USUARIO ||--o{ ANUNCIO_CARTA : anuncia
  ANUNCIO_CARTA ||--o{ INTERESSE : "desperta"
  USUARIO ||--o{ INTERESSE : demonstra
  ANUNCIO_CARTA {
    uuid id PK
    string carta
    decimal preco
    string estado
  }
  INTERESSE {
    uuid id PK
    string mensagem
    datetime criado_em
  }
  USUARIO {
    uuid id PK
    string nome
  }
```

## Sistema e operação

Auditoria, alertas do Vigia, comunicados, chaves de funcionalidade, configuração do site e marcos de operação.

```mermaid
erDiagram
  USUARIO |o..o{ AUDITORIA : "é autor de (sem FK)"
  AUDITORIA {
    string id PK
    string acao
    string entidade
    datetime quando
  }
  ALERTA_SISTEMA {
    uuid id PK
    string gravidade
    string titulo
    int ocorrencias
  }
  COMUNICADO {
    uuid id PK
    string titulo
    bool ativo
  }
  FUNCIONALIDADE {
    string codigo PK
    bool ligada
  }
  MARCO_OPERACAO {
    string chave PK
    datetime quando
  }
  CONFIG_SITE {
    uuid id PK
    string nome_do_site
    string cores
  }
  CONTROLE_AJUSTES {
    string chave PK
    datetime aplicado_em
  }
```

## Entidades que vivem fora do PostgreSQL

`VENDA_AVULSA` (venda feita no caixa/PDV e as geradas ao homologar pedidos do site) fica no **MongoDB**, na coleção `vendas_avulsas`, como documento autocontido: itens, total, forma de pagamento, desconto, cliente e estorno ficam **copiados** no momento da venda (nome e preço do produto não mudam se o cadastro mudar depois). Outras tabelas apontam pra ela por um identificador em texto (`venda_avulsa_id` em `crediario_lancamentos`, `product_reservations` e `pix_cobrancas`), por isso aparecem tracejadas. O Mongo também guarda o cache de cartas das APIs de TCG.
