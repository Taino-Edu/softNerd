#!/bin/bash
# =============================================================================
# configurar-chave.sh — grava uma chave de API no .env da VPS sem ela aparecer
# na tela, no histórico do terminal nem no git.
#
# USO (na VPS):
#   bash /opt/santuarionerd/deploy/configurar-chave.sh POKEMON_API_KEY
#   bash /opt/santuarionerd/deploy/configurar-chave.sh RIOT_API_KEY
#
# O script pede a chave (cole e dê Enter — não aparece nada enquanto digita),
# guarda uma cópia do .env em /root/env-backups (só o root lê), troca só a linha
# daquela chave e pede pra rodar o update.sh, que sobe a API nova com a chave
# sem tirar o site do ar.
#
# Só aceita as chaves da lista abaixo: chave de API nunca vai no appsettings.json
# (o repositório é público).
# =============================================================================

set -euo pipefail

ENV_FILE="/opt/santuarionerd/deploy/.env"
# Cópias do .env antigo: fora da pasta do repositório e só o root lê
BACKUP_DIR="/root/env-backups"
PERMITIDAS="POKEMON_API_KEY RIOT_API_KEY"

NOME="${1:-}"
if [[ -z "$NOME" || " $PERMITIDAS " != *" $NOME "* ]]; then
  echo "Uso: bash $0 <$(echo "$PERMITIDAS" | sed 's/ /|/g')>" >&2
  exit 1
fi
[[ -f "$ENV_FILE" ]] || { echo "Não achei $ENV_FILE" >&2; exit 1; }

read -rs -p "Cole a chave de $NOME e dê Enter: " VALOR
echo
VALOR="$(printf '%s' "$VALOR" | tr -d '[:space:]')"
[[ -n "$VALOR" ]] || { echo "Chave vazia — nada foi mudado." >&2; exit 1; }
[[ "$VALOR" != *[\"\'\$\`\\]* ]] || { echo "A chave tem caractere estranho (aspas, \$, \\) — confira e tente de novo." >&2; exit 1; }

# Tudo que esse script cria nasce privado (o .env tem senha e chave)
umask 077
mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR"
cp -p "$ENV_FILE" "$(mktemp "$BACKUP_DIR/env.antes-$NOME-$(date +%Y%m%d%H%M%S)-XXXX")"
# guarda só as 5 cópias mais recentes dessa chave
ls -1t "$BACKUP_DIR"/env.antes-"$NOME"-* 2>/dev/null | tail -n +6 | xargs -r rm -f

if grep -q "^$NOME=" "$ENV_FILE"; then
  # troca só a linha dessa chave (o valor vai por variável de ambiente pro awk, nunca pela linha de comando)
  TMP="$(mktemp "$BACKUP_DIR/env.novo.XXXXXX")"
  trap 'rm -f "$TMP"' EXIT
  CHAVE_NOVA="$VALOR" awk -v nome="$NOME" 'BEGIN{FS=OFS="="} $1==nome{print nome "=\"" ENVIRON["CHAVE_NOVA"] "\""; next} {print}' \
    "$ENV_FILE" > "$TMP"
  # cat por cima (não mv): o .env mantém dono e permissão de sempre
  cat "$TMP" > "$ENV_FILE"
else
  printf '%s="%s"\n' "$NOME" "$VALOR" >> "$ENV_FILE"
fi
unset VALOR

echo "✓ $NOME gravada em $ENV_FILE (cópia do .env antigo em $BACKUP_DIR)."
echo "Agora suba a API com a chave nova, sem tirar o site do ar:"
echo "  cd /opt/santuarionerd && nohup bash deploy/update.sh > /tmp/deploy.log 2>&1 & tail -f /tmp/deploy.log"
