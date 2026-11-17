# Arquitetura do sistema — PIM IV (etapa 6)

Diagramas feitos a partir do código real (controllers, serviços, hubs, `deploy/` e `.github/workflows`).
Fonte em Mermaid na pasta `mmd/`; as imagens (`img/*.svg` e `.png`) foram renderizadas com Mermaid 11.4.1.

| # | Diagrama | Mostra |
|---|----------|--------|
| 1 | `01-componentes` | Navegador/PWA, app Flutter, Cloudflare, nginx, front, API, PostgreSQL, MongoDB e serviços externos (Inter, Gemini, APIs de cartas, Google, Web Push, e-mail) |
| 2 | `02-camadas-api` | Middleware → Controllers/Hubs → Serviços (módulos e robôs) → EF Core/SQL de inicialização/Mongo |
| 3 | `03-classes-liga` | Classes do módulo de torneio e Liga: controllers, `TorneioService`, `Suico`, serviços da Liga, hub e entidades |
| 4 | `04-sequencia-resultado` | O jogador lança o resultado e o evento `TorneioAtualizado` atualiza o telão e o painel |
| 5 | `05-implantacao` | Branch → PR → CI → aprovação → backup → rollout sem queda → smoke e robôs de vigia |

Para editar: altere o `.mmd` e renderize de novo (por exemplo em <https://mermaid.live>), salvando o SVG/PNG em `img/` com o mesmo nome.

## Limites
- O app da Liga é Flutter só para Android por enquanto (iPhone ficou para depois).
- O diagrama 3 mostra os métodos principais, não todos.
- O MongoDB ainda está no ar (veja `docs/planejamento/MONGO-FORA.md` para a retirada).
