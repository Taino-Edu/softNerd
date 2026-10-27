# Backlog e progresso

Documento vivo: **toda versão atualiza este arquivo** junto com o `frontend/public/CHANGELOG.md`
(regra no `CLAUDE.md`). Item que saiu do papel vai pra "Feito recentemente" com a versão; o
detalhe de como ficou mora no CHANGELOG e no código.

Atualizado em **26/10/2026** — produção na **v1.73.0** (nginx 1.30.6, Node 24.22.1, .NET 10).

Legenda: 🔨 em andamento · ⏳ esperando alguém · 📋 na fila · ✅ feito

---

## 🔨 Em andamento

| Item | Versão | Observação |
|---|---|---|
| Ajustes visuais da home (cores, linhas, responsividade) | v1.66.0 | Esperando o print do Maikon pra comparar com o que ele pediu |

## ⏳ Esperando alguém

| Item | Quem | O que falta |
|---|---|---|
| **"Sistema cai com comanda aberta durante o campeonato"** | Maikon | Logs de 5 dias sem queda do servidor; não reproduz no local. Com o Vigia no ar, a próxima vez vira alerta com a tela e o erro. Pedir ao Maikon: **qual tela, o que aparece, hora** (print ou vídeo) |
| Regras da Liga: prêmios por posição, desempate, mínimo de etapas, fechamento do mês | Maikon | Decisão dele; sem isso o ranking não define prêmio. **Decidido em 22/10: premiação só por mês, sem temporada anual** (o ranking recomeça sozinho todo mês e os meses anteriores ficam consultáveis) |
| Prazo de pagamento dos pedidos (Pix 1h / balcão 3 dias) | Maikon | Ele pediu antes pra tirar o robô que cancelava; confirmar. Enquanto isso o Vigia mostra os pedidos parados |
| Check-in por QR Code (igual Bandai) | Maikon | Prints do app da Bandai |
| Etapas de outubro jogadas no app externo | Maikon | Lançar pela Central → "Lançar etapa de fora" |
| Cor adicional em "Personalizar Site" | Maikon | Não ficou claro qual elemento |
| Chaves da API Pokémon TCG e Riot novas | Taino | Gerar na conta do Maikon e rodar `bash deploy/configurar-chave.sh POKEMON_API_KEY` na VPS |
| Login com Google | Taino | Client ID do Google Cloud |
| Conferir o 1º pedido real pago no Pix | Taino/Maikon | A venda deve aparecer no Financeiro do dia, como Pix (só tem teste automatizado) |

## 📋 Na fila (ordem sugerida)

1. **Segurança restante**: e-mail mascarado nos logs, alertas de log forging do CodeQL, cookies sem `Secure`.
2. **Limpeza das chaves vencidas** (RevisarEm 01/12 e 15/12): apagar o jeito antigo do código.
3. **Testes travados na pasta principal desta máquina** ("Acesso negado" no executor) — hoje rodam na cópia `softNerd-pix`.
4. Botão "Voltar versão" e checks obrigatórios novos no `main`.
5. Dependabot grandes (.NET 10, Next 16, TS 7) — um por vez, com teste.
6. Produto, mais adiante: "excluir minha conta" (LGPD), auditoria de acessibilidade, SaaS multi-loja (pausado).

## ✅ Feito recentemente

| Versão | Data | O quê |
|---|---|---|
| v1.74.0 | 26/10 | **Relatório de vendas por subcategoria** (pedido do Maikon): categoria-pai com o total (soma das filhas) e as subcategorias dentro; vendas estornadas fora do relatório |
| v1.73.0 | 26/10 | Limpeza pela contagem de uso: **WhatsApp automático** (Evolution, n8n, IA, caixa de conversas), **OFX** e **Mercado Pago** fora; tag `arquivo/whatsapp-v1.72.0`; banco intacto |
| v1.72.0 | 26/10 | Pedidos: **Registrar pagamento** sem dar como retirado (fica "Pago · aguardando retirada", igual ao Pix do site); coluna Vendas vira Reservas |
| v1.71.0 | 26/10 | **Nota fiscal (NFC-e) e Tenant-ERP fora do sistema** — o módulo fica guardado na tag `arquivo/nfce-v1.70.1`; banco intacto |
| — | 26/10 | Manutenção da VPS: backup, Postgres 16.15, Docker 29.9.2, emSign fora do servidor, SSH só com chave |
| v1.70.1 | 26/10 | Imagem da API sem as raízes emSign (CA eMudhra comprometida); servidor também |
| v1.70.0 | 23/10 | **API no .NET 10** (o 8 perde suporte em 10/11/2026); Snappier/SharpCompress corrigidos; certificado A1 no carregador novo |
| v1.69.0 | 23/10 | Pré-venda: carrinho novo soma no pedido sem pagar (um Pix só); Pix antigo derrubado conferindo pagamento |
| v1.68.0 | 23/10 | Campeonato separado da Liga: /campeonato/jogar e /campeonato/torneio; Liguinha e Central só com liguinhas |
| v1.67.0 | 23/10 | Liguinha: foto do jogador = Pokémon preferido (telão, celular, Central, ranking); deck em texto embaixo |
| v1.66.2 | 23/10 | Liguinha: lançar resultado depois que o tempo acaba ("Parar alarme" zerava o relógio e escondia o Venci/Perdi) |
| v1.66.1 | 22/10 | "Nerd" do título no azul padrão da loja |
| v1.66.0 | 22/10 | Home com **um azul só** (faixa, menu e rodapé no mesmo tom; sem azul-céu/petróleo misturados), topo sem círculos e sem espaço vazio, nenhum texto abaixo de 12px |
| v1.65.1 | 22/10 | O `update.sh` recomeça com a versão nova quando ele mesmo muda no deploy (antes só valia no deploy seguinte) |
| v1.65.0 | 22/10 | **"Qual o seu Pokémon preferido?"** — escolha depois do cadastro e na Minha Conta (busca, Me surpreenda, brilhante), animado ao lado da foto e no perfil público |
| v1.64.3 | 22/10 | **nginx 1.27 → 1.30.6** (correções de 14/10); o deploy passa a recriar o nginx quando a versão muda (antes só recarregava a config) |
| v1.64.2 | 22/10 | **Node.js 20 → 24.22.1** no site e no CI — correção das falhas de 21/10 (Brotli RCE, TLS); o 20 não recebe mais correção |
| v1.64.1 | 22/10 | Últimos gatilhos do Vigia: crediário sem lembrete (pelos marcos configurados), rodada da liguinha parada, backup atrasado (local e Drive com marcas separadas) |
| v1.64.0 | 21/10 | Gatilhos de comanda esquecida, Pix de comanda sem fechar, NFC-e, torneio sem encerrar e robô parado (os robôs batem o ponto); fontes dentro do projeto (build sem depender do Google); follow-redirects corrigido |
| v1.63.1 | 21/10 | **Logs não somem no deploy**: o rollout guarda o log antes de apagar o container (`/var/log/santuarionerd`, 30 dias, limpeza também no backup diário); busca com `bash deploy/logs.sh "texto"` |
| v1.63.0 | 21/10 | **Vigia do sistema** (gatilhos a cada 10 min, Alertas do sistema com busca, erro de tela registrado + tela "algo deu errado") e furo do PDV fechado. Gatilho novo = uma classe em `Services/Vigia` + uma linha em `ServicosDaLoja` |
| — | 21/10 | Conferido: firewall só deixa a Cloudflare falar com 80/443 (o IP forjável que estava na fila já estava resolvido) |
| v1.62.1 | 21/10 | Pódio e telão cabem no celular (cortava ao mexer no zoom) |
| v1.62.0 | 21/10 | Pedido do site vira venda no pagamento (Pix), preço congelado, retirada vira "Entregar", travas contra venda dupla |
| v1.61.1 | 21/10 | Entrada da liguinha em uma tela; deck escolhido na tela do torneio |
| v1.61.0 | 20/10 | Botão "Estou pronto" na mesa da liguinha |
| v1.60.0 | 20/10 | Métricas na Liga pública e "Minha Liga" na conta do jogador |
| v1.59.2 | 20/10 | Cancelar pedido derruba o Pix; Pix pago de pedido cancelado não some |
