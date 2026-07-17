# Planejamento — Pré-venda e Reserva (modelo da loja)

> Status: **em validação** (conversa 2026-07-17)
> Origem: o modelo real do Maikon é o inverso do que o sistema implementou:
> ele só faz pré-venda com item **em estoque** (trava por causa da data de rua
> de lançamento), e fila só existe para item que **não chegou**.

## Os dois conceitos (nomes corrigidos)

### 🟣 PRÉ-VENDA — item em estoque, com ou sem data de rua
O cliente entra na pré-venda e o produto **já é dele**:

- **Baixa do estoque na hora** — decremento real, não trava virtual de
  disponibilidade. Acabam os "24 em estoque" que ninguém entende.
- **Pix em tudo** — todo fluxo de pré-venda oferece pagamento Pix no ato
  (pagar já = só passar buscar). Pagar na retirada continua possível.
- **Data de rua** (opcional, por produto): se preenchida, a UI mostra
  *"Disponível pra retirada a partir de DD/MM"*. Itens comuns (sem data):
  retirada imediata.
- **Expiração de não-pagos**: entrou e não pagou → segura 48h (item comum)
  ou até a data de rua + 48h (item com data). Estourou → cancela e o estoque
  volta automaticamente. Pago não expira — é venda feita, fica guardado até
  a retirada.
- **Homologação/retirada**: no balcão o admin marca "retirado" — **sem baixar
  estoque de novo** (já baixou na entrada). A venda fiscal (venda avulsa/NFC-e)
  é gerada nesse momento, como hoje.

### 🟡 RESERVA — item que não chegou (a fila)
- Botão explícito: **"Entrar na fila — avisamos quando chegar"**.
- Não mexe em estoque, não cobra nada (não há o que vender ainda).
- Posição = ordem de entrada.
- **Chegada do lote** (estoque sai de 0 → >0): o sistema, na ordem da fila e
  até onde o lote cobrir:
  1. Converte reserva → pré-venda (baixando o estoque de cada convertido);
  2. Notifica: *"Chegou! Sua unidade já está separada — pague no Pix ou na
     retirada em até 48h."*;
  3. Quem não foi coberto pelo lote **permanece na fila** pro próximo.
- Cliente pode sair da fila a qualquer momento pelo perfil.

## Como fica a UI (textos explícitos)

| Situação do produto | Botão | Texto de apoio |
|---|---|---|
| Em estoque, sem data de rua | **Entrar na pré-venda** | *"O produto já é separado pra você na hora. Pague agora no Pix ou na retirada em até 48h."* |
| Em estoque, com data de rua | **Entrar na pré-venda** | *"Lançamento dia DD/MM. Você garante a sua agora (baixa do estoque na hora) e retira a partir do lançamento."* |
| Sem estoque | **Entrar na fila** | *"Ainda não chegou. Você entra na fila e a gente avisa quando chegar — aí você garante no Pix ou na retirada."* |

- **Um botão roxo por produto**, sempre. Fim dos dois botões.
- **Perfil do cliente**: seções "Pré-vendas" (com status: paga ✓ / aguardando
  pagamento / aguardando data de rua / pronta pra retirada) e "Minha fila"
  (posição por produto).
- **Admin**: abas *Pré-vendas | Fila (reservas) | Histórico*; ao repor estoque,
  mostra "lote cobre até a posição N da fila".

## Regras de borda

| Caso | Comportamento |
|---|---|
| Fila > lote que chegou | Converte na ordem até acabar o lote; resto segue na fila |
| Pré-venda não paga expirou | Cancela + estoque volta; era de fila → próximo da fila é chamado |
| Cliente desiste de pré-venda paga | Cancela no perfil → admin vê "a reembolsar" (estorno manual no Inter) + estoque volta |
| Loja cancela pré-venda do produto | Admin cancela em massa; pagos → "a reembolsar"; estoque volta |
| Estoque físico divergir do sistema | Ajuste manual do admin segue existindo (estoque é a fonte da verdade) |

## Mudanças técnicas (resumo)

Backend:
- `ProductReservation` vira o motor único, com `Kind = pre_venda | fila`:
  - **pre_venda**: ao criar → `Product.StockQuantity -= qty` na hora (transação,
    com checagem de saldo atômica); `ExpiresAt` = 48h ou dataDeRua+48h;
    cancelar/expirar → estoque volta.
  - **fila**: sem estoque, sem expiração; `Position` derivado de `ReservedAt`.
- `Product` ganha `preVendaReleaseDate` (date, opcional) — a "data de rua".
- Gatilho pós-aumento de estoque: `ProcessArrivalAsync(productId)` converte fila
  → pré-venda na ordem (baixando estoque) + notificações.
- Homologação vira "marcar retirado": gera venda/NFC-e **sem** novo decremento.
- Pix de grupo funciona para os dois (já é por ReservationGroupId).
- Job de expiração: varre pré-vendas não pagas vencidas → cancela + estorna
  estoque (+ puxa próximo da fila quando aplicável).
- `reservedQuantity`/`availableQuantity` do produto: pré-venda já não conta mais
  como "reservado" — ela já saiu do `stockQuantity`. Disponibilidade = estoque.
  (Simplifica o que foi feito no commit 7fed919 — rever.)

Migração de dados:
- `product_wait_lists` → reservas `Kind=fila` (ordem por CreatedAt).
- Reservas `active` atuais (48h, trava virtual) → viram pré-vendas:
  baixar o estoque delas na migração e alinhar `ExpiresAt`.

Frontend:
- Renomear tudo: "reserva/carrinho" → fluxo de pré-venda; textos da tabela acima.
- Produto: campo "data de rua" no cadastro (admin), visível no site.
- Perfil: duas seções (Pré-vendas / Minha fila).
- Admin /reservas: abas novas + cobertura de lote.

## Pontos fiscais (validar com o contador depois)

- Pix pago na pré-venda: a NFC-e é emitida na retirada (homologação), como hoje
  no PDV. Se o contador entender que pagamento antecipado exige emissão no ato,
  avaliar depois — fora do escopo desta mudança.

## Decisões travadas com o dono

- Pré-venda **só existe com item em estoque** (com ou sem data de rua).
- Entrar na pré-venda **baixa estoque na hora**.
- **Pix em todos os fluxos** de pré-venda.
- Reserva = fila de item não chegado; não cobra, não baixa estoque.
- Estorno é decisão manual do admin (sistema sinaliza "a reembolsar").

## Pendências de decisão (perguntar antes de codar)

1. Pré-venda de item comum (sem data de rua) não paga: expira em 48h mesmo?
2. Item com data de rua: não-pago segura até a data + 48h?
3. Na fila, posição é visível pro cliente ("você é o #3")?
