#!/bin/bash
# =============================================================================
# update.sh — Atualiza o SantuárioNerd no VPS com a última versão do GitHub
#
# USO:
#   bash /opt/santuarionerd/deploy/update.sh
#
# PELO CONSOLE WEB DA HOSTINGER, prefira soltar do terminal:
#   cd /opt/santuarionerd && nohup bash deploy/update.sh > /tmp/deploy.log 2>&1 &
#   tail -f /tmp/deploy.log
#
# O build passa de 3 minutos e o console web cai sozinho. Preso ao terminal, a
# queda manda SIGHUP e o script morre onde estiver — dá pra terminar com a imagem
# nova pronta e o `up -d` nunca executado, ou seja, container antigo no ar com
# cara de deploy concluído. Solto, o deploy segue no servidor e a queda só custa
# reabrir o tail. Se cair mesmo assim, rodar de novo é seguro: o script é
# idempotente e o cache do build deixa a segunda volta bem mais rápida.
# =============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_DIR="/opt/santuarionerd"

echo -e "${YELLOW}🔄 Atualizando SantuárioNerd...${NC}"

# Puxa a versão: a última do main ou, pra VOLTAR, a que for pedida:
#   bash deploy/update.sh            → último main
#   bash deploy/update.sh <commit>   → essa versão (sem argumento depois, volta pro main)
# (Antes a volta era "git checkout <commit> && update.sh", mas o git pull daqui
# trazia o main de novo e desfazia a volta sem avisar.)
cd "$APP_DIR"

# Backup dos bancos ANTES de qualquer mudança — pré-venda e vendas do site não
# podem se perder. Falhou o backup, não tem deploy (set -e). Roda com o site no ar
# (pg_dump e mongodump não travam ninguém). Fica em backups/, 7 dias.
# Pular só em emergência:  SEM_BACKUP=1 bash deploy/update.sh
if [ "${SEM_BACKUP:-0}" = "1" ]; then
    echo -e "${YELLOW}⚠️  SEM_BACKUP=1 — deploy sem backup antes${NC}"
else
    echo -e "${YELLOW}💾 Backup antes do deploy...${NC}"
    bash "$APP_DIR/deploy/backup.sh"
fi

git fetch origin
if [ -n "${1:-}" ]; then
    echo -e "${YELLOW}⏪ Voltando pra versão $1${NC}"
    git checkout --detach "$1"
else
    git checkout main
    git pull origin main
fi

# Copia .env para pasta deploy
cp "$APP_DIR/.env" "$APP_DIR/deploy/.env"

# Rebuild — CACHEBUST força o Docker a recompilar o Next.js. Enquanto constrói,
# o site segue no ar com as imagens antigas.
cd "$APP_DIR/deploy"
docker compose -f docker-compose.prod.yml build --build-arg CACHEBUST="$(date +%s)"

# Nginx primeiro: é ele que manda o tráfego pra cópia nova durante a troca, então a
# config nova tem que estar no ar antes.
#
# A pasta deploy/nginx/ é montada inteira em /etc/nginx/snippets (compose; o
# conf.d/default.conf é só a entrada fixa nginx/entrada.conf), então o container sempre
# enxerga os arquivos atuais: basta validar e dar "nginx -s reload", que troca a config
# sem derrubar nenhuma conexão. Config quebrada: o "nginx -t" falha, o reload não
# acontece, o deploy para e o nginx segue no ar com a config anterior.
#
# Uma vez só, na troca de montagem (antes era arquivo por arquivo, que prendia o
# container ao arquivo antigo): o nginx é recriado. Valida antes num container
# descartável e solta as portas em 3 s (stop_grace_period).
MONTAGENS_NGINX=$(docker inspect santuarionerd_nginx --format '{{range .Mounts}}{{println .Destination}}{{end}}' 2>/dev/null || true)
if echo "$MONTAGENS_NGINX" | grep -qx "/etc/nginx/snippets"; then
    echo -e "${YELLOW}🔁 Validando e recarregando o nginx...${NC}"
    if docker exec santuarionerd_nginx nginx -t; then
        docker exec santuarionerd_nginx nginx -s reload
        echo -e "${GREEN}   nginx recarregado com a config atual (sem parar)${NC}"
    else
        echo -e "${YELLOW}   ⚠️  config do nginx inválida — deploy abortado, nginx segue com a config anterior${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}🔁 nginx na montagem antiga — validando e recriando (uma vez só)...${NC}"
    if docker run --rm \
        -v "$PWD/nginx/entrada.conf:/etc/nginx/conf.d/default.conf:ro" \
        -v "$PWD/nginx:/etc/nginx/snippets:ro" \
        -v "$PWD/nginx/certs:/etc/nginx/certs:ro" \
        nginx:1.27-alpine nginx -t; then
        docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate nginx
        echo -e "${GREEN}   nginx recriado na montagem nova${NC}"
    else
        echo -e "${YELLOW}   ⚠️  config do nginx inválida — deploy abortado, nginx anterior mantido no ar${NC}"
        exit 1
    fi
fi

# Troca SEM tirar o site do ar (deploy/rollout.sh): a cópia nova sobe ao lado da
# antiga e só depois de saudável a antiga sai.
# Volta pro jeito antigo (derruba e sobe, ~15 s de site fora):  DEPLOY_AZUL_VERDE=0 bash deploy/update.sh
if [ "${DEPLOY_AZUL_VERDE:-1}" = "1" ]; then
    # Bancos e o resto: sobe o que estiver parado, sem recriar nada que está no ar
    docker compose -f docker-compose.prod.yml up -d --no-recreate
    bash rollout.sh api
    bash rollout.sh frontend
else
    echo -e "${YELLOW}⚠️  DEPLOY_AZUL_VERDE=0 — jeito antigo: recria tudo (site fora por alguns segundos)${NC}"
    docker compose -f docker-compose.prod.yml up -d
fi

# Limpa imagens antigas
docker image prune -f

echo -e "${GREEN}✅ Atualização concluída!${NC}"
docker compose -f docker-compose.prod.yml ps
