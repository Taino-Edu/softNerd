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
# guarda uma cópia do .env, troca só a linha daquela chave e pede pra rodar o
# update.sh, que sobe a API nova com a chave sem tirar o site do ar.
#
# Só aceita as chaves da lista abaixo: chave de API nunca vai no appsettings.json
# (o repositório é público).
# =============================================================================

set -euo pipefail

ENV_FILE="/opt/santuarionerd/deploy/.env"
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

cp -p "$ENV_FILE" "$ENV_FILE.antes-$NOME-$(date +%Y%m%d%H%M%S)"
if grep -q "^$NOME=" "$ENV_FILE"; then
  # troca só a linha dessa chave (o valor vai por variável de ambiente pro awk, nunca pela linha de comando)
  CHAVE_NOVA="$VALOR" awk -v nome="$NOME" 'BEGIN{FS=OFS="="} $1==nome{print nome "=\"" ENVIRON["CHAVE_NOVA"] "\""; next} {print}' \
    "$ENV_FILE" > "$ENV_FILE.novo"
  cat "$ENV_FILE.novo" > "$ENV_FILE" && rm -f "$ENV_FILE.novo"
else
  printf '%s="%s"\n' "$NOME" "$VALOR" >> "$ENV_FILE"
fi
unset VALOR

echo "✓ $NOME gravada em $ENV_FILE (cópia do .env antigo ao lado)."
echo "Agora suba a API com a chave nova, sem tirar o site do ar:"
echo "  cd /opt/santuarionerd && nohup bash deploy/update.sh > /tmp/deploy.log 2>&1 & tail -f /tmp/deploy.log"
