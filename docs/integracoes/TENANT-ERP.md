# Integracao com o Tenant-ERP

O Soft Nerd consome o Financeiro e o Fiscal do Tenant-ERP pelo backend. O
navegador nunca recebe o `client_secret` nem conversa diretamente com a API
externa.

## Configuracao

Crie no dominio da loja um cliente com os escopos necessarios. Para a primeira
homologacao, use somente `financeiro.read` e `fiscal.read`.

Configure no `.env` do servidor:

```dotenv
TENANT_ERP_ENABLED=true
TENANT_ERP_BASE_URL=https://loja.dominio-do-tenant-erp.com.br
TENANT_ERP_CLIENT_ID=ti_...
TENANT_ERP_CLIENT_SECRET=...
```

O `BASE_URL` precisa ser o dominio da loja. O Tenant-ERP compara o tenant
resolvido pelo host com o `tenant_id` da credencial.

## Diagnostico

- `GET /api/integrations/tenant-erp/status`: informa se a configuracao foi carregada.
- `POST /api/integrations/tenant-erp/test`: testa autenticacao, Financeiro e Fiscal.
- `GET /api/integrations/tenant-erp/financeiro`: proxy administrativo de leitura.
- `GET /api/integrations/tenant-erp/fiscal/saude`: proxy administrativo de leitura.

Todos os endpoints locais exigem login administrativo. O token externo fica em
memoria, e renovado antes de expirar e renovado uma vez apos um `401`. Erros do
servidor externo sao reduzidos a mensagens operacionais; respostas de erro e
segredos nunca sao repassados ao frontend.

## Entrada em producao

1. Validar leitura em homologacao.
2. Rotacionar o segredo e confirmar que o token antigo deixa de funcionar.
3. Testar indisponibilidade, timeout e tenant incorreto.
4. Definir qual sistema e a fonte oficial de cada dado antes de sincronizar.
5. Liberar escopos de escrita somente para fluxos idempotentes aprovados.
