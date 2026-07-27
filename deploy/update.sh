#!/bin/bash
# =============================================================================
# update.sh — Atualiza o SantuárioNerd no VPS com a última versão do GitHub
#
# USO:
#   bash /opt/santuarionerd/deploy/update.sh
# =============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_DIR="/opt/santuarionerd"

echo -e "${YELLOW}🔄 Atualizando SantuárioNerd...${NC}"

# Puxa última versão do GitHub
cd "$APP_DIR"
git pull origin main

# Copia .env para pasta deploy
cp "$APP_DIR/.env" "$APP_DIR/deploy/.env"

# Rebuild e redeploy — CACHEBUST força o Docker a recompilar o Next.js
cd "$APP_DIR/deploy"
docker compose -f docker-compose.prod.yml build --build-arg CACHEBUST="$(date +%s)"
docker compose -f docker-compose.prod.yml up -d

# Recria o nginx — nginx.conf/locations.conf entram como bind mount de ARQUIVO,
# que o Docker prende ao inode. O `git pull` não edita no lugar: escreve outro
# arquivo e renomeia por cima, gerando inode novo. O container continua preso ao
# antigo, então nem `up -d` (definição do serviço não mudou) nem `nginx -s reload`
# (o container sequer enxerga o arquivo novo) adiantam. Só recriando.
#
# Antes de recriar, valida a config num container descartável — esse sim pega o
# inode atual. Config quebrada aborta o deploy com o nginx antigo ainda no ar,
# em vez de derrubar o site num container que não sobe.
echo -e "${YELLOW}🔁 Validando nginx.conf...${NC}"
if docker run --rm \
    -v "$PWD/nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
    -v "$PWD/nginx/locations.conf:/etc/nginx/snippets/locations.conf:ro" \
    -v "$PWD/nginx/certs:/etc/nginx/certs:ro" \
    nginx:1.27-alpine nginx -t; then
    docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
    echo -e "${GREEN}   nginx recriado com a config atual${NC}"
else
    echo -e "${YELLOW}   ⚠️  nginx.conf inválido — deploy abortado, nginx anterior mantido no ar${NC}"
    exit 1
fi

# Limpa imagens antigas
docker image prune -f

echo -e "${GREEN}✅ Atualização concluída!${NC}"
docker compose -f docker-compose.prod.yml ps
