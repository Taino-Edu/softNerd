#!/bin/bash
# =============================================================================
# backup-drive.sh — Backup local + envio criptografado para o Google Drive
#
# O QUE FAZ:
#   1. Executa o deploy/backup.sh (dump PostgreSQL + MongoDB no disco da VPS)
#   2. Empacota num tar.gz extra o que o backup.sh NÃO cobre:
#      - volume api_uploads (imagens de produtos)
#      - deploy/.env e .env da raiz (ENCRYPTION_KEY, senhas — sem eles os dados
#        criptografados viram ilegíveis pra sempre)
#      - deploy/certs/ (certificados mTLS do Banco Inter)
#   3. Envia tudo para o Google Drive via rclone (remote gcrypt:, já criptografado)
#   4. Apaga do Drive arquivos com mais de 30 dias
#
# PRÉ-REQUISITO: rclone instalado e remote gcrypt: configurado.
#   Guia completo de setup e restauração: deploy/BACKUP.md
#
# USO MANUAL:
#   cd /opt/santuarionerd && bash deploy/backup-drive.sh
#
# VARIÁVEIS DE AMBIENTE (opcionais):
#   BACKUP_DIR          Pasta local de backups (default: /opt/santuarionerd/backups)
#   BACKUP_REMOTE       Remote rclone de destino (default: gcrypt:)
#   REMOTE_RETAIN_DAYS  Retenção no Drive, em dias (default: 30)
#   EXTRAS_RETAIN_DAYS  Retenção local dos tar.gz extras, em dias (default: 7)
# =============================================================================

set -euo pipefail

# Cron roda com PATH mínimo — garante que docker e rclone sejam encontrados
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
REMOTE="${BACKUP_REMOTE:-gcrypt:}"
REMOTE_RETAIN_DAYS="${REMOTE_RETAIN_DAYS:-30}"
EXTRAS_RETAIN_DAYS="${EXTRAS_RETAIN_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$BACKUP_DIR/backup-drive.log"

mkdir -p "$BACKUP_DIR"

# Toda a saída vai para a tela E para o arquivo de log
exec > >(tee -a "$LOG_FILE") 2>&1

die() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERRO: $1" >&2
  exit 1
}

on_error() {
  local code=$?
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] === BACKUP PARA O DRIVE FALHOU (comando saiu com código $code) ===" >&2
}
trap on_error ERR

echo "[$(date '+%Y-%m-%d %H:%M:%S')] === Iniciando backup para o Google Drive ==="

# ── Checagens de pré-requisito ───────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || die "docker não encontrado no PATH."
command -v rclone >/dev/null 2>&1 || die "rclone não está instalado. Instale e configure seguindo o guia: deploy/BACKUP.md (seção 'Setup único do rclone')."

REMOTE_NAME="${REMOTE%%:*}"
rclone listremotes 2>/dev/null | grep -qx "${REMOTE_NAME}:" \
  || die "remote rclone '${REMOTE_NAME}:' não está configurado. Configure seguindo o guia: deploy/BACKUP.md (seção 'Setup único do rclone')."

# ── 1. Backup local (dumps PostgreSQL + MongoDB) ─────────────────────────────
echo "[$(date '+%H:%M:%S')] Etapa 1/4 — dumps locais via backup.sh..."
bash "$SCRIPT_DIR/backup.sh"

# ── 2. Tar.gz extra: uploads + .env + certificados ───────────────────────────
echo "[$(date '+%H:%M:%S')] Etapa 2/4 — empacotando uploads, .env e certificados..."

ENV_DEPLOY="$SCRIPT_DIR/.env"
ENV_ROOT="$PROJECT_DIR/.env"
CERTS_DIR="$SCRIPT_DIR/certs"

if [ ! -f "$ENV_DEPLOY" ] && [ ! -f "$ENV_ROOT" ]; then
  die "Nenhum .env encontrado ($ENV_DEPLOY ou $ENV_ROOT). Sem a ENCRYPTION_KEY o backup não serve pra restaurar a loja."
fi

# Descobre o nome real do volume de uploads (o compose prefixa com o nome do
# projeto, ex.: deploy_api_uploads) — primeiro pelo container, depois na lista
UPLOADS_VOLUME=$(docker inspect santuarionerd_api \
  --format '{{range .Mounts}}{{if eq .Destination "/app/wwwroot/uploads"}}{{.Name}}{{end}}{{end}}' 2>/dev/null || true)
if [ -z "$UPLOADS_VOLUME" ]; then
  UPLOADS_VOLUME=$(docker volume ls --format '{{.Name}}' | grep -E '(^|_)api_uploads$' | head -1 || true)
fi
[ -n "$UPLOADS_VOLUME" ] || die "Volume api_uploads não encontrado. O container santuarionerd_api está rodando?"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# Volume → tar.gz dentro do stage (container efêmero, montagem só leitura)
docker run --rm -v "${UPLOADS_VOLUME}:/data:ro" alpine \
  tar czf - -C /data . > "$STAGE/uploads.tar.gz"

mkdir -p "$STAGE/env"
if [ -f "$ENV_DEPLOY" ]; then cp "$ENV_DEPLOY" "$STAGE/env/deploy.env"; fi
if [ -f "$ENV_ROOT" ];   then cp "$ENV_ROOT"   "$STAGE/env/root.env";   fi
if [ -d "$CERTS_DIR" ]; then
  cp -a "$CERTS_DIR" "$STAGE/certs"
else
  echo "[$(date '+%H:%M:%S')] AVISO: $CERTS_DIR não existe — certificados do Inter NÃO incluídos neste backup"
fi

EXTRAS_FILE="$BACKUP_DIR/extras_${TIMESTAMP}.tar.gz"
tar czf "$EXTRAS_FILE" -C "$STAGE" .
EXTRAS_SIZE=$(du -sh "$EXTRAS_FILE" | cut -f1)
echo "[$(date '+%H:%M:%S')] Extras OK → $EXTRAS_FILE ($EXTRAS_SIZE)"

# Retenção local dos extras (a limpeza dos dumps já é feita pelo backup.sh)
REMOVED=$(find "$BACKUP_DIR" -name "extras_*.tar.gz" -mtime +"$EXTRAS_RETAIN_DAYS" -print -delete | wc -l)
if [ "$REMOVED" -gt 0 ]; then
  echo "[$(date '+%H:%M:%S')] $REMOVED tar.gz extra(s) local(is) com mais de $EXTRAS_RETAIN_DAYS dias removidos"
fi

# ── 3. Upload para o Google Drive ────────────────────────────────────────────
# rclone copy só envia o que mudou; o remote gcrypt: criptografa na saída
echo "[$(date '+%H:%M:%S')] Etapa 3/4 — enviando para o Drive (${REMOTE})..."
rclone copy "$BACKUP_DIR" "$REMOTE" \
  --include "postgres_*.sql.gz" \
  --include "mongo_*.archive.gz" \
  --include "extras_*.tar.gz" \
  -v

# ── 4. Retenção remota: apaga do Drive o que tem mais de N dias ──────────────
# ATENÇÃO: roda só dentro de $REMOTE (a pasta santuarionerd-backups do Drive)
echo "[$(date '+%H:%M:%S')] Etapa 4/4 — removendo do Drive arquivos com mais de ${REMOTE_RETAIN_DAYS} dias..."
rclone delete "$REMOTE" --min-age "${REMOTE_RETAIN_DAYS}d" -v

echo "[$(date '+%H:%M:%S')] Conteúdo atual da pasta de backups no Drive:"
rclone lsl "$REMOTE" || true

echo "[$(date '+%Y-%m-%d %H:%M:%S')] === Backup para o Google Drive concluído com sucesso ==="
