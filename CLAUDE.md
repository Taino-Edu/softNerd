# softNerd — Santuário Nerd

Antes de alterar algo, leia **[docs/mapa/README.md](docs/mapa/README.md)**: diz onde fica cada parte e o que
precisa mudar junto (banco sem migrations, fuso de Brasília, formas de pagamento, tema claro, Pix, crediário).
As listas de endpoints, telas, componentes e tabelas ficam em `docs/mapa/` e são geradas por
`python scripts/gerar-mapa.py` — rode de novo depois de criar/mudar endpoint, tela, componente ou tabela.

Regras que mais quebraram até hoje:
- SQL de inicialização em `CardGameStore/Program.cs`: nunca usar `{` `}` (nem em comentário) — a API não sobe.
  Mexeu nele? Suba a API local antes de commitar.
- Datas "do dia" sempre no calendário de Brasília (nunca `toISOString().slice(0, 10)` no front).
- Cor nova no front precisa de versão no bloco `html.light` de `frontend/app/globals.css`.
- Liga/desliga: `frontend/components/ui/Switch.tsx`.
- Toda versão atualiza `frontend/public/CHANGELOG.md`.
