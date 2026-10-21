# Backlog e progresso

Documento vivo: **toda versão atualiza este arquivo** junto com o `frontend/public/CHANGELOG.md`
(regra no `CLAUDE.md`). Item que saiu do papel vai pra "Feito recentemente" com a versão; o
detalhe de como ficou mora no CHANGELOG e no código.

Atualizado em **21/10/2026** — produção na **v1.62.1**.

Legenda: 🔨 em andamento · ⏳ esperando alguém · 📋 na fila · ✅ feito

---

## 🔨 Em andamento

| Item | Versão | Observação |
|---|---|---|
| **Vigia do sistema** — gatilhos automáticos a cada 10 min, tela Configuração → Alertas do sistema com busca, erros de tela registrados, tela "algo deu errado" no lugar da página branca | v1.63.0 | Base pra crescer: gatilho novo = uma classe em `Services/Vigia` + uma linha em `ServicosDaLoja`. Chave `vigia-sistema` |
| **Furo do PDV** — campos internos da venda (`SkipStockDecrement`, `Origem`, reserva) não entram mais pelo JSON | v1.63.0 | |

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

1. **Logs que não somem no deploy** — hoje o log da API vai embora a cada deploy (container novo). Gravar em volume/arquivo com rotação e deixar buscável (o Vigia cobre o "o que deu errado", o log cobre o "por quê").
2. **Mais gatilhos no Vigia**: comanda aberta há mais de 12 h, NFC-e rejeitada/pendente, Pix de comanda pago sem fechar, crediário vencido sem aviso, torneio com rodada parada, robôs que pararam de rodar (Pix, NFC-e).
3. **IP forjável nos limites de acesso** — a origem responde direto, sem passar pela Cloudflare, então o cabeçalho `CF-Connecting-IP` pode ser inventado. Aceitar só de IPs da Cloudflare (ou fechar a porta 80/443 pra quem não é Cloudflare).
4. **Segurança restante**: e-mail mascarado nos logs, alertas de log forging do CodeQL, cookies sem `Secure`.
5. **Limpeza das chaves vencidas** (RevisarEm 01/12 e 15/12): apagar o jeito antigo do código.
6. **Testes travados na pasta principal desta máquina** ("Acesso negado" no executor) — hoje rodam na cópia `softNerd-pix`.
7. Botão "Voltar versão" e checks obrigatórios novos no `main`.
8. Dependabot grandes (.NET 10, Next 16, TS 7) — um por vez, com teste.
9. **Relatórios por subcategoria com total na categoria-pai** — Maikon quer vendas por subcategoria (Pokémon, One Piece, Riftbound…) e o total da categoria-pai (soma das filhas) em `admin/relatorios` e `AnalyticsController`. `Product.Category` é string com o nome da folha, sem FK; caminho rápido: resolver o pai na leitura cruzando o nome com `ProductCategory` (risco: duas subcategorias com o mesmo nome em famílias diferentes; se acontecer, migrar pra `Product.ProductCategoryId` com backfill). A linha do pai é **sempre** a soma das filhas.
10. Produto, mais adiante: "excluir minha conta" (LGPD), auditoria de acessibilidade, SaaS multi-loja (pausado).

## ✅ Feito recentemente

| Versão | Data | O quê |
|---|---|---|
| v1.62.1 | 21/10 | Pódio e telão cabem no celular (cortava ao mexer no zoom) |
| v1.62.0 | 21/10 | Pedido do site vira venda no pagamento (Pix), preço congelado, retirada vira "Entregar", travas contra venda dupla |
| v1.61.1 | 21/10 | Entrada da liguinha em uma tela; deck escolhido na tela do torneio |
| v1.61.0 | 20/10 | Botão "Estou pronto" na mesa da liguinha |
| v1.60.0 | 20/10 | Métricas na Liga pública e "Minha Liga" na conta do jogador |
| v1.59.2 | 20/10 | Cancelar pedido derruba o Pix; Pix pago de pedido cancelado não some |
