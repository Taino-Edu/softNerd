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

## 9. CSC ausente derrubava o LOTE inteiro (cStat 225) e queimava numeração a cada retry

**Commit:** `3ccd9bc` — `CardGameStore/Services/Implementations/NfceEmissionService.cs`

**Sintoma:** primeiro teste real contra o Homologação de SP (já com #1/#6 corrigidos)
chegou a transmitir de verdade e recebeu `cStat 225 — Falha no Schema XML do lote de
NFe` da SEFAZ. Como a rejeição não é por contingência, cada clique em "Reprocessar"
reservava um número NOVO de NFC-e e o inutilizava automaticamente — queimando
numeração à toa a cada tentativa, sem nunca corrigir o problema real.

**Causa raiz:** `infNFeSupl`/`qrCode` é um grupo OBRIGATÓRIO pela XSD só pra NFC-e
(mod=65) — não existe essa exigência pra NF-e comum (mod=55). Sem `CscId`/`CscToken`
configurado, o motor ainda montava `nfe.infNFeSupl = new infNFeSupl()` mas deixava o
`qrCode` vazio, violando o schema.

**Fix:** valida `CscId`/`CscToken` em `AbrirConfiguracaoSefazAsync()`, ANTES de
reservar número — falha limpa com `FiscalNaoConfiguradoException` em vez de queimar
numeração a cada tentativa.

**No Tenant-ERP_Model:** mesmo bug — `AbrirConfiguracaoSefazAsync` lá também não
valida CSC antes de reservar número.

## 10. Texto da tela de CSC dava a entender que era só cosmético

**Commit:** `fa39fcd` — `frontend/app/admin/fiscal/page.tsx`

"Sem o CSC, o cupom funciona mas o QR Code fica sem o hash de segurança oficial" foi
corrigido pra deixar claro que, pra NFC-e, falta de CSC rejeita a nota INTEIRA (não é
só o QR incompleto) — e que Homologação/Produção usam CSCs diferentes, cadastrados
separadamente na SEFAZ.

## Sessão de teste real contra o Homologação de SP (21/07/2026)

Depois dos fixes #1/#6/#9 implantados, testamos emissão de verdade pela primeira vez.
Achados que não são bug de código, mas bloqueiam qualquer tenant que for testar:

- **Credenciamento de NFC-e é separado por ambiente.** O CNPJ do Maikon já estava
  credenciado em Produção (CSC ativo desde 11/04/25), mas NÃO em Homologação —
  precisou credenciar voluntariamente em
  `homologacao.nfce.fazenda.sp.gov.br/NFCeSiteContribuinte/Secure/CredenciamentoVoluntario.aspx`
  antes de gerar o CSC de teste. **Todo tenant novo (de qualquer estado) vai precisar
  desse passo antes do primeiro teste em Homologação** — não é algo que o software
  resolve, é cadastro manual na SEFAZ de cada estado.
- **NCM e código IBGE do município errados derrubam a nota com mensagem clara da
  SEFAZ** ("Informado NCM inexistente", "Código Municipal do Fato Gerador do ICMS
  inexistente") — não é bug, é erro de cadastro. Vale conferir o IBGE do município de
  qualquer tenant novo contra a tabela oficial do IBGE antes de liberar (achamos um
  dígito trocado no cadastro do Maikon: `3525708` → correto é `3525706`, José
  Bonifácio-SP).
- **Reforma Tributária (IBS/CBS, NT 2025.002) já é exigida em Homologação**, antes do
  prazo de Produção (04/01/2027 pra Simples Nacional). Sem o Grupo IBS/CBS no XML, a
  SEFAZ rejeita com "IBS/CBS não informado [nItem]". Implementado no softNerd/Sol
  usando as alíquotas-teste oficiais de 2026 (IBS-UF 0,1%, IBS-Mun 0%, CBS 0,9%,
  CST 000, cClassTrib 000001). **Se o Tenant-ERP_Model ainda não tiver isso, qualquer
  teste em Homologação vai travar no mesmo ponto** — ver checklist em
  `Tenant-ERP_Model/docs/GO-LIVE-FISCAL-2026-07-25.md`.

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

1. **Certificado (#1) + tpEmis (#6) + CSC (#9)** — sem os três, emissão real não sai do
   lugar pra nenhum tenant (certificado destrava a config, tpEmis destrava o webservice,
   CSC evita queimar numeração a cada retry por schema inválido).
2. **Desconto/pontos (#4)** — é o único que gera nota com valor ERRADO (os outros travam
   antes de sair; esse deixa passar errado).
3. **NCM (#2)**, **CFOP (#3)** e **CEP (#6)** — mesma classe de correção (sanitizar dígitos
   antes de mandar pra SEFAZ), aplicar junto.
4. **ZIP export (#5)** — menor impacto, mas rápido de portar.
5. **IBS/CBS (Reforma Tributária)** — confirmar se já foi implementado lá (ver seção
   "Sessão de teste real" acima); sem isso, Homologação trava mesmo com tudo o resto
   corrigido.

---

# Port reverso: Tenant-ERP_Model → softNerd, 2026-07-29

O documento acima nasceu de correções que iam do softNerd **para** o multi-tenant. Depois
disso o `Tenant-ERP_Model` avançou sozinho e passou a ter correções fiscais que **não**
existiam aqui. Esta seção registra o caminho de volta.

Os dois repos divergiram — não é copiar arquivo. Aqui `FormaPagamento` é `string` e existe
split em dois `detPag`; lá não. O port foi adaptado, não colado.

## A. Grupo `card` no Pix/cartão + `xPag` no tPag=99 (o mais grave)

**Origem:** `c08afb0` no Tenant.
**Arquivo:** `NfceEmissionService.MontarDetPag` → agora delega pra `MontarDetPagUnico`.

`MontarDetPag` daqui montava `new detPag { tPag, vPag }` e mais nada. Consequências, as duas
confirmadas em homologação real no Tenant:

- Cartão de crédito/débito **e Pix** ⇒ rejeição *"Não informados os dados do cartão de
  crédito/débito"*. A SEFAZ trata todo pagamento eletrônico igual, não só tPag 03/04.
- Crediário/Pontos/Cashback caem em tPag=99 ⇒ rejeição *"Descrição do pagamento obrigatória
  para meio de pagamento 99-outros"*, porque `xPag` ia vazio.

Ou seja: **nenhuma forma de pagamento da loja emitia NFC-e real, exceto Dinheiro.**

## B. CEST

**Origem:** `51a62c3` no Tenant. Novo campo `Product.Cest`.

- `Product.Ncm` **perdeu o `[MaxLength(8)]`** e `Cest` nasceu sem `[MaxLength(7)]`: a
  DataAnnotation dispara a validação do `ApiController` no model binding, **antes** do
  `ProductService` tirar a pontuação — um NCM colado como "1905.90.90" voltava com a
  mensagem genérica do .NET. A largura das colunas foi pro `AppDbContext` via Fluent API.
- `MontarItem` passa a mandar `CEST`, obrigatório nos CSOSN de ST (201/202/203/500).
- Tela de estoque: campo CEST ao lado do NCM, ambos **sem `maxLength`** no input — o browser
  corta o texto colado ANTES do `onChange`, então colar "1905.90.90" virava "1905.90." e
  sobravam 6 dígitos (o campo parecia travado). Quem limita é o `slice` sobre os dígitos.

A coluna entra pelo bloco de `ALTER TABLE ... IF NOT EXISTS` do `Program.cs`, ao lado do
`ncm` — que é como este repo contorna o `EnsureCreated` (sem migrations). **Não precisa de
SQL manual no VPS**; o próprio boot aplica.

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS cest VARCHAR(7) NULL;
```

## C. CNPJ alfanumérico

**Origem:** `8ad1d9b` no Tenant. Novo `CardGameStore/Common/Cnpj.cs` (copiado sem alteração).

A partir de 31/07/2026 a Receita emite CNPJ alfanumérico (IN RFB 2.229/2024); o ambiente
nacional de NF-e/NFC-e recebe esse formato desde 01/07/2026 (NT 2026.004). O módulo 11 e os
pesos são os mesmos — muda o valor de cada caractere (ASCII − 48), então **CNPJ numérico
existente valida exatamente como antes**.

- `FiscalController` normaliza com `Cnpj.Normalizar` em vez de tirar só a máscara — filtrar
  dígitos mutilaria o CNPJ novo.
- Novo `NfceEmissionService.NormalizarCnpjParaSefaz`, aplicado na chave de acesso, no `emit`,
  no cancelamento e na inutilização.

**Mudança de comportamento:** a fronteira passou a conferir o **dígito verificador**, que
antes não era checado. CNPJ com DV errado agora falha com mensagem própria em vez de virar
rejeição da SEFAZ. Conferido que o CNPJ real da loja (42.989.093/0001-79) valida.

`CancelarNota` ganhou `catch (FiscalNaoConfiguradoException)`: ela herda de `Exception`, não
de `InvalidOperationException`, então escapava pro handler global e virava 500 "Erro interno"
quando o problema era configuração do lojista.

## D. Validações de QA

**Origem:** `1da93d0` no Tenant (achados de QA exploratória contra a API rodando).

1. **Produto aceitava preço/custo/estoque/promocional negativo.** Consequência confirmada lá:
   venda avulsa com produto de −R$ 999 gravou `totalInCents = -99900` no caixa. O frontend
   avisava; quem chama a API direto passava reto. `ProductService` valida na criação e edição.
2. **`PATCH /api/product/{id}/stock` estourava o `integer` do Postgres** com delta perto de
   `int.MaxValue` ("22003: integer out of range" ⇒ 500 genérico). Teto de 1.000.000 por
   chamada e de 100.000.000 no cadastro. O `WHERE` compara contra um limite calculado em C#
   em vez de somar dentro do SQL — a soma que estourava saiu do predicado.
3. **`POST /api/crediarios/{id}/pagamento` aceitava qualquer string como forma de pagamento**
   — "Bitcoin" gravava e virava linha fantasma no relatório agrupado por forma. Agora valida
   contra `PaymentMethod.All`, inclusive na segunda forma do split.
4. **Titularidade do certificado A1.** O upload lia o Subject e jogava fora. A loja podia
   assinar NFC-e com certificado de outra empresa — ou a SEFAZ rejeita, ou, se o CNPJ da loja
   estiver preenchido com o do dono do certificado, **emite nota fiscal real em nome de
   terceiro**. Agora o CNPJ do Subject é comparado com o da loja no upload e revalidado
   sempre que o PUT resulta em Produção com CNPJ ou ambiente na requisição (checar só a
   transição deixava o furo de trocar só o CNPJ com Produção já ligada).
   Em **Produção falha fechada**: não identificar o titular é recusa, porque provar
   titularidade é a única razão da checagem existir. Em Homologação segue permissivo.

`ProductController` passa a devolver **400 com a mensagem real** em `ArgumentException`
(Create/Update/AdjustStock) e 404 em `KeyNotFoundException`, em vez de deixar subir pro
handler global como 500.

## Não portado

- **IBPT / transparência tributária** (`PercentualTributos*`, `FonteTributos`, `IbptTaxService`)
  — não existe neste repo, é feature do multi-tenant.
- **`dhEmi`**: aqui usa o momento da tentativa em emissão normal (a SEFAZ rejeita NFC-e online
  com horário antigo) e preserva o original só em contingência. O Tenant usa `nota.CreatedAt`.
  **Este repo está certo — não portar a versão de lá.**
