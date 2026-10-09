# softNerd — Santuário Nerd

Antes de alterar algo, leia **[docs/mapa/README.md](docs/mapa/README.md)**: diz onde fica cada parte e o que
precisa mudar junto (banco sem migrations, fuso de Brasília, formas de pagamento, tema claro, Pix, crediário).
As listas de endpoints, telas, componentes e tabelas ficam em `docs/mapa/` e são geradas por
`python scripts/gerar-mapa.py` — rode de novo depois de criar/mudar endpoint, tela, componente ou tabela.

Fluxo: branch → PR → CI verde (testes, Postgres de verdade, carga, Docker, CodeQL) → merge → deploy pelo
workflow "Deploy produção" (aprovação) → robô de smoke vigia a cada 30 min. Sem push direto no `main`.

Regras que mais quebraram até hoje:
- SQL de inicialização fica em `CardGameStore/Data/Inicializacao/` (postgres.sql + sqlite.sql) e roda em todo
  startup — tem que ser idempotente. Mexeu nele ou no `Program.cs`? Suba a API local antes de commitar.
- Datas "do dia" sempre no calendário de Brasília (nunca `toISOString().slice(0, 10)` no front).
- Cor nova no front precisa de versão no bloco `html.light` de `frontend/app/globals.css`.
- Liga/desliga: `frontend/components/ui/Switch.tsx`.
- Toda versão atualiza `frontend/public/CHANGELOG.md`.
