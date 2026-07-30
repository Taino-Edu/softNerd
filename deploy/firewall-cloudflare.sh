#!/bin/bash
# =============================================================================
# firewall-cloudflare.sh — Só a Cloudflare fala com as portas 80/443
#
# Hoje o VPS responde direto no IP (http://2.24.121.247), o que permite pular a
# Cloudflare inteira: sem WAF, sem rate limit, sem proteção de DDoS, e o IP de
# origem fica exposto pra qualquer scanner. Este script bloqueia 80/443 para
# todo mundo que não seja um range oficial da Cloudflare.
#
# POR QUE NÃO É `ufw deny 80`:
#   O Docker escreve as próprias regras de iptables e elas são avaliadas ANTES
#   das do UFW. Porta publicada por container ignora o UFW completamente. O
#   ponto de entrada correto é a chain DOCKER-USER, que o Docker consulta antes
#   de entregar o tráfego ao container — é o que este script usa.
#
# A PORTA 22 (SSH) NÃO É AFETADA: DOCKER-USER só vê tráfego destinado a
# containers. Você não se tranca pra fora rodando isto.
#
# USO:
#   sudo bash /opt/santuarionerd/deploy/firewall-cloudflare.sh          # aplica
#   sudo bash /opt/santuarionerd/deploy/firewall-cloudflare.sh --undo   # remove
#   sudo bash /opt/santuarionerd/deploy/firewall-cloudflare.sh --status # mostra
#
# As regras somem quando o Docker reinicia ou o servidor dá boot. Rode o
# install-firewall-cron.sh (ou veja o rodapé deste arquivo) pra reaplicar.
# =============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

CHAIN="DOCKER-USER"
PORTS="80,443"
V4_URL="https://www.cloudflare.com/ips-v4"
V6_URL="https://www.cloudflare.com/ips-v6"

[ "$(id -u)" -eq 0 ] || { echo -e "${RED}Rode com sudo.${NC}"; exit 1; }

# -----------------------------------------------------------------------------
# Interface externa — OBRIGATÓRIA nas regras.
#
# A DOCKER-USER é consultada pela chain FORWARD, que vê o tráfego nos DOIS
# sentidos: internet→container E container→internet. Sem prender a regra à
# interface de entrada, um `--dports 80,443 -j DROP` derruba também a saída dos
# containers, porque o pacote que sai pra qualquer site na 80/443 casa a regra e
# não vem de IP da Cloudflare. O RELATED,ESTABLISHED não cobre isso: o primeiro
# SYN de uma conexão nova é NEW.
#
# Sintomas de quando faltava: `apt-get update` no build do Docker dando
# "connection timed out" pra deb.debian.org, emissão de NFC-e sem resposta da
# SEFAZ, e integração do Inter/Pix falhando — tudo saída HTTPS de container.
# -----------------------------------------------------------------------------
EXT_IF="${EXT_IF:-$(ip route show default 2>/dev/null | awk '/default/ {print $5; exit}')}"
[ -n "$EXT_IF" ] || {
    echo -e "${RED}Não consegui detectar a interface externa.${NC}"
    echo "Rode informando na mão, ex: sudo EXT_IF=eth0 bash $0"
    exit 1
}

# -----------------------------------------------------------------------------
# --status — só mostra o que está valendo agora
# -----------------------------------------------------------------------------
if [ "$1" = "--status" ]; then
    echo -e "${YELLOW}IPv4:${NC}"; iptables  -L "$CHAIN" -n --line-numbers
    echo -e "${YELLOW}IPv6:${NC}"; ip6tables -L "$CHAIN" -n --line-numbers
    exit 0
fi

# -----------------------------------------------------------------------------
# --undo — libera as portas pra todo mundo de novo
# -----------------------------------------------------------------------------
if [ "$1" = "--undo" ]; then
    iptables  -F "$CHAIN"; iptables  -A "$CHAIN" -j RETURN
    ip6tables -F "$CHAIN"; ip6tables -A "$CHAIN" -j RETURN
    echo -e "${GREEN}✅ Regras removidas — 80/443 abertas para qualquer origem.${NC}"
    exit 0
fi

# -----------------------------------------------------------------------------
# Baixa os ranges ANTES de tocar no firewall.
# Se a Cloudflare estiver fora do ar, aborta com tudo ainda funcionando — em vez
# de aplicar uma lista vazia e derrubar o site.
# -----------------------------------------------------------------------------
echo -e "${YELLOW}📡 Baixando ranges oficiais da Cloudflare...${NC}"
V4=$(curl -fsS --max-time 20 "$V4_URL") || { echo -e "${RED}Falha ao baixar $V4_URL — nada foi alterado.${NC}"; exit 1; }
V6=$(curl -fsS --max-time 20 "$V6_URL") || { echo -e "${RED}Falha ao baixar $V6_URL — nada foi alterado.${NC}"; exit 1; }

N4=$(echo "$V4" | grep -c '/') ; N6=$(echo "$V6" | grep -c '/')
[ "$N4" -ge 10 ] || { echo -e "${RED}Só $N4 ranges IPv4 — resposta suspeita, abortando.${NC}"; exit 1; }
[ "$N6" -ge 3  ] || { echo -e "${RED}Só $N6 ranges IPv6 — resposta suspeita, abortando.${NC}"; exit 1; }
echo "   $N4 ranges IPv4, $N6 ranges IPv6"

# -----------------------------------------------------------------------------
# Reconstrói a chain do zero (idempotente — rodar duas vezes não duplica regra).
# Ordem importa: conexões já abertas, depois Cloudflare, depois o DROP.
# -----------------------------------------------------------------------------
echo -e "${YELLOW}🔒 Aplicando regras (interface externa: $EXT_IF)...${NC}"

# Todo `-i "$EXT_IF"` abaixo é o que mantém a SAÍDA dos containers livre — ver o
# comentário lá em cima. Não remova achando que é redundante.
iptables -F "$CHAIN"
iptables -A "$CHAIN" -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
for ip in $V4; do
    iptables -A "$CHAIN" -i "$EXT_IF" -s "$ip" -p tcp -m multiport --dports "$PORTS" -j RETURN
done
iptables -A "$CHAIN" -i "$EXT_IF" -p tcp -m multiport --dports "$PORTS" -j DROP
iptables -A "$CHAIN" -j RETURN

ip6tables -F "$CHAIN"
ip6tables -A "$CHAIN" -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
for ip in $V6; do
    ip6tables -A "$CHAIN" -i "$EXT_IF" -s "$ip" -p tcp -m multiport --dports "$PORTS" -j RETURN
done
ip6tables -A "$CHAIN" -i "$EXT_IF" -p tcp -m multiport --dports "$PORTS" -j DROP
ip6tables -A "$CHAIN" -j RETURN

echo -e "${GREEN}✅ Pronto. 80/443 só aceitam tráfego vindo da Cloudflare.${NC}"
echo
echo -e "   ${YELLOW}⚠️  NÃO teste o bloqueio a partir deste servidor.${NC} Tráfego que sai do"
echo "      próprio host pra uma porta publicada não passa pela DOCKER-USER, então"
echo "      'curl http://IP' aqui dentro responde normal mesmo com o firewall ativo."
echo "      Teste de OUTRA máquina (seu notebook):"
echo "        curl -m 10 http://2.24.121.247/          → tem que dar timeout"
echo "        curl -sI https://santuarionerd.com.br    → tem que dar 200"
echo
echo -e "   ${YELLOW}Confira também que a SAÍDA dos containers continua livre:${NC}"
echo "        docker run --rm curlimages/curl -sI https://deb.debian.org  → tem que dar resposta"
echo "      (se der timeout, as regras pegaram o sentido errado — veja o comentário"
echo "       sobre EXT_IF no topo deste arquivo)"
echo
echo "   Desfazer:  sudo bash $0 --undo"
