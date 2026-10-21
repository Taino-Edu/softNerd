#!/bin/bash
# =============================================================================
# backup.sh — Backup diário de PostgreSQL e MongoDB
#
# USO MANUAL:
#   cd /opt/santuarionerd && bash deploy/backup.sh
#
# CONFIGURAR CRON (uma vez no VPS):
#   crontab -e
#   # Backup às 03:00 todos os dias:
#   0 3 * * * cd /opt/santuarionerd && bash deploy/backup.sh >> /var/log/santuarionerd-backup.log 2>&1
#
# VARIÁVEIS DE AMBIENTE (lidas do .env ou exportadas antes de chamar):
#   BACKUP_DIR          Diretório de destino (default: /opt/santuarionerd/backups)
#   BACKUP_RETAIN_DAYS  Dias de retenção (default: 7)
#   POSTGRES_DB / POSTGRES_USER / MONGO_USER / MONGO_PASSWORD — lidos do .env
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
MAX_DAYS="${BACKUP_RETAIN_DAYS:-7}"

mkdir -p "$BACKUP_DIR"

# Carrega variáveis do .env
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env"
  set +a
fi

POSTGRES_DB="${POSTGRES_DB:-cardgamestore}"
POSTGRES_USER="${POSTGRES_USER:-cardgame_user}"
MONGO_USER="${MONGO_USER:-mongo_admin}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] === Iniciando backup Santuário Nerd ==="

# ── PostgreSQL ─────────────────────────────────────────────────────────────────
PG_FILE="$BACKUP_DIR/postgres_${TIMESTAMP}.sql.gz"
echo "[$(date '+%H:%M:%S')] PostgreSQL → $PG_FILE"

docker exec santuarionerd_postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "$PG_FILE"

PG_SIZE=$(du -sh "$PG_FILE" | cut -f1)
echo "[$(date '+%H:%M:%S')] PostgreSQL OK ($PG_SIZE)"

# ── MongoDB ────────────────────────────────────────────────────────────────────
MONGO_FILE="$BACKUP_DIR/mongo_${TIMESTAMP}.archive.gz"
echo "[$(date '+%H:%M:%S')] MongoDB → $MONGO_FILE"

docker exec santuarionerd_mongo \
  mongodump \
    --username "$MONGO_USER" \
    --password "$MONGO_PASSWORD" \
    --authenticationDatabase admin \
    --db cardgamestore_cache \
    --archive \
    --gzip \
  > "$MONGO_FILE"

MONGO_SIZE=$(du -sh "$MONGO_FILE" | cut -f1)
echo "[$(date '+%H:%M:%S')] MongoDB OK ($MONGO_SIZE)"

# ── Marca no banco que o backup rodou (o Vigia alerta se passar de 26 h) ───────
# A API não enxerga os arquivos daqui; este registro é o que ela consegue ver.
# Falhar aqui nunca derruba o backup (que já está feito).
docker exec santuarionerd_postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1 -c \
  "INSERT INTO marcos_operacao (chave, quando, detalhe) VALUES ('backup-diario', NOW(), 'postgres $PG_SIZE, mongo $MONGO_SIZE')
   ON CONFLICT (chave) DO UPDATE SET quando = EXCLUDED.quando, detalhe = EXCLUDED.detalhe;" >/dev/null 2>&1 \
  && echo "[$(date '+%H:%M:%S')] backup registrado no banco (Vigia)" \
  || echo "[$(date '+%H:%M:%S')] aviso: não deu pra registrar o backup no banco — o Vigia vai acusar atraso"

# ── Limpeza de backups antigos ─────────────────────────────────────────────────
REMOVED=$(find "$BACKUP_DIR" \( -name "*.sql.gz" -o -name "*.archive.gz" \) \
  -mtime +"$MAX_DAYS" -print -delete | wc -l)
echo "[$(date '+%H:%M:%S')] $REMOVED arquivo(s) com mais de $MAX_DAYS dias removidos"

# ── Prazo dos logs guardados pelo rollout.sh (30 dias) ─────────────────────────
# Roda aqui (cron diário) e não só no deploy: sem deploy por mais de 30 dias, log com
# dado de cliente passaria do prazo. Falha aqui nunca derruba o backup.
LOGS_DIR="${LOGS_DIR:-/var/log/santuarionerd}"
LOGS_DIAS="${LOGS_DIAS:-30}"
LOGS_REMOVIDOS=$(find "$LOGS_DIR" -name "*.log.gz" -mtime +"$LOGS_DIAS" -print -delete 2>/dev/null | wc -l || true)
echo "[$(date '+%H:%M:%S')] ${LOGS_REMOVIDOS:-0} log(s) guardado(s) com mais de $LOGS_DIAS dias removidos"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] === Backup concluído. Arquivos em: $BACKUP_DIR ==="
