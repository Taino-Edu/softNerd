# Correções no motor fiscal (NFC-e) — softNerd, 2026-07-21

Registro de tudo que foi corrigido no `NfceEmissionService`/`FiscalController` nesta
sessão. **Confirmado que o repo `Tenant-ERP_Model` (multitenant) tem os MESMOS 4 bugs**
— mesmo código-base, mesmos arquivos, mesmas linhas. Precisa portar tudo abaixo pra lá
também antes de qualquer cliente do multitenant emitir nota de verdade.

Todos os commits abaixo estão em `softNerd` branch `main`.

---

## 1. Certificado A1 nunca emitia de verdade (o mais grave)

**Commit:** `a8b7a84` — `CardGameStore/Services/Implementations/NfceEmissionService.cs`

**Sintoma:** `System.Exception: Para Certificado A1 o Senha não deve ser informada!`
mesmo com CNPJ/senha corretos, sempre que tentava emitir de verdade (Homologação ou
Produção) — só o Modo Simulação "funcionava" porque nunca chega nesse código.

**Causa raiz:** `ConfiguracaoCertificado.TipoCertificado` nunca era setado. O padrão da
lib é `A1Repositorio` (certificado instalado no repositório do Windows, sem senha) — e
o setter de `Senha` valida contra o tipo já configurado, lançando erro se o tipo for
Repositorio. O sistema sempre guarda o `.pfx` como bytes no Postgres (upload pelo
formulário), nunca no repositório do Windows.

**Fix:** setar `TipoCertificado = TipoCertificado.A1ByteArray` ANTES de
`ArrayBytesArquivo`/`Senha` no objeto `ConfiguracaoCertificado`, em
`AbrirConfiguracaoSefazAsync()`.

```csharp
var cfgCertificado = new ConfiguracaoCertificado
{
    TipoCertificado    = TipoCertificado.A1ByteArray,
    ArrayBytesArquivo  = pfxBytes,
    Senha              = senha,
};
```

**No Tenant-ERP_Model:** `CardGameStore/Services/Implementations/NfceEmissionService.cs:406`
tem o MESMO `new ConfiguracaoCertificado { ArrayBytesArquivo = pfxBytes, Senha = senha }`
sem `TipoCertificado`. Idêntico ao bug daqui — vai dar o mesmo erro pra qualquer tenant
que tentar emitir de verdade.

---

## 2. Campo NCM travava no ponto + ia sem sanitizar pra SEFAZ

**Commits:** `62cf2ba` (backend) — `NfceEmissionService.cs`, `frontend/app/admin/estoque/page.tsx`

**Sintoma 1 (frontend):** campo NCM tinha `maxLength={8}` mas placeholder pedia formato
com ponto (`0000.00.00`, 10 caracteres) — travava em "8474.31." antes dos 2 últimos dígitos.

**Sintoma 2 (backend, mais grave):** o NCM ia direto pro XML sem tirar pontuação. A XSD
da NFC-e exige exatamente 8 dígitos numéricos — NCM salvo com ponto faz a SEFAZ rejeitar
a nota.

**Fix:**
- Frontend: `onChange` agora filtra só dígitos e limita a 8 (`e.target.value.replace(/\D/g, '').slice(0, 8)`).
- Backend: `SanitizeNcm(string? ncm)` (remove tudo que não é dígito) aplicado antes de
  montar `ItemFiscal.Ncm`, com validação de exatamente 8 dígitos em
  `CarregarDadosComandaAsync`/`CarregarDadosVendaAvulsaAsync` (lança
  `FiscalNaoConfiguradoException` com mensagem clara se não bater).

**No Tenant-ERP_Model:** não tem `SanitizeNcm` nem essa validação — mesmo risco.
Verificar também o campo NCM no formulário de produto lá (provavelmente o mesmo
placeholder com ponto).

---

## 3. CFOP sem sanitização — mesma classe de bug do NCM

**Commit:** `bb5b12e` — `NfceEmissionService.cs`, `frontend/app/admin/fiscal/page.tsx`

**Sintoma:** `CFOP = int.Parse(item.Cfop)` cru — CFOP mal digitado (espaço, ponto)
lançava `FormatException` sem explicação nenhuma pro admin, derrubando a emissão.

**Fix:** `ParseCfop(string? cfop)` — sanitiza (só dígitos) e valida exatamente 4 dígitos
antes de mandar pra SEFAZ, com mensagem clara se não bater. Campo do formulário
(Admin > Fiscal > Naturezas de Operação) também passa a filtrar só dígitos, máx 4.

**No Tenant-ERP_Model:** mesmo risco, não verificado ainda se o campo CFOP lá tem
alguma sanitização — provavelmente não, dado que segue o mesmo padrão do NCM.

---

## 4. Desconto e pontos de fidelidade nunca entravam na nota (bug mais sério de todos em termos de valor $)

**Commit:** `da9e141` — `NfceEmissionService.cs`

**Sintoma:** toda NFC-e saía pelo valor BRUTO da soma dos itens, ignorando qualquer
desconto (`Comanda.DiscountInCents`/`VendaAvulsa.DiscountInCents`) ou pontos de
fidelidade resgatados (`Comanda.PointsApplied`). `vDesc` sempre zero, `vNF` sempre o
valor cheio. Exemplo: comanda de R$50 com R$10 de desconto (cliente pagou R$40) →
nota saía declarando R$50.

**Fix:** `DadosEmissao` ganhou `TotalCentavos` (valor realmente cobrado, já líquido —
vem de `Comanda.TotalInCents`/`VendaAvulsa.TotalInCents`). A nota agora declara `vProd`
(bruto dos itens) e `vDesc` (a diferença) separados, com `vNF` = valor líquido de
verdade. Split de pagamento (`MontarDetPag`) também passou a usar o total líquido.

**No Tenant-ERP_Model:** `NfceEmissionService.cs:530` tem `vDesc = 0` fixo — mesmo bug,
mesma gravidade. Esse é o que eu mais recomendo priorizar lá, porque é o único que gera
divergência de VALOR declarado à Receita (os outros são de rejeição/travamento, esse é
de nota saindo com valor errado mesmo quando é aceita).

---

## 5. Exportar XMLs pro contador falhava com início = fim (mesmo dia)

**Commit:** `711423d` — `FiscalController.cs`

**Sintoma:** selecionar a mesma data em "Início" e "Fim" (o caso mais comum — "baixar só
hoje") dava erro 400. Mesmo se passasse, o "fim" era tratado como limite EXCLUSIVO
(antes da meia-noite daquele dia) — o dia inteiro selecionado nunca entrava no ZIP.

**Fix:** validação agora só rejeita `fim < inicio` (não `<=`), e soma 1 dia ao fim antes
de passar pro `GerarZipAsync`, tratando o campo como o ÚLTIMO DIA a incluir (inclusivo).

**No Tenant-ERP_Model:** `FiscalController.cs:445` tem `if (fim <= inicio)` — mesmo bug.

---

## Testes adicionados (só no softNerd por enquanto)

`tests/unit/CardGameStore.Tests/Services/NfceEmissionServiceTests.cs` ganhou:
- `SanitizeNcm_RemoveTudoQueNaoEDigito` / `SanitizeNcm_ForaDe8Digitos_NaoEhValidoPraEmissao`
- `ParseCfop_AceitaComOuSemPontuacao` / `ParseCfop_ForaDe4Digitos_LancaFiscalNaoConfigurado`
- `EmitirParaComandaAsync_ComDesconto_ValorTotalEhOLiquidoNaoOBrutoDosItens`
- `EmitirParaComandaAsync_ComCertificadoEDadosCompletos_NaoLancaErroDeConfiguracaoDeCertificado`
  (certificado self-signed de verdade, gerado em memória — prova a correção do bug #1
  sem precisar de certificado real nem rede)

O Tenant-ERP_Model tem `tests/unit/CardGameStore.Tests/Services/NfceEmissionServiceTests.cs`
próprio — vale portar os mesmos testes de lá pra pegar regressão futura.

---

## 6. Emissão real contra a SEFAZ nunca alcançava a rede — `tpEmis` não configurado

**Commit:** `d2aaad0` — `CardGameStore/Services/Implementations/NfceEmissionService.cs`

**Sintoma:** com o bug do certificado (#1) já corrigido e implantado, o primeiro teste real
contra o Homologação da SEFAZ-SP ainda falhava: `System.Exception: Serviço NFeAutorizacao,
versão , não disponível para a UF SP, no ambiente de Homologação para emissão tipo ,
documento: NFC-e!` (repare "versão" e "tipo" em branco na mensagem).

**Causa raiz:** `ConfiguracaoServico.tpEmis` nunca era setado no objeto passado pra lib —
ficava no padrão `0`, que não é nenhum `TipoEmissao` válido (`teNormal=1`, `teOffLine=9`
etc.). A lib usa `tpEmis` como parte da chave de busca numa tabela interna de URLs de
webservice (UF + ambiente + serviço + versão + tipoEmissao); com tipoEmissao=0 a busca não
encontra NADA, pra nenhuma UF, sempre — não é específico de SP. Reproduzido 100% offline
(sem precisar de rede/homologação real) com um certificado self-signed gerado em memória
contra a DLL real da lib — a exceção aparece na hora de montar a URL do webservice, antes
de qualquer tentativa de rede.

**Fix:** `cfgServico.tpEmis = TipoEmissao.teNormal` já na criação (`AbrirConfiguracaoSefazAsync`),
sobrescrito pra `TipoEmissao.teOffLine` em `TransmitirAsync` só quando a nota está sendo
retransmitida a partir de uma contingência offline anterior — mesma lógica que já existia pro
`tpEmis` gravado dentro do próprio XML da NFe (`nfe.infNFe.ide.tpEmis`), só que nunca era
espelhada pro objeto de configuração do serviço.

**Bônus (mesmo commit):** CEP do emitente (`FiscalConfig.Cep`) também ia sem sanitizar pro
XML — "01310-100" quebra a validação da lib (`enderEmit\CEP deve receber somente números`).
Mesma classe de bug do NCM/CFOP (#2/#3) — sanitizado com o mesmo helper (`SomenteDigitos`,
extraído de `SanitizeNcm`).

**Consequência prática:** isso significa que, até este fix, **nenhuma emissão real (não
simulada) pra SEFAZ jamais funcionou** neste sistema — toda nota "Autorizada" vista antes
disso veio do Modo Simulação (`TransmitirSimuladoAsync` também marca `Status = Autorizada`,
sem nunca tocar a SEFAZ de verdade — não é prova de emissão real funcionando).

**No Tenant-ERP_Model:** mesmo bug — `AbrirConfiguracaoSefazAsync` nunca seta `tpEmis` lá
também. Portar junto com o fix do certificado (#1), já que sem os dois nenhuma emissão real
sai do lugar pra nenhum tenant.

## 7. Exportação manual de XML usava fuso do servidor, não do Brasil

**Commit:** `ba754c2` — `CardGameStore/Controllers/FiscalController.cs`

Achado numa auditoria externa (Codex) rodada no Tenant-ERP_Model e confirmado direto no
softNerd: `ExportarXmls` usava `DateTime.ToUniversalTime()`, que converte usando o fuso
LOCAL DO SERVIDOR — não Brasília. Num VPS com `TZ=UTC` (comum em containers Linux), "hoje"
vira meia-noite UTC em vez de meia-noite de Brasília, defasando o período em 3h perto da
virada do dia. Corrigido pro mesmo padrão `TimeZoneInfo.ConvertTimeToUtc(..., BrazilZone)`
já usado em `ComandaService`/`VendaAvulsaService`/`RelatoriosController`/`AnalyticsController`
— esse arquivo era o único que não seguia o padrão.

## 8. Certificado vencido era tratado como "SEFAZ fora do ar"

**Commit:** `ba754c2` — `CardGameStore/Services/Implementations/NfceEmissionService.cs`

Mesma auditoria externa. Certificado vencido derruba a autenticação mTLS na hora de falar
com a SEFAZ, e o .NET embrulha essa falha em `HttpRequestException` — o MESMO tipo que
`EhFalhaDeConectividade` usa pra reconhecer "SEFAZ inalcançável" e mandar a nota pra
contingência offline. Sem checar a validade do certificado antes, um certificado vencido
faria a nota "sair" em contingência (cliente recebe cupom com chave/QR que a SEFAZ NUNCA
vai aceitar transmitir) em vez de um erro de configuração claro. Fix: checa
`certificado.NotAfter` em `AbrirConfiguracaoSefazAsync()` e lança
`FiscalNaoConfiguradoException` com mensagem clara se vencido — mitigado ainda mais pelo
`FiscalAlertBackgroundService` já existente (avisa por dashboard/email antes do vencimento).

## Auditoria externa (Codex) no Tenant-ERP_Model — o que confirmamos contra o softNerd

Em 21/07/2026 uma auditoria via Codex no Tenant-ERP_Model apontou vários riscos fiscais.
Como esse repo é fork do softNerd, cada achado foi checado direto contra o código daqui:

| Achado do Codex | Aplica no softNerd? |
|---|---|
| Retransmissão de contingência encerra em ~2,5h | **Não** — já tem guarda explícita (`!emContingencia` no limite de tentativas) + prazo legal de 24h correto, com comentário no código citando exatamente esse risco |
| Configuração incompleta pode consumir numeração fiscal | **Não** — itens são validados (CSOSN/NCM/CFOP) e config é validada ANTES de reservar o número, propositalmente |
| NFC-e duplicada por concorrência | **Não** — idempotência em dois níveis: check-then-insert com `catch DbUpdateException` + índices únicos parciais reais no Postgres (`ix_notas_fiscais_comanda_unica`/`..._venda_avulsa_unica`) |
| `nfeProc` (XML com protocolo) não é armazenado | **Não** — `XmlAutorizado` já guarda o `nfeProc` completo (NFe + protNFe), não o envelope de envio |
| Exportações manuais com erro de fuso horário | **Sim, confirmado e corrigido** (#7 acima) |
| Certificado vencido tratado como indisponibilidade da SEFAZ | **Sim, confirmado e corrigido** (#8 acima) |
| Cancelamento fiscal não estorna estoque/financeiro/pontos/crediário | **Sim, existe também aqui** — `CancelarAsync` só cancela o documento fiscal (evento SEFAZ), não toca `Comanda`/`VendaAvulsa`. Não corrigido ainda — não é um bug óbvio de código, é uma decisão de escopo que precisa ser confirmada com o Maikon (cancelar a nota fiscal deveria sempre estornar a venda? nem sempre — às vezes só a nota está errada) |
| Lucro Presumido/Real configurável mas XML usa tributação do Simples | **Sim, existe também aqui** — `MontarIcmsSimplesNacional` é chamado incondicionalmente pra todo item, mesmo se `FiscalConfig.RegimeTributario` for Lucro Presumido/Real (só o campo `CRT` do cabeçalho muda). Hoje é inofensivo pra Maikon (Simples Nacional, ME — ver [[project_santuario_fiscal]]), mas a tela deixa selecionar um regime que geraria nota fiscalmente incorreta. Não corrigido — precisa de regra de CST real, que não deve ser inventada sem validar com contador (mesmo princípio do NCM) |
| CSC armazenado sem criptografia | **Sim, existe também aqui** — `FiscalConfig.CscToken` é `string?` puro (diferente do certificado, que usa `EncryptionService`). Não corrigido ainda |
| Contingência pode imprimir chave/QR diferentes dos retransmitidos | **Provavelmente não** — número/cNf/tpEmis são deliberadamente reaproveitados da nota original na retransmissão (mesma chave determinística), mas não construí um teste isolado pra provar isso com 100% de confiança |
| 4 erros de TypeScript no AiChatWidget (build ignora tipagem) | **Sim, confirmado e corrigido** — mesmo arquivo, mesmos 4 erros, `next.config.js` também tem `ignoreBuildErrors`/`ignoreDuringBuilds` |

## Ordem sugerida pra portar no Tenant-ERP_Model

1. **Certificado (#1) + tpEmis (#6)** — sem os dois, emissão real não sai do lugar pra
   nenhum tenant (o certificado destrava a config, o tpEmis destrava o webservice em si).
2. **Desconto/pontos (#4)** — é o único que gera nota com valor ERRADO (os outros travam
   antes de sair; esse deixa passar errado).
3. **NCM (#2)**, **CFOP (#3)** e **CEP (#6)** — mesma classe de correção (sanitizar dígitos
   antes de mandar pra SEFAZ), aplicar junto.
4. **ZIP export (#5)** — menor impacto, mas rápido de portar.
