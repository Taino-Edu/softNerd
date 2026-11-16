# Histórico do backlog

Linhas do "Feito" do [BACKLOG.md](BACKLOG.md) dos meses já fechados, da mais nova pra mais antiga.
O detalhe de cada versão está no `frontend/public/CHANGELOG.md`.

## Outubro de 2026

| Versão | Data | O quê |
|---|---|---|
| v1.79.5 | 30/10 | **Liga Mensal**: tirada a etiqueta "Brinde" atrás do nome dos 4 primeiros no ranking de `/liga` (pedido do Maikon) |
| v1.79.4 | 29/10 | **Pix da pré-venda por pedido**: "Minhas reservas" agrupa por pedido (um botão de Pix com o total, antes era um por item); cliente junta os próprios pedidos sem pagar ("Pagar tudo num Pix só", `POST /api/reservations/mine/juntar`) |
| v1.79.3 | 29/10 | **Tela de pedidos mais rápida**: status do Pix não vai mais ao Inter pra Pix vencido (e no máx. 1×/30 s no prazo); conexão mTLS com o Inter reaproveitada; lista de pedidos já traz o status do Pix (sem 1 chamada por pedido); `logs.sh --dias` consertado |
| v1.79.2 | 29/10 | **Pedidos do Maikon**: pré-venda lançada pelo admin soma no pedido sem pagar (um Pix, um pagamento); botão "Juntar num pedido só"; busca por cliente nos pedidos; aviso de pré-venda nova (sininho, push, e-mail); item adicionado no crediário soma na conta |
| v1.79.1 | 29/10 | **Pix da pré-venda vencido**: não reaproveita mais o QR depois da 1h (o banco recusava "QR Code não é válido"); gera um novo com o total (derrubando o antigo antes); Vigia ganha o alerta "Pix vencido sem pagamento" |
| v1.79.0 | 27/10 | **Campeonatos em camadas**: inscrição e Pix da entrada no `CampeonatoInscricaoService`; `RegraException` + `RespostaDeRegra` comuns; 9 testes novos |
| v1.78.0 | 27/10 | **Pedidos em camadas**: `ReservationController` (1.568 → 159 linhas) só HTTP; regras em `Services/Pedidos/` (criação, andamento, cobrança, consulta) com interface e `PedidoException` |
| v1.77.0 | 27/10 | **Limpeza das chaves do site/loja/cliente**: 10 chaves viram o jeito único; saem as telas antigas de entrada, sacola, carrossel e cartão de produto antigos |
| v1.76.0 | 27/10 | **Limpeza das chaves da Liga/Liguinha**: 9 chaves viram o jeito único (ranking por jogador, relógio separado, página e telão novos, animação, Central, modalidades, "Pronto", entrada simples) |
| v1.75.0 | 27/10 | **Limpeza das chaves de pedidos e painel**: 5 chaves viram o jeito único (operador pelo menu, menu e telas no azul, Pix do pedido consistente, venda no pagamento); tag `arquivo/chaves-antes-da-limpeza` |
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
