# Backlog e progresso

Documento vivo: **toda versão atualiza este arquivo** junto com o `frontend/public/CHANGELOG.md`
(regra no `CLAUDE.md`). Item que saiu do papel vai pra "Feito recentemente" com a versão; o
detalhe de como ficou mora no CHANGELOG e no código.

Atualizado em **21/10/2026** — produção na **v1.63.0**.

Legenda: 🔨 em andamento · ⏳ esperando alguém · 📋 na fila · ✅ feito

---

## 🔨 Em andamento

| Item | Versão | Observação |
|---|---|---|
| **Logs que não somem no deploy** — rollout guarda o log antes de apagar o container; busca com `deploy/logs.sh` | v1.63.1 | Os guardados começam no 1º deploy depois desta versão |

## ⏳ Esperando alguém

| Item | Quem | O que falta |
|---|---|---|
| **"Sistema cai com comanda aberta durante o campeonato"** | Maikon | Logs de 5 dias sem queda do servidor; não reproduz no local. Com o Vigia no ar, a próxima vez vira alerta com a tela e o erro. Pedir ao Maikon: **qual tela, o que aparece, hora** (print ou vídeo) |
| Regras da Liga: prêmios por posição, desempate, mínimo de etapas, descartes, temporada anual, fechamento do mês | Maikon | Decisão dele; sem isso o ranking não define prêmio |
| Prazo de pagamento dos pedidos (Pix 1h / balcão 3 dias) | Maikon | Ele pediu antes pra tirar o robô que cancelava; confirmar. Enquanto isso o Vigia mostra os pedidos parados |
| Check-in por QR Code (igual Bandai) | Maikon | Prints do app da Bandai |
| Etapas de outubro jogadas no app externo | Maikon | Lançar pela Central → "Lançar etapa de fora" |
| "Pokémon preferido" no perfil | Maikon | Confirmar se era o deck do torneio (feito na v1.61.1) ou um Pokémon de perfil no cadastro |
| Cor adicional em "Personalizar Site" | Maikon | Não ficou claro qual elemento |
| Chaves da API Pokémon TCG e Riot novas | Taino | Gerar na conta do Maikon e rodar `bash deploy/configurar-chave.sh POKEMON_API_KEY` na VPS |
| Login com Google | Taino | Client ID do Google Cloud |
| Conferir o 1º pedido real pago no Pix | Taino/Maikon | A venda deve aparecer no Financeiro do dia, como Pix (só tem teste automatizado) |

## 📋 Na fila (ordem sugerida)

1. **Mais gatilhos no Vigia**: comanda aberta há mais de 12 h, NFC-e rejeitada/pendente, Pix de comanda pago sem fechar, crediário vencido sem aviso, torneio com rodada parada, robôs que pararam de rodar (Pix, NFC-e).
2. **Segurança restante**: e-mail mascarado nos logs, alertas de log forging do CodeQL, cookies sem `Secure`.
3. **Limpeza das chaves vencidas** (RevisarEm 01/12 e 15/12): apagar o jeito antigo do código.
4. **Testes travados na pasta principal desta máquina** ("Acesso negado" no executor) — hoje rodam na cópia `softNerd-pix`.
5. Botão "Voltar versão" e checks obrigatórios novos no `main`.
6. Dependabot grandes (.NET 10, Next 16, TS 7) — um por vez, com teste.
7. **Relatórios por subcategoria com total na categoria-pai** — Maikon quer vendas por subcategoria (Pokémon, One Piece, Riftbound…) e o total da categoria-pai (soma das filhas) em `admin/relatorios` e `AnalyticsController`. `Product.Category` é string com o nome da folha, sem FK; caminho rápido: resolver o pai na leitura cruzando o nome com `ProductCategory` (risco: duas subcategorias com o mesmo nome em famílias diferentes; se acontecer, migrar pra `Product.ProductCategoryId` com backfill). A linha do pai é **sempre** a soma das filhas.
8. Produto, mais adiante: "excluir minha conta" (LGPD), auditoria de acessibilidade, SaaS multi-loja (pausado).

## ✅ Feito recentemente

| Versão | Data | O quê |
|---|---|---|
| v1.63.0 | 21/10 | **Vigia do sistema** (gatilhos a cada 10 min, Alertas do sistema com busca, erro de tela registrado + tela "algo deu errado") e furo do PDV fechado. Gatilho novo = uma classe em `Services/Vigia` + uma linha em `ServicosDaLoja` |
| — | 21/10 | Conferido: firewall só deixa a Cloudflare falar com 80/443 (o IP forjável que estava na fila já estava resolvido) |
| v1.62.1 | 21/10 | Pódio e telão cabem no celular (cortava ao mexer no zoom) |
| v1.62.0 | 21/10 | Pedido do site vira venda no pagamento (Pix), preço congelado, retirada vira "Entregar", travas contra venda dupla |
| v1.61.1 | 21/10 | Entrada da liguinha em uma tela; deck escolhido na tela do torneio |
| v1.61.0 | 20/10 | Botão "Estou pronto" na mesa da liguinha |
| v1.60.0 | 20/10 | Métricas na Liga pública e "Minha Liga" na conta do jogador |
| v1.59.2 | 20/10 | Cancelar pedido derruba o Pix; Pix pago de pedido cancelado não some |
