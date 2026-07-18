#!/bin/bash
# =============================================================================
# install-backup-cron.sh — Instala o agendamento diário do backup para o Drive
#
# - Agenda: todo dia às 03:47 (horário da VPS)
# - Idempotente: pode rodar quantas vezes quiser, não duplica a entrada
# - IMPORTANTE: rode com o MESMO usuário que configurou o rclone
#   (a config do rclone fica no home de cada usuário — ver deploy/BACKUP.md)
#
# USO:
#   sudo bash /opt/santuarionerd/deploy/install-backup-cron.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$SCRIPT_DIR/backup-drive.sh"
SCHEDULE="47 3 * * *"
CRON_LINE="$SCHEDULE /bin/bash $TARGET"
MARKER="# santuarionerd-backup-drive"

command -v crontab >/dev/null 2>&1 || {
  echo "ERRO: crontab não encontrado. Instale o cron: apt-get install -y cron" >&2
  exit 1
}

if [ ! -f "$TARGET" ]; then
  echo "ERRO: $TARGET não existe." >&2
  exit 1
fi

CURRENT="$(crontab -l 2>/dev/null || true)"

if printf '%s\n' "$CURRENT" | grep -Fq "$TARGET"; then
  echo "O cron do backup já está instalado — nada a fazer:"
  printf '%s\n' "$CURRENT" | grep -F "$TARGET"
  exit 0
fi

# Aviso: o backup-drive.sh já chama o backup.sh — um cron antigo do backup.sh
# faria o dump local rodar duas vezes por dia
if printf '%s\n' "$CURRENT" | grep -F "backup.sh" | grep -qv "backup-drive"; then
  echo "AVISO: existe um cron antigo chamando backup.sh diretamente."
  echo "       O backup-drive.sh já executa o backup.sh — considere remover a linha antiga com 'crontab -e'."
  echo ""
fi

# Adiciona a linha preservando o crontab existente (linhas em branco são removidas)
{ printf '%s\n' "$CURRENT"; echo "$CRON_LINE $MARKER"; } | grep -v '^[[:space:]]*$' | crontab -

echo "Cron instalado com sucesso:"
echo "  $CRON_LINE"
echo ""
echo "O backup roda todo dia às 03:47 (horário da VPS) e grava log em:"
echo "  $(dirname "$SCRIPT_DIR")/backups/backup-drive.log"
echo ""
echo "Antes da primeira execução, confirme que o rclone está configurado"
echo "para ESTE usuário ($(whoami)):  rclone listremotes   (deve mostrar gcrypt:)"
echo "Guia de setup: deploy/BACKUP.md"
echo ""
echo "Verificar se está instalado:"
echo "  crontab -l"
echo ""
echo "Remover no futuro (se precisar):"
echo "  crontab -l | grep -v 'backup-drive.sh' | crontab -"
