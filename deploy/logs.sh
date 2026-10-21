#!/bin/bash
# =============================================================================
# logs.sh — procura um texto nos logs da API/front: o container no ar + os guardados
#
# USO (na VPS, de dentro de deploy/):
#   bash logs.sh "texto"                 # api, últimos 7 dias
#   bash logs.sh "texto" --dias 30       # mais pra trás
#   bash logs.sh "texto" --servico frontend
#   bash logs.sh --erros                 # só fail/crit/exceções, últimos 7 dias
#
# Os guardados vêm do rollout.sh (antes de apagar um container, o log vai pra
# $LOGS_DIR, 30 dias). Cada linha sai com a origem: [no ar] ou o nome do arquivo.
# Hora sempre em UTC (Brasília = UTC−3).
# =============================================================================

set -uo pipefail

LOGS_DIR="${LOGS_DIR:-/var/log/santuarionerd}"
SERVICO="api"
DIAS=7
TEXTO=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dias)    DIAS="${2:?--dias precisa de um número}"; shift 2 ;;
    --servico) SERVICO="${2:?--servico precisa de api ou frontend}"; shift 2 ;;
    --erros)   TEXTO='fail:|crit:|Unhandled|Exception'; shift ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *)         TEXTO="$1"; shift ;;
  esac
done
[ -z "$TEXTO" ] && { sed -n '2,15p' "$0"; exit 1; }

cd "$(dirname "$0")"
COMPOSE=(docker compose -f docker-compose.prod.yml)

echo "== procurando \"$TEXTO\" em $SERVICO (últimos $DIAS dias)"

for id in $("${COMPOSE[@]}" ps -q "$SERVICO" 2>/dev/null); do
  docker logs --timestamps --since "${DIAS}d" "$id" 2>&1 | grep -E -i -- "$TEXTO" | sed "s/^/[no ar ${id:0:12}] /"
done

if [ -d "$LOGS_DIR" ]; then
  find "$LOGS_DIR" -name "$SERVICO-*.log.gz" -mtime -"$DIAS" -print0 2>/dev/null | sort -z | \
    while IFS= read -r -d '' arq; do
      zgrep -E -i -- "$TEXTO" "$arq" | sed "s|^|[$(basename "$arq" .log.gz)] |"
    done
else
  echo "(ainda não há logs guardados em $LOGS_DIR — eles começam no próximo deploy)"
fi
