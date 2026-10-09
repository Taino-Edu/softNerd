#!/bin/bash
# =============================================================================
# rollout.sh — troca um serviço (api ou frontend) sem tirar o site do ar
#
# USO (de dentro de deploy/, com a imagem nova já construída):
#   bash rollout.sh api
#   bash rollout.sh frontend
#
# Como funciona (azul-verde com uma cópia ao lado):
#   1. sobe UMA cópia nova do serviço ao lado da que está no ar (--scale 2 --no-recreate)
#   2. pergunta à nova (/health da api, /manifest.json do front) até responder
#      - não ficou em LIMITE_SAUDE segundos → apaga a nova e para: a antiga segue no ar
#   3. espera o nginx enxergar a nova (resolver do Docker, valid=5s no nginx.conf)
#   4. desliga a antiga com SIGTERM: ela termina o que está fazendo (até 30 s,
#      stop_grace_period) e o nginx manda o resto pra nova (proxy_next_upstream)
#
# Por que o limite de saúde é curto (45 s): os robôs da API (Pix, NFC-e, avisos do
# crediário…) esperam no mínimo 1 minuto depois de subir antes da primeira volta.
# Trocando em menos de 1 minuto, as duas cópias nunca rodam robô ao mesmo tempo.
# Robô novo com espera menor que 1 minuto quebra essa garantia — o teste
# TodoRobo_EsperaPeloMenos1MinutoAntesDaPrimeiraVolta falha.
#
# Se a troca falhar no meio, rodar de novo é seguro: começa sempre do estado atual.
# =============================================================================

set -euo pipefail

SERVICO="${1:?uso: bash rollout.sh <api|frontend>}"
COMPOSE=(docker compose -f docker-compose.prod.yml)
# As duas cópias rodam juntas por no máximo LIMITE_SAUDE + ESPERA_DNS = 52 s antes da antiga
# receber o SIGTERM (que para os robôs dela na hora). Tem que ficar abaixo de 60 s: é quanto
# o robô mais apressado (Pix) da cópia nova espera antes da 1ª volta.
LIMITE_SAUDE=45      # segundos pra cópia nova responder
ESPERA_DNS=7         # > valid=5s do resolver (o update.sh recria o nginx ANTES do rollout)

AMARELO='\033[1;33m'; VERDE='\033[0;32m'; VERMELHO='\033[0;31m'; NC='\033[0m'
log() { echo -e "${AMARELO}[rollout $SERVICO]${NC} $*"; }

ANTIGOS=$("${COMPOSE[@]}" ps -q "$SERVICO")
QTD_ANTIGOS=$(echo "$ANTIGOS" | grep -c . || true)

if [ "$QTD_ANTIGOS" -eq 0 ]; then
  log "nenhuma cópia no ar — subindo direto (primeira vez)"
  "${COMPOSE[@]}" up -d --no-deps "$SERVICO"
  exit 0
fi
if [ "$QTD_ANTIGOS" -gt 1 ]; then
  # Sobra de uma troca interrompida: fica a mais nova (que já passou na saúde ou não),
  # o resto sai. Sem isso o --scale abaixo não criaria cópia nova.
  log "$QTD_ANTIGOS cópias no ar (troca anterior interrompida) — mantendo só a mais nova"
  MAIS_NOVA=$(docker inspect --format '{{.Created}} {{.Id}}' $ANTIGOS | sort | tail -1 | cut -d' ' -f2)
  for id in $ANTIGOS; do
    if [ "$id" != "$MAIS_NOVA" ]; then
      docker stop -t 30 "$id" >/dev/null || true
      docker rm "$id" >/dev/null || true
    fi
  done
  ANTIGOS=$("${COMPOSE[@]}" ps -q "$SERVICO")
fi

log "subindo a cópia nova ao lado da antiga…"
"${COMPOSE[@]}" up -d --no-deps --no-recreate --scale "$SERVICO=2" "$SERVICO"

NOVO=$("${COMPOSE[@]}" ps -q "$SERVICO" | grep -v -F "$ANTIGOS" || true)
if [ -z "$NOVO" ]; then
  echo -e "${VERMELHO}[rollout $SERVICO] a cópia nova não apareceu — nada foi trocado${NC}"
  exit 1
fi

# Pergunta direto à cópia nova, a cada segundo. Não usa o healthcheck do compose: ele
# roda a cada 30 s, então a 1ª resposta só viria aos 30 s e uma falha empurraria pra 60.
case "$SERVICO" in
  api)      SONDA=(curl -sf -o /dev/null http://localhost:5000/health) ;;
  # O Next escuta no IP do container (HOSTNAME), não em 127.0.0.1
  frontend) SONDA=(sh -c 'wget -q -O /dev/null "http://$(hostname):3000/manifest.json"') ;;
  *)        echo "serviço sem sonda de saúde: $SERVICO"; exit 1 ;;
esac

log "esperando a nova ficar saudável (até ${LIMITE_SAUDE}s)…"
ESTADO="subindo"
for ((i = 1; i <= LIMITE_SAUDE; i++)); do
  if [ "$(docker inspect --format '{{.State.Running}}' "$NOVO")" != "true" ]; then
    ESTADO="parou"; break
  fi
  if docker exec "$NOVO" "${SONDA[@]}" >/dev/null 2>&1; then
    ESTADO="healthy"; break
  fi
  sleep 1
done

if [ "$ESTADO" != "healthy" ]; then
  echo -e "${VERMELHO}[rollout $SERVICO] a cópia nova não ficou saudável ($ESTADO) — desfazendo; a antiga continua no ar${NC}"
  docker logs --tail 40 "$NOVO" || true
  docker stop -t 10 "$NOVO" >/dev/null || true
  docker rm "$NOVO" >/dev/null || true
  exit 1
fi
log "nova saudável em ~${i}s"

log "esperando o nginx enxergar a nova (${ESPERA_DNS}s)…"
sleep "$ESPERA_DNS"

for id in $ANTIGOS; do
  log "desligando a antiga ${id:0:12} (termina o que está fazendo, até 30s)…"
  docker stop -t 30 "$id" >/dev/null
  docker rm "$id" >/dev/null
done

echo -e "${VERDE}[rollout $SERVICO] trocado sem tirar do ar${NC}"
