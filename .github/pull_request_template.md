## O que muda

<!-- Uma ou duas frases: o que o usuário/Maikon vai perceber. -->

## Checklist (regras que mais quebraram — CLAUDE.md)

- [ ] `frontend/public/CHANGELOG.md` atualizado
- [ ] Mexeu em endpoint, tela, componente ou tabela? Rodei `python scripts/gerar-mapa.py` (o CI confere)
- [ ] Mexeu em `Data/Inicializacao/*.sql` ou `Program.cs`? Subi a API local no Postgres (o CI também sobe)
- [ ] Data "do dia" no calendário de Brasília; cor nova com versão no `html.light`
- [ ] Mudança visual: testei a tela local (tema claro e escuro, celular)
- [ ] Dinheiro em texto pra pessoas usa `Common.Dinheiro.Brl` (back) / `brl` (front)

## Como testei

<!-- Testes, tela local, carga... -->
