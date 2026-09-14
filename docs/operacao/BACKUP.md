# Backup — Santuário Nerd

Guia do backup automático da loja para o Google Drive. O objetivo: se a VPS pegar
fogo, ser invadida ou apagada sem querer, você não perde nada — comandas, clientes,
cadastros, imagens de produtos e as chaves que destravam os dados criptografados.

**Como funciona:** todo dia às 03:47 a VPS roda o `deploy/backup-drive.sh`, que
gera os backups locais e envia uma cópia **criptografada** para o Google Drive de
um e-mail criado só pra isso. O Drive guarda 30 dias de histórico; o disco da VPS
guarda 7 dias (rede de segurança local).

---

## 1. O que é backupeado e onde fica

| O quê | Pra que serve | Onde fica |
|---|---|---|
| `postgres_AAAAMMDD_HHMMSS.sql.gz` | Banco principal: comandas, clientes, usuários, produtos | VPS (7 dias) + Drive (30 dias) |
| `mongo_AAAAMMDD_HHMMSS.archive.gz` | Cache de cartas TCG (Pokémon, MTG…) | VPS (7 dias) + Drive (30 dias) |
| `extras_AAAAMMDD_HHMMSS.tar.gz` | Imagens de produtos (volume `api_uploads`) + `.env` (senhas e `ENCRYPTION_KEY`) + certificados do Banco Inter (`deploy/certs/`) | VPS (7 dias) + Drive (30 dias) |

- **Local (VPS):** `/opt/santuarionerd/backups/` — feito pelo `deploy/backup.sh`,
  que continua existindo e é chamado pelo backup do Drive. É a rede de segurança
  caso a internet ou o Google falhem na hora do envio.
- **Remoto (Google Drive):** pasta `santuarionerd-backups/` no Drive do e-mail
  criado pros backups, através do remote rclone `gcrypt:`, que **criptografa os
  arquivos antes de saírem da VPS** — no Google aparecem nomes e conteúdos
  embaralhados; nem o Google consegue ler.

> **⚠️ ATENÇÃO — LEIA ISSO COM CARINHO**
>
> A criptografia é o que protege os dados no Drive, mas tem um preço: **sem a
> senha do remote `gcrypt` e sem o arquivo `rclone.conf`, NINGUÉM — nem você —
> consegue ler os backups.**
>
> Quando terminar o setup (seção 2), guarde fora da VPS, num lugar seguro
> (cofre de senhas tipo Bitwarden/1Password, pendrive, papel na gaveta):
>
> 1. **A senha que você inventou para o `gcrypt`** (e a segunda senha, se criou uma);
> 2. **Uma cópia do `rclone.conf`** da VPS — normalmente em
>    `/root/.config/rclone/rclone.conf` (rode `rclone config file` pra descobrir).
>
> Perdeu os dois = backups viram lixo ilegível pra sempre.

---

## 2. Setup único do rclone (faz uma vez só)

A VPS não tem navegador, então o login no Google é feito em duas partes: você
autoriza num PC com navegador e cola o resultado na VPS. Precisa de uns 15 minutos.

### 2.1 Instalar o rclone na VPS

```bash
curl https://rclone.org/install.sh | sudo bash
rclone version   # confirma que instalou
```

### 2.2 No seu PC (com navegador): gerar o token do Google

1. Baixe o rclone pro seu PC em <https://rclone.org/downloads/> e descompacte.
2. No terminal do PC, rode:

   ```bash
   rclone authorize "drive"
   ```

3. Abre uma página do Google no navegador. Entre com **o e-mail criado só para
   os backups** e autorize o acesso ao Drive.
4. O terminal do PC mostra um bloco de texto (`{"access_token":...}`).
   **Copie o bloco inteiro** — você vai colar na VPS no próximo passo.

### 2.3 Na VPS: criar o remote `gdrive`

```bash
rclone config
```

Responda assim:

1. `n` — novo remote
2. Nome: **`gdrive`**
3. Tipo de storage: escolha **`drive`** (Google Drive — o número varia conforme a versão)
4. `client_id` e `client_secret`: deixe **em branco** (Enter nos dois)
5. Escopo: **`1`** (acesso total ao Drive — necessário pro backup funcionar)
6. `service_account_file`: em branco (Enter)
7. "Edit advanced config?": **`n`**
8. "Use auto config?": **`n`** ← importante, a VPS não tem navegador
9. Ele pede o resultado do `rclone authorize`: **cole o bloco copiado no PC** e dê Enter
10. "Configure this as a Shared Drive (Team Drive)?": **`n`**
11. Confirme com **`y`** e saia com **`q`**

### 2.4 Na VPS: criar o remote `gcrypt` (a camada de criptografia)

De novo:

```bash
rclone config
```

1. `n` — novo remote
2. Nome: **`gcrypt`** ← tem que ser exatamente este nome, o script procura por ele
3. Tipo de storage: **`crypt`** (criptografa outro remote)
4. `remote`: **`gdrive:santuarionerd-backups`** ← é a pasta que vai guardar os backups
5. `filename_encryption`: **`1`** (padrão — embaralha também os nomes dos arquivos)
6. `directory_name_encryption`: **`1`** (padrão)
7. "Password or leave blank to generate": **`y`** — **invente uma senha forte e
   anote ela AGORA no cofre de senhas** (ela NÃO fica legível em lugar nenhum)
8. Segunda senha (`password2`): pode deixar em branco (Enter)
9. "Edit advanced config?": **`n`**, confirme com **`y`**, saia com **`q`**

### 2.5 Testar se ficou certo

```bash
rclone listremotes          # tem que mostrar:  gdrive:   e   gcrypt:
rclone lsd gcrypt:          # lista a pasta no Drive (vazia no começo — sem erro é o que importa)
echo teste > /tmp/teste.txt && rclone copy /tmp/teste.txt gcrypt:
rclone lsl gcrypt:          # tem que listar o teste.txt
rclone delete gcrypt:teste.txt
```

### 2.6 Guardar os segredos offline (não pule!)

Copie pra fora da VPS o arquivo de config (ele contém o token do Google e as
senhas do crypt ofuscadas):

```bash
rclone config file          # mostra o caminho, ex.: /root/.config/rclone/rclone.conf
```

Baixe esse arquivo pro seu PC/cofre (com `scp`, por exemplo) e guarde junto com
a senha do `gcrypt`. Sem isso, os backups do Drive são ilegíveis — releia o aviso
da seção 1.

---

## 3. Instalar o agendamento diário (cron)

Depois do setup do rclone, rode **com o mesmo usuário que configurou o rclone**
(recomendado: `root` — a config dele fica em `/root/.config/rclone/`):

```bash
sudo bash /opt/santuarionerd/deploy/install-backup-cron.sh
```

Ele cria a entrada `47 3 * * *` no cron (todo dia às 03:47) e é idempotente:
rodar de novo não duplica. O próprio instalador mostra como verificar
(`crontab -l`) e como remover.

> Não instale o cron antigo sugerido no comentário do `backup.sh` junto com este —
> o `backup-drive.sh` já chama o `backup.sh`, e os dumps rodariam em dobro.

---

## 4. Rodar manualmente e ver os logs

Rodar agora (não atrapalha o agendamento):

```bash
cd /opt/santuarionerd && bash deploy/backup-drive.sh
```

Acompanhar o log (o script grava tudo, inclusive as execuções do cron):

```bash
tail -f /opt/santuarionerd/backups/backup-drive.log
```

Se algo falhar, o script para na hora, sai com código de erro e grava
`FALHOU` no log — procure a linha `ERRO:` pra saber o motivo.

---

## 5. Como restaurar (o dia em que precisar)

Cenário típico: VPS nova (ou dados apagados), loja reinstalada pelo
`deploy/setup.sh`, containers no ar. Os comandos abaixo rodam na VPS.

### 5.0 Se a VPS for nova: reconfigurar o rclone antes

Sem o `rclone.conf` guardado, o remote `gcrypt` não existe na VPS nova. Por isso
a seção 2.6 manda guardar o arquivo. Restaure ele no caminho original
(ex.: `/root/.config/rclone/rclone.conf`) — ou refaça a seção 2 **com a MESMA
senha do crypt**.

### 5.1 Baixar os arquivos do Drive (já saem descriptografados)

```bash
mkdir -p /tmp/restore && cd /tmp/restore
rclone lsl gcrypt:                                  # lista tudo que tem no Drive
rclone copy gcrypt: . --max-age 2d                  # baixa só os mais recentes
# ou baixe um arquivo específico:
# rclone copyto gcrypt:postgres_20260718_034700.sql.gz ./postgres_20260718_034700.sql.gz
```

### 5.2 Restaurar `.env` e certificados (faça ANTES dos bancos)

```bash
cd /tmp/restore
tar xzf extras_AAAAMMDD_HHMMSS.tar.gz     # use o nome real do arquivo
cp env/deploy.env /opt/santuarionerd/deploy/.env
cp env/root.env   /opt/santuarionerd/.env        # se o arquivo existir
cp -a certs /opt/santuarionerd/deploy/certs
chmod 600 /opt/santuarionerd/deploy/.env /opt/santuarionerd/.env
```

A `ENCRYPTION_KEY` do `.env` é o que destrava os dados criptografados no banco
(client secret do Inter etc.). Restaurar o banco sem o `.env` certo = dados
ilegíveis.

### 5.3 Restaurar as imagens de produtos (volume `api_uploads`)

```bash
cd /tmp/restore
VOL=$(docker volume ls --format '{{.Name}}' | grep api_uploads | head -1)
docker run --rm -v "$VOL":/data -v /tmp/restore:/restore alpine \
  sh -c 'tar xzf /restore/uploads.tar.gz -C /data'
```

### 5.4 Restaurar o PostgreSQL

O dump é **SQL puro** compactado — restaura com `psql` (não com `pg_restore`).
Se o banco já tiver dados e você quiser recomeçar do zero, recrie-o primeiro:

```bash
# (opcional — só se quiser zerar o banco atual antes de restaurar)
docker exec santuarionerd_postgres psql -U cardgame_user -d postgres \
  -c "DROP DATABASE cardgamestore WITH (FORCE);" \
  -c "CREATE DATABASE cardgamestore;"

gunzip -c /tmp/restore/postgres_AAAAMMDD_HHMMSS.sql.gz | \
  docker exec -i santuarionerd_postgres psql -U cardgame_user -d cardgamestore
```

### 5.5 Restaurar o MongoDB

```bash
cd /opt/santuarionerd/deploy && set -a && source .env && set +a   # carrega MONGO_USER/MONGO_PASSWORD
docker exec -i santuarionerd_mongo mongorestore \
  --username "$MONGO_USER" --password "$MONGO_PASSWORD" \
  --authenticationDatabase admin --archive --gzip --drop \
  < /tmp/restore/mongo_AAAAMMDD_HHMMSS.archive.gz
```

(O Mongo é só cache de cartas — na pior das hipóteses ele se repopula sozinho.)

### 5.6 Subir tudo de novo

```bash
cd /opt/santuarionerd/deploy
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f api   # confere se subiu sem erro
```

---

## 6. Estrutura dos arquivos de backup

```
/opt/santuarionerd/backups/
├── postgres_AAAAMMDD_HHMMSS.sql.gz      # dump do banco principal
├── mongo_AAAAMMDD_HHMMSS.archive.gz     # dump do cache de cartas
├── extras_AAAAMMDD_HHMMSS.tar.gz        # o que os dumps não cobrem:
│   ├── uploads.tar.gz                   #   volume api_uploads (imagens)
│   ├── env/deploy.env                   #   deploy/.env
│   ├── env/root.env                     #   /opt/santuarionerd/.env
│   └── certs/                           #   certificados mTLS do Inter
└── backup-drive.log                     # log de todas as execuções
```

No Drive (`santuarionerd-backups/`) ficam os mesmos três tipos de arquivo, com
nomes embaralhados pelo `gcrypt`, mantidos por 30 dias.

## 7. Referência rápida

| Tarefa | Comando |
|---|---|
| Rodar backup agora | `bash /opt/santuarionerd/deploy/backup-drive.sh` |
| Ver log | `tail -f /opt/santuarionerd/backups/backup-drive.log` |
| Ver o que tem no Drive | `rclone lsl gcrypt:` |
| Verificar o cron | `crontab -l` |
| Remover o cron | `crontab -l \| grep -v 'backup-drive.sh' \| crontab -` |
| Trocar a retenção do Drive | editar `REMOTE_RETAIN_DAYS` no topo do `backup-drive.sh` |
