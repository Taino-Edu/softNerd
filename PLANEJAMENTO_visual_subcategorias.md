# Planejamento — ajustes pendentes (visual + subcategorias)

Sessão de 15/07/2026. Itens levantados mas não implementados ainda — pra continuar depois.

## 1. Preview de "Personalizar Site" não reflete o Estilo Visual nos botões

Em `frontend/app/admin/site/page.tsx`, o componente `LivePreview` só aplica o `RADIUS_PREVIEW_MAP`
(arredondamento escolhido em "Estilo Visual") no "Card de exemplo". Os botões CTA do preview
("Ver Torneios", "Ver Produtos") continuam com `rounded-lg` fixo do Tailwind, então o preview não
bate 100% com o site real (que aplica o raio em tudo via CSS injetado em `app/page.tsx`).

**Fix:** trocar as classes `rounded-lg` fixas desses botões no `LivePreview` por
`style={{ borderRadius: RADIUS_PREVIEW_MAP[cfg.borderRadiusStyle] }}`, mesmo padrão já usado no
card de exemplo.

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

## 4. Relatórios agrupados por subcategoria com rollup na categoria-pai

Maikon quer que os relatórios de vendas (`frontend/app/admin/relatorios/page.tsx` e/ou
`AnalyticsController`) mostrem vendas por subcategoria (Pokémon, One Piece, Riftbound...) E também
o total agregado da categoria-pai (Card Games = soma de todas as filhas). Hoje os relatórios usam
`Product.Category` (string livre) sem noção de hierarquia — precisa cruzar com `ProductCategory`
(`ParentCategoryId`, já implementado hoje) pra fazer esse agrupamento.

**Observação do próprio Maikon:** "Acho que a criação de um ERP para loja de card games é um dos
mais complexos pelo mix grande de produtos" — ele sabe que isso é grande, não é uma correção rápida
como os itens 1 e 2.

## Ordem sugerida ao retomar

1. Item 1 (rápido, baixo risco, só CSS do preview)
2. Confirmar com Maikon o item 2 antes de mexer
3. Item 3 (mudança de UX no formulário — Categoria + Subcategoria dependente)
4. Item 4 (o maior — relatórios agrupados; fazer só depois do item 3 estar sólido)
