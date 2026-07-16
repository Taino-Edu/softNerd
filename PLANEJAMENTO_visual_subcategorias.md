# Planejamento — ajustes pendentes (visual + subcategorias)

Sessão de 15/07/2026. Itens levantados mas não implementados ainda — pra continuar depois.

## 1. Preview de "Personalizar Site" não reflete o Estilo Visual nos botões

Em `frontend/app/admin/site/page.tsx`, o componente `LivePreview` só aplica o `RADIUS_PREVIEW_MAP`
(arredondamento escolhido em "Estilo Visual") no "Card de exemplo". Os botões CTA do preview
("Ver Eventos", "Ver Torneios", "Ver Produtos") continuam com `rounded-lg` fixo do Tailwind, então
o preview não bate 100% com o site real (que aplica o raio em tudo via CSS injetado em
`app/page.tsx`).

**Fix:** trocar as classes `rounded-lg` fixas desses três botões no `LivePreview` por
`style={{ borderRadius: RADIUS_PREVIEW_MAP[cfg.borderRadiusStyle] }}`, mesmo padrão já usado no
card de exemplo.

**Status: feito** — os três botões (Ver Eventos, Ver Torneios, Ver Produtos) já aplicam o raio
dinâmico; o card de exemplo usa o tier `2xl` (mesmo do site real) via `RADIUS_PREVIEW_MAP_2XL`.

## 2. Cor adicional pedida pelo Maikon

Maikon pediu pra "conseguir alterar a cor" além do que já existe em Admin > Personalizar Site >
Cores (primária, destaque, navbar, fundo, card). **Não ficou claro qual cor especificamente** —
precisa confirmar com ele qual elemento ele quer poder customizar antes de implementar (evitar
chutar de novo depois do imprevisto de hoje com o bug de categorias).

## 3. Categoria/Subcategoria como campos separados no formulário de produto (pedido do Maikon via WhatsApp)

Hoje (ver `frontend/app/admin/estoque/page.tsx`), o formulário de produto tem um único dropdown de
categoria que já mostra "Card Games › One Piece" pra subcategorias. Maikon pediu algo mais
explícito: **dois campos** — "Categoria" (só as principais) e, condicionalmente, "Subcategoria"
(filtrada pelas filhas da categoria escolhida) — fluxo tipo Estado → Cidade.

Cita como exemplo:
> "Exemplo pokemon XXX vendas, One piece, xxxx vendas, Riftbound xxxx em vendas porém todos
> alocados na categoria pai - Card Games em vendas"

### Estratégia de persistência (pré-requisito real dos itens 3 e 4)

Hoje `Product.Category` é só uma **string livre**, sem FK pra `ProductCategory` — é por isso que o
dropdown atual funciona por nome (`c.name`), não por ID. Pra separar Categoria/Subcategoria como
dois campos de verdade e fazer rollup nos relatórios (item 4) sem gambiarra, dá pra escolher entre:

- **(a) Manter string, resolver hierarquia em tempo de leitura** — o campo `Product.Category`
  continua guardando o nome da subcategoria (ex: "One Piece"), e toda vez que for preciso saber o
  pai (relatórios, filtros), cruza por nome com `ProductCategory.ParentCategoryId` (mesma técnica já
  usada em `venda-avulsa/page.tsx` e `estoque/page.tsx` hoje). Zero migração de dado, mas colisão de
  nome entre categorias diferentes vira bug silencioso (ex: duas subcategorias chamadas "Kids" em
  famílias diferentes viram uma coisa só nos relatórios).
- **(b) Migrar para `ProductCategoryId` (FK de verdade)** — troca `Product.Category` (string) por
  `Product.ProductCategoryId` (Guid, FK). Resolve a colisão de nome de vez, mas exige: migração dos
  produtos existentes (casar `Category` string → `ProductCategory.Id` por nome, backfill via SQL
  manual como sempre no projeto), decidir o que fazer com produtos cujo `Category` não bate com
  nenhuma `ProductCategory` cadastrada, e atualizar todo lugar que hoje lê `Product.Category` como
  string (estoque, venda-avulsa, relatórios, exportação CSV, filtros do cliente).

**Recomendação:** (a) pra destravar rápido os itens 3/4 sem migração; considerar (b) só se colisão
de nome virar problema real na prática. Confirmar com Taino antes de começar item 3.

**Regra de rollup pros relatórios (item 4):** total da categoria-pai = soma das vendas de todas as
subcategorias filhas, **sem contar a venda de novo** separadamente na linha da categoria-pai (ou
seja, "Card Games" no relatório é sempre um total calculado, nunca uma contagem própria adicional —
senão duplica o valor).

## 4. Relatórios agrupados por subcategoria com rollup na categoria-pai

Maikon quer que os relatórios de vendas (`frontend/app/admin/relatorios/page.tsx` e/ou
`AnalyticsController`) mostrem vendas por subcategoria (Pokémon, One Piece, Riftbound...) E também
o total agregado da categoria-pai (Card Games = soma de todas as filhas). Hoje os relatórios usam
`Product.Category` (string livre) sem noção de hierarquia — precisa cruzar com `ProductCategory`
(`ParentCategoryId`, já implementado hoje) pra fazer esse agrupamento. Ver "Estratégia de
persistência" acima antes de começar.

**Observação do próprio Maikon:** "Acho que a criação de um ERP para loja de card games é um dos
mais complexos pelo mix grande de produtos" — ele sabe que isso é grande, não é uma correção rápida
como os itens 1 e 2.

## Ordem sugerida ao retomar

1. Item 1 (rápido, baixo risco, só CSS do preview)
2. Confirmar com Maikon o item 2 antes de mexer
3. Item 3 (mudança de UX no formulário — Categoria + Subcategoria dependente)
4. Item 4 (o maior — relatórios agrupados; fazer só depois do item 3 estar sólido)
