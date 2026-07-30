// =============================================================================
// SefazNfeService.cs — Manifestação do Destinatário ("DDA" fiscal)
//
// Pipeline completo sobre o webservice NFeDistribuicaoDFe (Ambiente Nacional):
//   1. Consulta NSU incremental  → descobre resumos (resNFe) de notas destinadas
//   2. Ciência da Operação       → evento 210210 em lote (libera o XML completo)
//   3. Download por chave        → consChNFe no mesmo webservice (procNFe)
//   4. Parser <cobr><dup>        → contas a pagar em external_transactions
//
// Regras SEFAZ que este serviço respeita:
//   - cStat 656 (consumo indevido): para imediatamente e reporta — nunca insiste
//   - ultNSU persistido a cada lote: reinício do app não reprocessa o histórico
//   - XML completo pode demorar a propagar após a ciência — nota fica em
//     "ciencia" e é retentada nos ciclos seguintes, sem erro
// =============================================================================

using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Xml.Linq;
using CardGameStore.Common;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using DFe.Classes.Entidades;
using DFe.Classes.Flags;
using NFe.Classes.Informacoes.Identificacao.Tipos;
using Microsoft.EntityFrameworkCore;
using NFe.Classes.Servicos.DistribuicaoDFe;
using NFe.Classes.Servicos.Tipos;
using NFe.Servicos;
using NFe.Utils;

namespace CardGameStore.Services.Implementations;

public class SefazNfeService
{
    private readonly AppDbContext _db;
    private readonly EncryptionService _enc;
    private readonly ILogger<SefazNfeService> _logger;

    // Limites por ciclo — evita rodadas intermináveis e abuso de quota na SEFAZ
    private const int MaxLotesNsuPorCiclo    = 30;
    private const int MaxCienciasPorCiclo    = 60;   // em lotes de 20 chaves por evento
    private const int MaxDownloadsPorCiclo   = 20;
    private const int ChavesPorLoteDeCiencia = 20;   // limite do layout de eventos em lote

    public SefazNfeService(AppDbContext db, EncryptionService enc, ILogger<SefazNfeService> logger)
    {
        _db     = db;
        _enc    = enc;
        _logger = logger;
    }

    public async Task<bool> IsConfiguredAsync()
    {
        var cfg = await _db.FiscalConfigs.FindAsync(FiscalConfig.SingletonId);
        return cfg is not null && cfg.CertificadoConfigurado &&
               !string.IsNullOrWhiteSpace(cfg.Cnpj) && !string.IsNullOrWhiteSpace(cfg.Uf);
    }

    /// <summary>
    /// Roda o pipeline completo. Chamado pelo job (a cada 2h) e pelo botão
    /// "Sincronizar agora" do admin. Nunca lança por rejeição da SEFAZ —
    /// devolve o resultado com a mensagem para o painel.
    /// </summary>
    public async Task<SefazSyncResult> SincronizarAsync(CancellationToken ct = default)
    {
        var cfg = await _db.FiscalConfigs.FindAsync(FiscalConfig.SingletonId);
        if (cfg is null || !cfg.CertificadoConfigurado)
            return SefazSyncResult.NaoExecutado("Certificado digital A1 não configurado em Admin > Fiscal.");
        if (string.IsNullOrWhiteSpace(cfg.Cnpj) || string.IsNullOrWhiteSpace(cfg.Uf))
            return SefazSyncResult.NaoExecutado("CNPJ/UF da empresa não configurados em Admin > Fiscal.");

        // Cnpj.Normalizar preserva letras — filtrar só dígitos mutilaria o CNPJ
        // alfanumérico (IN RFB 2.229/2024), mesmo motivo do resto do módulo fiscal.
        var cnpj = Cnpj.Normalizar(cfg.Cnpj);

        var pfxBytes    = Convert.FromBase64String(_enc.Decrypt(cfg.CertificadoPfxEncrypted!));
        var senha       = _enc.Decrypt(cfg.CertificadoSenhaEncrypted!);
        using var certificado = Pkcs12Loader.Abrir(pfxBytes, senha);

        var cfgServico = new ConfiguracaoServico
        {
            cUF             = Enum.Parse<Estado>(cfg.Uf),
            tpAmb           = cfg.Ambiente == AmbienteFiscal.Producao ? TipoAmbiente.Producao : TipoAmbiente.Homologacao,
            ModeloDocumento = ModeloDocumento.NFe, // distribuição/manifestação são serviços da NF-e (55), não da NFC-e
            VersaoLayout    = VersaoServico.Versao400,
            // Mesmo bug que já tinha sido corrigido no NfceEmissionService (commit d2aaad0)
            // e que passou batido aqui: sem tpEmis o campo fica 0 (valor de enum inválido),
            // a lib não acha a URL do webservice na tabela interna (UF+ambiente+serviço+
            // versão+tipoEmissao) e lança "Serviço NFeDistribuicaoDFe, versão , não
            // disponível para a UF SP..." — com "versão" e "tipo" em branco, que é a
            // assinatura desse defeito. Distribuição/manifestação é sempre online.
            tpEmis          = TipoEmissao.teNormal,
            TimeOut         = 30000,
            ValidarSchemas  = false,
        };

        using var servico = new ServicosNFe(cfgServico, certificado);
        var resultado = new SefazSyncResult { Executado = true };

        try
        {
            await ConsultarNsuAsync(servico, cfg, cnpj, resultado, ct);
            if (!resultado.BloqueadoPorConsumoIndevido)
            {
                await ManifestarCienciaAsync(servico, cnpj, resultado, ct);
                await BaixarXmlsPorChaveAsync(servico, cfg, cnpj, resultado, ct);
            }
            await GerarContasAsync(resultado, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "DFe Distribuição: falha na sincronização com a SEFAZ");
            resultado.Mensagem = $"Falha na comunicação com a SEFAZ: {ex.Message}";
        }

        // Marca a sincronização no card de integrações (se a linha existir)
        var integracao = await _db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == "sefaz", ct);
        if (integracao is not null)
        {
            integracao.LastSyncAt = DateTime.UtcNow;
            integracao.UpdatedAt  = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
        }

        _logger.LogInformation(
            "DFe Distribuição: {Novas} nota(s) nova(s), {Ciencias} ciência(s), {Xmls} XML(s), {Contas} conta(s) a pagar. {Msg}",
            resultado.NovasNotas, resultado.Manifestadas, resultado.XmlsBaixados, resultado.ContasCriadas,
            resultado.Mensagem ?? "");

        return resultado;
    }

    // ── 1. Consulta NSU incremental ───────────────────────────────────────────

    private async Task ConsultarNsuAsync(
        ServicosNFe servico, FiscalConfig cfg, string cnpj, SefazSyncResult resultado, CancellationToken ct)
    {
        for (var lote = 0; lote < MaxLotesNsuPorCiclo && !ct.IsCancellationRequested; lote++)
        {
            var ret = servico.NfeDistDFeInteresse(cfg.Uf!, cnpj, ultNSU: cfg.DistUltimoNsu.ToString()).Retorno;

            if (ret.cStat == 656)
            {
                resultado.BloqueadoPorConsumoIndevido = true;
                resultado.Mensagem = "SEFAZ bloqueou temporariamente por consumo indevido (cStat 656) — aguarde 1 hora.";
                _logger.LogWarning("DFe Distribuição: consumo indevido (656). ultNSU atual: {Nsu}", cfg.DistUltimoNsu);
                return;
            }

            if (ret.cStat == 137) // nenhum documento novo
            {
                cfg.DistUltimoNsu = Math.Max(cfg.DistUltimoNsu, ret.ultNSU);
                await _db.SaveChangesAsync(ct);
                return;
            }

            if (ret.cStat != 138) // 138 = documentos localizados
            {
                resultado.Mensagem = $"SEFAZ rejeitou a consulta: {ret.cStat} — {ret.xMotivo}";
                _logger.LogWarning("DFe Distribuição: cStat inesperado {CStat} — {Motivo}", ret.cStat, ret.xMotivo);
                return;
            }

            foreach (var doc in ret.loteDistDFeInt ?? Array.Empty<loteDistDFeInt>())
                await ProcessarDocumentoAsync(doc, resultado, ct);

            cfg.DistUltimoNsu = ret.ultNSU;
            await _db.SaveChangesAsync(ct); // persiste por lote: reinício não reprocessa

            if (ret.ultNSU >= ret.maxNSU) return; // backlog drenado
        }
    }

    private async Task ProcessarDocumentoAsync(loteDistDFeInt doc, SefazSyncResult resultado, CancellationToken ct)
    {
        var schema = doc.schema ?? "";

        if (schema.StartsWith("resNFe", StringComparison.OrdinalIgnoreCase) && doc.ResNFe is not null)
        {
            var res  = doc.ResNFe;
            var nota = await _db.NotasDestinadas.FirstOrDefaultAsync(n => n.ChaveAcesso == res.chNFe, ct);

            if (nota is null)
            {
                nota = new NotaDestinada
                {
                    ChaveAcesso  = res.chNFe,
                    Nsu          = doc.NSU,
                    EmitenteCnpj = res.CNPJ,
                    EmitenteNome = res.xNome,
                    Valor        = res.vNF,
                    DataEmissao  = ParaUtc(res.dhEmi),
                    Situacao     = res.cSitNFe,
                    Status       = res.cSitNFe == 3 ? NotaDestinadaStatus.Cancelada : NotaDestinadaStatus.Resumo,
                };
                _db.NotasDestinadas.Add(nota);
                if (nota.Status == NotaDestinadaStatus.Resumo) resultado.NovasNotas++;
            }
            else if (res.cSitNFe == 3 && nota.Status != NotaDestinadaStatus.Cancelada)
            {
                await CancelarNotaAsync(nota, ct);
            }
        }
        else if (schema.StartsWith("procNFe", StringComparison.OrdinalIgnoreCase) && doc.XmlNfe is { Length: > 0 })
        {
            // XML completo veio direto na distribuição (nota já manifestada anteriormente)
            var xml   = Encoding.UTF8.GetString(doc.XmlNfe);
            var chave = ExtrairChaveDoXml(xml);
            if (chave is null) return;

            var nota = await _db.NotasDestinadas.FirstOrDefaultAsync(n => n.ChaveAcesso == chave, ct);
            if (nota is null)
            {
                nota = new NotaDestinada { ChaveAcesso = chave, Nsu = doc.NSU };
                _db.NotasDestinadas.Add(nota);
                resultado.NovasNotas++;
            }

            if (nota.Status is NotaDestinadaStatus.Resumo or NotaDestinadaStatus.Ciencia || nota.XmlProc is null)
            {
                nota.XmlProc   = xml;
                nota.Status    = nota.Status == NotaDestinadaStatus.Cancelada
                                   ? NotaDestinadaStatus.Cancelada
                                   : NotaDestinadaStatus.XmlBaixado;
                nota.UpdatedAt = DateTime.UtcNow;
                PreencherResumoDoXml(nota, xml);
                if (nota.Status == NotaDestinadaStatus.XmlBaixado) resultado.XmlsBaixados++;
            }
        }
        else if ((schema.StartsWith("resEvento",     StringComparison.OrdinalIgnoreCase) && doc.ResEvento is not null) ||
                 (schema.StartsWith("procEventoNFe", StringComparison.OrdinalIgnoreCase) && doc.ProcEventoNFe is not null))
        {
            // Só interessa o cancelamento da NF-e pelo emitente (110111)
            var (tpEvento, chave) = schema.StartsWith("resEvento", StringComparison.OrdinalIgnoreCase)
                ? (doc.ResEvento!.tpEvento, doc.ResEvento.chNFe)
                : (doc.ProcEventoNFe!.evento?.infEvento.tpEvento.ToString(), doc.ProcEventoNFe.evento?.infEvento.chNFe);

            if (tpEvento == "110111" && chave is not null)
            {
                var nota = await _db.NotasDestinadas.FirstOrDefaultAsync(n => n.ChaveAcesso == chave, ct);
                if (nota is not null && nota.Status != NotaDestinadaStatus.Cancelada)
                    await CancelarNotaAsync(nota, ct);
            }
        }
    }

    /// <summary>Marca a nota como cancelada e cancela as contas a pagar ainda não pagas dela.</summary>
    private async Task CancelarNotaAsync(NotaDestinada nota, CancellationToken ct)
    {
        nota.Situacao  = 3;
        nota.Status    = NotaDestinadaStatus.Cancelada;
        nota.UpdatedAt = DateTime.UtcNow;

        var canceladas = await _db.ExternalTransactions
            .Where(t => t.Source == "sefaz" && t.NfeKey == nota.ChaveAcesso &&
                        (t.Status == "pending" || t.Status == "overdue"))
            .ExecuteUpdateAsync(s => s
                .SetProperty(t => t.Status,    "cancelled")
                .SetProperty(t => t.UpdatedAt, DateTime.UtcNow), ct);

        if (canceladas > 0)
            _logger.LogInformation(
                "DFe Distribuição: NF-e {Chave} cancelada pelo emitente — {Qtd} conta(s) a pagar cancelada(s).",
                nota.ChaveAcesso, canceladas);
    }

    // ── 2. Ciência da Operação (evento 210210, em lotes de 20 chaves) ──────────

    private async Task ManifestarCienciaAsync(
        ServicosNFe servico, string cnpj, SefazSyncResult resultado, CancellationToken ct)
    {
        var pendentes = await _db.NotasDestinadas
            .Where(n => n.Status == NotaDestinadaStatus.Resumo && n.Situacao == 1)
            .OrderBy(n => n.CreatedAt)
            .Take(MaxCienciasPorCiclo)
            .ToListAsync(ct);

        foreach (var loteNotas in pendentes.Chunk(ChavesPorLoteDeCiencia))
        {
            if (ct.IsCancellationRequested) return;

            var retorno = servico.RecepcaoEventoManifestacaoDestinatario(
                idlote: 1, sequenciaEvento: 1,
                chavesNFe: loteNotas.Select(n => n.ChaveAcesso).ToArray(),
                nFeTipoEventoManifestacaoDestinatario: NFeTipoEvento.TeMdCienciaDaOperacao,
                cpfcnpj: cnpj);

            var eventos = retorno.Retorno?.retEvento;
            if (eventos is null || eventos.Count == 0)
            {
                _logger.LogWarning("DFe Distribuição: lote de ciência sem retorno de eventos (cStat {CStat} — {Motivo})",
                    retorno.Retorno?.cStat, retorno.Retorno?.xMotivo);
                continue;
            }

            foreach (var ev in eventos)
            {
                var inf  = ev.infEvento;
                var nota = loteNotas.FirstOrDefault(n => n.ChaveAcesso == inf?.chNFe);
                if (nota is null || inf is null) continue;

                // 135 = registrado e vinculado | 136 = registrado sem vínculo
                // 573 = duplicidade (ciência já existia) — para nós é sucesso
                if (inf.cStat is 135 or 136 or 573)
                {
                    nota.Status           = NotaDestinadaStatus.Ciencia;
                    nota.CienciaProtocolo = inf.nProt;
                    nota.CienciaEm        = DateTime.UtcNow;
                    nota.Erro             = null;
                    resultado.Manifestadas++;
                }
                else
                {
                    nota.Erro = $"Ciência rejeitada: {inf.cStat} — {inf.xMotivo}";
                    _logger.LogWarning("DFe Distribuição: ciência rejeitada para {Chave}: {CStat} — {Motivo}",
                        nota.ChaveAcesso, inf.cStat, inf.xMotivo);
                }
                nota.UpdatedAt = DateTime.UtcNow;
            }

            await _db.SaveChangesAsync(ct);
        }
    }

    // ── 3. Download do XML completo por chave (consChNFe) ──────────────────────

    private async Task BaixarXmlsPorChaveAsync(
        ServicosNFe servico, FiscalConfig cfg, string cnpj, SefazSyncResult resultado, CancellationToken ct)
    {
        var aguardandoXml = await _db.NotasDestinadas
            .Where(n => n.Status == NotaDestinadaStatus.Ciencia)
            .OrderBy(n => n.CienciaEm)
            .Take(MaxDownloadsPorCiclo)
            .ToListAsync(ct);

        foreach (var nota in aguardandoXml)
        {
            if (ct.IsCancellationRequested) return;

            var ret = servico.NfeDistDFeInteresse(cfg.Uf!, cnpj, chNFE: nota.ChaveAcesso).Retorno;

            if (ret.cStat == 656)
            {
                resultado.BloqueadoPorConsumoIndevido = true;
                resultado.Mensagem = "SEFAZ bloqueou temporariamente por consumo indevido (cStat 656) — aguarde 1 hora.";
                return;
            }

            var docProc = (ret.loteDistDFeInt ?? Array.Empty<loteDistDFeInt>())
                .FirstOrDefault(d => (d.schema ?? "").StartsWith("procNFe", StringComparison.OrdinalIgnoreCase) &&
                                     d.XmlNfe is { Length: > 0 });

            if (docProc is null)
            {
                // XML ainda não propagou após a ciência — normal, tenta no próximo ciclo
                _logger.LogInformation("DFe Distribuição: XML de {Chave} ainda indisponível ({CStat} — {Motivo})",
                    nota.ChaveAcesso, ret.cStat, ret.xMotivo);
                continue;
            }

            nota.XmlProc   = Encoding.UTF8.GetString(docProc.XmlNfe);
            nota.Status    = NotaDestinadaStatus.XmlBaixado;
            nota.Erro      = null;
            nota.UpdatedAt = DateTime.UtcNow;
            PreencherResumoDoXml(nota, nota.XmlProc);
            resultado.XmlsBaixados++;

            await _db.SaveChangesAsync(ct);
        }
    }

    // ── 4. Parser <cobr><dup> → contas a pagar ──────────────────────────────────

    private async Task GerarContasAsync(SefazSyncResult resultado, CancellationToken ct)
    {
        var prontas = await _db.NotasDestinadas
            .Where(n => n.Status == NotaDestinadaStatus.XmlBaixado && n.XmlProc != null)
            .OrderBy(n => n.CreatedAt)
            .ToListAsync(ct);

        foreach (var nota in prontas)
        {
            try
            {
                resultado.ContasCriadas += await GerarContasDaNotaAsync(nota, ct);
                nota.Status    = NotaDestinadaStatus.ContasGeradas;
                nota.Erro      = null;
            }
            catch (Exception ex)
            {
                nota.Erro = $"Falha ao gerar contas: {ex.Message}";
                _logger.LogError(ex, "DFe Distribuição: falha ao gerar contas da NF-e {Chave}", nota.ChaveAcesso);
            }
            nota.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
        }
    }

    private async Task<int> GerarContasDaNotaAsync(NotaDestinada nota, CancellationToken ct)
    {
        XNamespace ns = "http://www.portalfiscal.inf.br/nfe";
        var xml    = XDocument.Parse(nota.XmlProc!);
        var infNFe = xml.Descendants(ns + "infNFe").FirstOrDefault()
            ?? throw new InvalidOperationException("XML sem infNFe.");

        var nNF   = infNFe.Element(ns + "ide")?.Element(ns + "nNF")?.Value ?? "?";
        var emit  = infNFe.Element(ns + "emit");
        var xNome = emit?.Element(ns + "xNome")?.Value ?? nota.EmitenteNome ?? "Fornecedor";
        var vNF   = ParseDecimal(infNFe.Element(ns + "total")?.Element(ns + "ICMSTot")?.Element(ns + "vNF")?.Value);

        var duplicatas = infNFe.Element(ns + "cobr")?.Elements(ns + "dup")
            .Select(d => (
                NDup:  d.Element(ns + "nDup")?.Value ?? "1",
                Venc:  d.Element(ns + "dVenc")?.Value,
                Valor: ParseDecimal(d.Element(ns + "vDup")?.Value)))
            .Where(d => d.Valor > 0)
            .ToList() ?? new();

        // Sem <dup> (compra à vista / sem fatura): lança uma conta única pelo total
        if (duplicatas.Count == 0)
            duplicatas.Add(("unica", nota.DataEmissao?.ToString("yyyy-MM-dd"), vNF > 0 ? vNF : nota.Valor));

        var criadas = 0;
        foreach (var (nDup, venc, valor) in duplicatas)
        {
            var externalId = $"{nota.ChaveAcesso}-{nDup}";
            var jaExiste   = await _db.ExternalTransactions
                .AnyAsync(t => t.Source == "sefaz" && t.ExternalId == externalId, ct);
            if (jaExiste) continue;

            var parcelaInfo = duplicatas.Count > 1 ? $" — parcela {nDup}/{duplicatas.Count}" : "";
            _db.ExternalTransactions.Add(new ExternalTransaction
            {
                Source      = "sefaz",
                ExternalId  = externalId,
                Type        = "expense",
                Amount      = valor,
                Description = $"NF-e {nNF} — {xNome}{parcelaInfo}",
                // Vencimento é data pura: meia-noite UTC, convenção do módulo financeiro
                DueDate     = venc is not null
                                ? DateTime.SpecifyKind(DateTime.Parse(venc[..10]), DateTimeKind.Utc)
                                : null,
                Status      = "pending",
                Category    = "Fornecedor",
                Supplier    = xNome,
                NfeKey      = nota.ChaveAcesso,
                Notes       = $"Gerada automaticamente via Manifestação do Destinatário (NSU {nota.Nsu}).",
            });
            criadas++;
        }

        nota.ContasGeradas += criadas;
        return criadas;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    /// <summary>Extrai a chave de acesso do atributo Id ("NFe" + 44 dígitos) do infNFe.</summary>
    private static string? ExtrairChaveDoXml(string xml)
    {
        try
        {
            XNamespace ns = "http://www.portalfiscal.inf.br/nfe";
            var id = XDocument.Parse(xml).Descendants(ns + "infNFe").FirstOrDefault()?.Attribute("Id")?.Value;
            return id is { Length: 47 } ? id[3..] : null;
        }
        catch { return null; }
    }

    /// <summary>Completa emitente/valor/data da nota a partir do XML completo.</summary>
    private static void PreencherResumoDoXml(NotaDestinada nota, string xml)
    {
        try
        {
            XNamespace ns = "http://www.portalfiscal.inf.br/nfe";
            var infNFe = XDocument.Parse(xml).Descendants(ns + "infNFe").FirstOrDefault();
            if (infNFe is null) return;

            var emit = infNFe.Element(ns + "emit");
            nota.EmitenteCnpj ??= emit?.Element(ns + "CNPJ")?.Value;
            nota.EmitenteNome ??= emit?.Element(ns + "xNome")?.Value;

            if (nota.Valor == 0)
                nota.Valor = ParseDecimal(infNFe.Element(ns + "total")?.Element(ns + "ICMSTot")?.Element(ns + "vNF")?.Value);

            if (nota.DataEmissao is null &&
                DateTimeOffset.TryParse(infNFe.Element(ns + "ide")?.Element(ns + "dhEmi")?.Value, out var dhEmi))
                nota.DataEmissao = dhEmi.UtcDateTime;
        }
        catch { /* resumo é informativo — não pode derrubar o pipeline */ }
    }

    private static decimal ParseDecimal(string? s) =>
        decimal.TryParse(s, System.Globalization.NumberStyles.Any,
                         System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : 0;

    private static DateTime? ParaUtc(DateTime dt) =>
        dt == default ? null
        : dt.Kind == DateTimeKind.Unspecified ? DateTime.SpecifyKind(dt, DateTimeKind.Utc)
        : dt.ToUniversalTime();
}

/// <summary>Resultado de um ciclo de sincronização — exibido no painel do admin.</summary>
public class SefazSyncResult
{
    public bool    Executado     { get; set; }
    public string? Mensagem      { get; set; }
    public int     NovasNotas    { get; set; }
    public int     Manifestadas  { get; set; }
    public int     XmlsBaixados  { get; set; }
    public int     ContasCriadas { get; set; }
    public bool    BloqueadoPorConsumoIndevido { get; set; }

    public static SefazSyncResult NaoExecutado(string motivo) =>
        new() { Executado = false, Mensagem = motivo };
}
