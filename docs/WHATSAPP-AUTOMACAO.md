# Automação de WhatsApp — Evolution API + n8n

## O que decide cada parte

- **Evolution API** conecta o número por QR Code, recebe e envia mensagens.
- **n8n** mostra o fluxo visual, filtra eventos e encaminha respostas.
- **SoftNerd (.NET)** identifica o cliente, consulta reservas, calcula valores,
  cria/reutiliza o Pix no Inter e reconcilia o pagamento.
- **Banco Inter** continua sendo o único emissor da cobrança.

O n8n nunca recebe Client ID, Client Secret ou certificado do Inter. Ele recebe
somente o resultado que pode ser enviado ao cliente.

## Fluxo inicial

```text
WhatsApp do cliente
  -> Evolution API (MESSAGES_UPSERT)
  -> webhook do n8n
  -> filtro: ignora grupos, status e mensagens do próprio número
  -> POST interno /api/automation/whatsapp/message
  -> SoftNerd executa a regra
  -> n8n envia cada resposta pela Evolution API
  -> WhatsApp do cliente
```

Comandos disponíveis:

- `MENU` ou `OI`
- `RESERVAS`
- `PIX` ou `PIX 1`, `PIX 2` quando houver vários grupos
- `PAGO`
- `PONTOS`
- `ATENDENTE`
- `BOT` para reativar a automação antes do fim da pausa

Ao receber `PIX`, o SoftNerd:

1. identifica o cadastro pelo telefone normalizado;
2. localiza pré-vendas ativas do cliente;
3. reaproveita uma cobrança ativa, se existir;
4. calcula o valor novamente a partir dos itens reservados;
5. chama `InterSyncService.CriarCobrancaAsync`;
6. grava a cobrança vinculada ao grupo e aos itens;
7. devolve o código Pix copia e cola ao n8n.

Ao receber `PAGO`, o SoftNerd consulta o Inter pelo mesmo
`IPixReconciliationService` usado pelo robô de reconciliação periódico.

## Primeiro deploy

1. Preencher as novas variáveis em `/opt/santuarionerd/deploy/.env`:

   - `EVOLUTION_API_KEY`
   - `EVOLUTION_INSTANCE_NAME`
   - `EVOLUTION_DATABASE_URI`
   - `WHATSAPP_AUTOMATION_API_KEY`
   - `N8N_ENCRYPTION_KEY`

   Gere as três chaves com `openssl rand -hex 32`. Na URI do PostgreSQL, a senha
   precisa estar em URL encoding (`#` vira `%23`, `@` vira `%40`).

2. Subir os serviços:

   ```bash
   docker compose -f docker-compose.prod.yml --profile whatsapp up -d
   ```

   O perfil separado é intencional: o deploy normal do site não inicia nem
   reinicia Evolution, n8n e Redis. Assim uma falha no WhatsApp não derruba as
   comandas. Para atualizar apenas a API do site, continue usando o deploy normal.

3. Criar a instância e obter o QR Code no próprio VPS:

   ```bash
   source .env
   curl -sS -X POST http://127.0.0.1:8080/instance/create \
     -H "apikey: $EVOLUTION_API_KEY" \
     -H "Content-Type: application/json" \
     -d "{\"instanceName\":\"${EVOLUTION_INSTANCE_NAME:-santuarionerd}\",\"qrcode\":true,\"integration\":\"WHATSAPP-BAILEYS\",\"groupsIgnore\":true,\"readMessages\":false,\"readStatus\":false,\"syncFullHistory\":false}"
   ```

   A resposta contém `qrcode.base64`. Abra essa data URI em um navegador e, no
   aparelho do Maikon, use **WhatsApp > Aparelhos conectados > Conectar aparelho**.

   Se precisar gerar outro QR:

   ```bash
   curl -sS "http://127.0.0.1:8080/instance/connect/${EVOLUTION_INSTANCE_NAME:-santuarionerd}" \
     -H "apikey: $EVOLUTION_API_KEY"
   ```

4. Abrir `https://santuarionerd.com.br/automacao/` e criar a conta proprietária
   do n8n. Use senha forte e guarde-a fora do repositório.

5. Importar o workflow montado no container:

   ```bash
   docker compose -f docker-compose.prod.yml --profile whatsapp exec n8n \
     n8n import:workflow --input=/workflows/softnerd-whatsapp.json
   ```

6. No editor do n8n, abrir **SoftNerd — Atendimento WhatsApp**, testar e ativar.
   O webhook de produção só responde enquanto o workflow estiver ativo.

## Gestão do fluxo

O editor do n8n mostra quatro blocos:

1. `Evolution Webhook` — entrada;
2. `Normalizar e filtrar` — converte o webhook em telefone/texto;
3. `Consultar SoftNerd` — executa as regras seguras no backend;
4. `Responder no WhatsApp` — envia as respostas.

Quando o cliente digita `ATENDENTE`, o SoftNerd avisa o admin e pausa o robô
naquela conversa por quatro horas. Mensagens enviadas pelo próprio Maikon são
ignoradas pelo filtro `fromMe`, evitando disputa entre humano e automação.

Textos financeiros e cálculos devem ser alterados no backend. No n8n podem ser
adicionados horários, espera, aviso interno, planilhas, IA para dúvidas gerais e
encaminhamento humano, sem colocar geração de Pix dentro de um nó editável.

## Operação segura

- Começar com número secundário e poucos usuários autorizados.
- Não usar disparos em massa.
- Manter intervalos entre mensagens.
- Pausar o workflow antes de atualizar a Evolution API.
- Fazer backup de `postgres_data`, `n8n_data` e `evolution_instances`.
- Nunca expor a porta 8080 publicamente; ela está vinculada a `127.0.0.1`.
- Se o WhatsApp desconectar, o site, reservas, Pix e reconciliação continuam
  funcionando normalmente; apenas o canal de conversa fica indisponível.

Evolution/Baileys não é uma API oficial do WhatsApp e pode sofrer desconexão ou
bloqueio. A separação acima permite migrar futuramente para a Cloud API sem
reescrever as regras financeiras.
