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

# Recarrega o nginx — nginx.conf/locations.conf entram por bind mount, então o
# Compose NÃO recria o container quando só o arquivo muda (a definição do
# serviço continua igual) e o nginx segue com a config antiga em memória.
# Valida antes de recarregar: com config quebrada o reload falha e o nginx
# continua servindo a versão boa, em vez de derrubar o site.
echo -e "${YELLOW}🔁 Recarregando nginx...${NC}"
if docker compose -f docker-compose.prod.yml exec -T nginx nginx -t; then
    docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload
    echo -e "${GREEN}   nginx recarregado${NC}"
else
    echo -e "${YELLOW}   ⚠️  nginx.conf inválido — reload abortado, config anterior mantida${NC}"
    exit 1
fi

# Limpa imagens antigas
docker image prune -f

echo -e "${GREEN}✅ Atualização concluída!${NC}"
docker compose -f docker-compose.prod.yml ps
