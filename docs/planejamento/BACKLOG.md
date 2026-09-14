# Backlog — pedidos ainda não implementados

Itens levantados com o Maikon que continuam em aberto. Quando um sair do papel, registre no
`frontend/public/CHANGELOG.md` e tire daqui.

## Relatórios por subcategoria com total na categoria-pai

Maikon quer ver vendas por subcategoria (Pokémon, One Piece, Riftbound…) e o total agregado da
categoria-pai (Card Games = soma das filhas) nos relatórios (`frontend/app/admin/relatorios` e
`AnalyticsController`).

- Hoje `Product.Category` é uma **string** com o nome da folha (subcategoria, se houver), sem FK
  pra `ProductCategory`. A hierarquia (`ProductCategory.ParentCategoryId`) já existe e o formulário
  de produto já separa Categoria → Subcategoria.
- Caminho mais rápido: resolver o pai em tempo de leitura cruzando o nome com `ProductCategory`
  (mesma técnica de `estoque/page.tsx` e `venda-avulsa/page.tsx`). Risco: duas subcategorias com o
  mesmo nome em famílias diferentes viram uma só. Se isso acontecer na prática, migrar pra
  `Product.ProductCategoryId` (FK) com backfill por SQL manual.
- Regra do rollup: a linha da categoria-pai é **sempre** a soma das filhas — nunca somar de novo
  uma venda própria, senão duplica.

## Cor adicional em "Personalizar Site"

Maikon pediu pra poder alterar mais uma cor além de primária, destaque, navbar, fundo e card.
**Não ficou claro qual elemento** — confirmar com ele antes de implementar.
