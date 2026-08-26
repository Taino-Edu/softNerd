# Integracao fiscal com o Tenant ERP

## Divisao dos dados

- Soft Nerd: venda, itens, cliente, estoque, caixa e financeiro.
- Tenant ERP: configuracao fiscal, A1, CSC, numeracao, XML, eventos e SEFAZ.
- Soft Nerd guarda uma referencia local da nota central para historico e permissao das telas.

Nao existe copia da venda no banco central. O que existe e um snapshot fiscal imutavel, necessario para emitir e repetir a mesma tentativa sem reler uma venda alterada.

## Outbox e idempotencia

Se o Tenant ERP estiver indisponivel, o fechamento da venda nao falha. O Soft Nerd grava o pedido na outbox da nota local com status `PendenteEmissao`. O job fiscal reenvia depois usando a mesma `idempotencyKey`; chamadas repetidas recebem a mesma nota central.

Quando o central aceita o pedido, o payload temporario local e apagado e permanece apenas `central_fiscal_note_id` e o resumo de status.

## Configuracao

As credenciais ficam somente no backend:

```text
TenantErp__Enabled=true
TenantErp__BaseUrl=https://TENANT.3esysten.com.br
TenantErp__ClientId=...
TenantErp__ClientSecret=...
TenantErp__UseCentralFiscalEngine=true
```

Ative `UseCentralFiscalEngine` somente depois de o cliente possuir os escopos `fiscal.read fiscal.write` e o schema fiscal central estar migrado.

## Operacao

Na pagina Admin > Fiscal, a faixa `Motor fiscal central ativo` confirma a virada. Configuracao do emitente e upload do A1 feitos nessa pagina sao enviados pelo backend ao Tenant ERP. Naturezas de operacao e NCM continuam no Soft Nerd porque fazem parte do cadastro dos produtos enviados no snapshot.

Documentos historicos emitidos pelo motor local continuam legiveis. Eles nao sao reenviados automaticamente ao central.
