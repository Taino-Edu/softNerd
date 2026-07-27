#!/bin/bash
# =============================================================================
# install-firewall-cron.sh — Mantém o firewall da Cloudflare aplicado
#
# As regras da chain DOCKER-USER são voláteis: somem quando o daemon do Docker
# reinicia e no boot da máquina. Sem isso, um `systemctl restart docker` ou um
# reboot deixa as portas 80/443 abertas de novo, silenciosamente.
#
# Instala dois cron jobs:
#   @reboot   — reaplica assim que a máquina sobe
#   semanal   — pega mudanças na lista de ranges da Cloudflare
#
# USO:
#   sudo bash /opt/santuarionerd/deploy/install-firewall-cron.sh
# =============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT="/opt/santuarionerd/deploy/firewall-cloudflare.sh"
LOG="/var/log/santuarionerd-firewall.log"
MARKER="# santuarionerd-firewall-cloudflare"

[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo."; exit 1; }
[ -f "$SCRIPT" ] || { echo "Não achei $SCRIPT"; exit 1; }

# Remove entradas antigas antes de reinstalar (idempotente)
crontab -l 2>/dev/null | grep -v "$MARKER" > /tmp/cron.fw || true

cat >> /tmp/cron.fw <<EOF
$MARKER
@reboot sleep 60 && bash $SCRIPT >> $LOG 2>&1 $MARKER
0 4 * * 1 bash $SCRIPT >> $LOG 2>&1 $MARKER
EOF

crontab /tmp/cron.fw
rm -f /tmp/cron.fw

echo -e "${GREEN}✅ Cron instalado.${NC}"
echo -e "${YELLOW}   @reboot${NC}      reaplica 60s depois do boot (espera o Docker subir)"
echo -e "${YELLOW}   seg 04:00${NC}    atualiza a lista de ranges da Cloudflare"
echo -e "   Log: $LOG"
