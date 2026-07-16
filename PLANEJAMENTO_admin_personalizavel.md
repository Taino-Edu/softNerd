# Planejamento — personalizar o admin inteiro (não só a landing)

Pedido do Taino (16/07/2026): "o sistema todo tem que ser personalizado pelo Maikon igual o
Tenant" — hoje `SiteConfig` (cores, logo, estilo visual) só afeta a landing page pública
(`frontend/app/page.tsx`). O painel admin (sidebar, navbar interna) continua com cor fixa
(`#0C3D5A`/navy hardcoded), não reflete a marca configurada.

## Escopo a decidir
- Sidebar do admin (`AdminSidebar` ou equivalente) passa a usar `site.colorPrimary`/`colorNavy`?
- Logo configurada (`site.logoUrl`) aparece no topo do sidebar admin, no lugar do texto fixo?
- Favicon/ícone do admin (`site.adminIconUrl`, já existe no backend) — falta aplicar no `<head>`
  das páginas `/admin/*`.
- Conferir se isso faz sentido pro caso de uso do Maikon (ele é o único admin) — personalização de
  admin importa mais quando é multi-tenant (cada lojista vendo a cor dele no próprio painel); aqui
  pode ser só "porque fica bonito" — vale confirmar a motivação antes de reformar o layout inteiro.

## Referência
Tenant-ERP_Model provavelmente já resolve isso via `SiteConfigProvider`/`useSiteConfig` (contexto
compartilhado, ver `[[project_saas_multitenant]]`) — conferir lá como aplicam cor no admin antes de
desenhar a versão do softNerd.
