// =============================================================================
// NfceEmissionService.cs — Motor de emissão de NFC-e via DFe.NET
//
// Monta o objeto NFe (ide/emit/dest/det/total/pag), assina com o certificado
// A1 do FiscalConfig e transmite à SEFAZ via NFe.Servicos.ServicosNFe.
//
// Decisões já verificadas contra documentação oficial / prática de mercado:
//  - PIS/COFINS sempre CST 99 ("Outras Operações") com alíquota zero: confirmado
//    como o padrão de fato usado por optantes do Simples Nacional (o DAS já
//    unifica essas contribuições — não há CST federal específico exigido pela
//    Receita pra esse regime na NFC-e).
//  - CSOSN: suporta 101, 102, 103, 300, 400, 500, 900 (os únicos que fazem
//    sentido pra um lojista que NÃO é substituto tributário). 201/202/203
//    (ICMS-ST como substituto) são bloqueados de propósito — exigem MVA/base
//    reduzida que ninguém aqui calcula sozinho; ver MontarIcmsSimplesNacional.
//  - dhEmi usa o momento da tentativa para emissão normal: a SEFAZ rejeita NFC-e online
//    transmitida com horário antigo. Em contingência, preserva o horário original.
//  - Todos os timestamps enviados à SEFAZ usam o fuso America/Sao_Paulo
//    explicitamente (ParaBrasil/AgoraBrasil), independente do fuso do
//    servidor onde a API está hospedada.
//  - Numeração da NFC-e é reservada com UPDATE...RETURNING atômico no
//    Postgres — não há race condition entre dois fechamentos simultâneos.
//  - QR Code é gerado pela própria lib (Zeus.Net.NFe.NFCe / ExtinfNFeSupl),
//    que já sabe a URL certa por estado — não reinventamos hash/URL na mão.
//
// Robustez já implementada:
//  - Contingência offline (tpEmis=9): SEFAZ inalcançável na venda → a nota sai
//    com chave/cupom válidos e o FiscalRetryBackgroundService retransmite depois,
//    reconstruindo a MESMA chave (número/cNf/tpEmis fixados). Respeita o prazo
//    legal de 24h — depois dele para de tentar e sinaliza regularização manual.
//  - Duplicidade (cStat 539) na (re)transmissão: quase sempre significa que uma
//    tentativa anterior AUTORIZOU a nota e a resposta se perdeu (timeout). Em
//    vez de marcar Rejeitada e inutilizar um número que pode estar autorizado na
//    SEFAZ, o serviço consulta a situação real da chave e reconcilia o estado.
//
// Simplificações conhecidas ainda pendentes (revisar com o contador):
//  - Produto sem NCM cadastrado BLOQUEIA a emissão (a nota fica PendenteEmissao)
//    — o NCM nunca é inventado; deve vir da nota de compra do produto.
//  - Cancelamento e inutilização assumem que "sem exceção + cStat esperado" é
//    sucesso — não foi possível testar contra a SEFAZ real neste ambiente.
// =============================================================================

using System.Security.Cryptography.X509Certificates;
using CardGameStore.Common;
using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Interfaces;
// Alias em vez de `using CardGameStore.Models.MongoDB` inteiro: esse namespace tem tipos
// com nome colidindo com os da lib de NF-e (ex.: FormaPagamento), e aqui só interessam
// as constantes de forma de pagamento.
using PaymentMethod = CardGameStore.Models.MongoDB.PaymentMethod;
using DFe.Classes.Entidades;
using DFe.Classes.Flags;
using DFe.Utils;
using Microsoft.EntityFrameworkCore;
using MongoDB.Driver;
using NFe.Classes;
using NFe.Classes.Informacoes;
using NFe.Classes.Informacoes.Destinatario;
using NFe.Classes.Informacoes.Detalhe;
using NFe.Classes.Informacoes.Detalhe.Tributacao;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Estadual;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Estadual.Tipos;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Federal;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Federal.Tipos;
using NFe.Classes.Informacoes.Emitente;
using NFe.Classes.Informacoes.Identificacao;
using NFe.Classes.Informacoes.Identificacao.Tipos;
using NFe.Classes.Informacoes.Pagamento;
using NFe.Classes.Informacoes.Total;
using NFe.Classes.Informacoes.Transporte;
using NFe.Classes.Servicos.Tipos;
using NFe.Servicos;
using NFe.Servicos.Retorno;
using NFe.Utils;
using NFe.Utils.InformacoesSuplementares;
using NFe.Utils.NFe;
using CbsItem = NFe.Classes.Informacoes.Detalhe.Tributacao.Compartilhado.InformacoesIbsCbs.InformacoesCbs.gCBS;
using CbsTotal = NFe.Classes.Informacoes.Total.IbsCbs.Cbs.gCBSTotal;
using IbsCbsCst = NFe.Classes.Informacoes.Detalhe.Tributacao.Compartilhado.Tipos.CST;
using IbsCbsItem = NFe.Classes.Informacoes.Detalhe.Tributacao.Compartilhado.IBSCBS;
using IbsCbsItemValues = NFe.Classes.Informacoes.Detalhe.Tributacao.Compartilhado.InformacoesIbsCbs.gIBSCBS;
using IbsCbsTotal = NFe.Classes.Informacoes.Total.IbsCbs.IBSCBSTot;
using IbsItemMun = NFe.Classes.Informacoes.Detalhe.Tributacao.Compartilhado.InformacoesIbsCbs.InformacoesIbs.gIBSMun;
using IbsItemUf = NFe.Classes.Informacoes.Detalhe.Tributacao.Compartilhado.InformacoesIbsCbs.InformacoesIbs.gIBSUF;
using IbsTotal = NFe.Classes.Informacoes.Total.IbsCbs.Ibs.gIBS;
using IbsTotalMun = NFe.Classes.Informacoes.Total.IbsCbs.Ibs.gIBSMunTotal;
using IbsTotalUf = NFe.Classes.Informacoes.Total.IbsCbs.Ibs.gIBSUFTotal;
using NfeDocumento = NFe.Classes.NFe;

namespace CardGameStore.Services.Implementations;

public class NfceEmissionService : INfceEmissionService
{
    // Textos literais exigidos pelas regras de validação da SEFAZ quando tpAmb=2.
    // Só entram no XML de homologação; os dados reais permanecem intactos no banco.
    private const string DestinatarioHomologacao =
        "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";
    private const string ProdutoHomologacao =
        "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

    // Janela legal pra cancelar uma NFC-e após autorizada (padrão nacional: 30 minutos).
    private static readonly TimeSpan JanelaCancelamento = TimeSpan.FromMinutes(30);

    // Trava contra loop de reprocessamento em nota permanentemente quebrada.
    // NÃO se aplica à retransmissão de contingência (ver ReprocessarAsync).
    private const int MaxTentativasReprocessamento = 10;

    // Prazo legal pra transmitir uma NFC-e emitida em contingência offline (tpEmis=9).
    // Passou disso a SEFAZ rejeita — e insistir/inutilizar é pior: o cliente já saiu
    // com o cupom. A nota fica sinalizada pra regularização manual com o contador.
    private static readonly TimeSpan PrazoMaximoContingencia = TimeSpan.FromHours(24);

    // Todo horário enviado à SEFAZ usa esse fuso explicitamente — nunca o fuso
    // do servidor (containers em nuvem tipicamente rodam em UTC por padrão).
    private static readonly TimeZoneInfo FusoBrasil = TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo");

    private static DateTimeOffset AgoraBrasil() =>
        TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, FusoBrasil);

    private static DateTimeOffset ParaBrasil(DateTime momentoUtc) =>
        TimeZoneInfo.ConvertTime(new DateTimeOffset(DateTime.SpecifyKind(momentoUtc, DateTimeKind.Utc)), FusoBrasil);

    /// <summary>
    /// Distingue "SEFAZ inalcançável" (entra em contingência) de uma rejeição de negócio de
    /// verdade (SEFAZ respondeu, só não autorizou). Só os tipos de exceção claramente ligados
    /// a rede/timeout contam — qualquer outra coisa inesperada cai no catch genérico de fora
    /// (vira PendenteEmissao) em vez de declarar contingência por um motivo que pode ser bug.
    /// </summary>
    internal static bool EhFalhaDeConectividade(Exception ex) =>
        ex is System.Net.Http.HttpRequestException
           or System.Net.WebException
           or System.Net.Sockets.SocketException
           or TimeoutException
           or TaskCanceledException
        || (ex.InnerException is not null && EhFalhaDeConectividade(ex.InnerException));

    private readonly AppDbContext                _db;
    private readonly IMongoDatabase              _mongo;
    private readonly EncryptionService           _enc;
    private readonly ILogger<NfceEmissionService> _logger;

    public NfceEmissionService(AppDbContext db, IMongoDatabase mongo, EncryptionService enc, ILogger<NfceEmissionService> logger)
    {
        _db     = db;
        _mongo  = mongo;
        _enc    = enc;
        _logger = logger;
    }

    public async Task<NotaFiscalEmitida> EmitirParaComandaAsync(Guid comandaId) =>
        await EmitirAsync(NotaFiscalOrigem.Comanda, comandaId, null);

    public async Task<NotaFiscalEmitida> EmitirParaVendaAvulsaAsync(string vendaAvulsaId) =>
        await EmitirAsync(NotaFiscalOrigem.VendaAvulsa, null, vendaAvulsaId);

    public async Task<NotaFiscalEmitida> ReprocessarAsync(Guid notaId)
    {
        await GarantirModuloFiscalAtivoAsync();

        var nota = await _db.NotasFiscaisEmitidas.FindAsync(notaId)
            ?? throw new InvalidOperationException($"Nota {notaId} não encontrada.");

        if (nota.Status is not (NotaFiscalStatus.PendenteEmissao or NotaFiscalStatus.Rejeitada or NotaFiscalStatus.AutorizadaContingencia))
            return nota; // Autorizada/Cancelada não têm o que reprocessar — devolve como está.

        var emContingencia = nota.Status == NotaFiscalStatus.AutorizadaContingencia;

        // Prazo legal de 24h pra transmitir a contingência: depois dele a SEFAZ rejeita,
        // e inutilizar o número seria errado (o cliente já saiu com o cupom válido).
        // Para de tentar e deixa sinalizado pra regularização manual com o contador.
        if (emContingencia && nota.DhContingencia.HasValue &&
            DateTime.UtcNow - nota.DhContingencia.Value > PrazoMaximoContingencia)
        {
            nota.MotivoRejeicao =
                "Prazo de 24h para transmitir a NFC-e em contingência expirou — a SEFAZ não aceita " +
                "mais esta nota. Regularizar manualmente com o contador.";
            nota.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            _logger.LogWarning(
                "NFC-e {NotaId} em contingência desde {DhContingencia} passou do prazo legal de 24h — " +
                "retransmissão automática encerrada. Regularização manual necessária.",
                nota.Id, nota.DhContingencia);
            return nota;
        }

        // O limite de tentativas NÃO se aplica à contingência: com ciclo de 15 min do retry
        // automático, 10 tentativas abandonariam a nota em ~2,5h — muito antes do prazo legal
        // de 24h que ela tem pra ser transmitida.
        if (!emContingencia && nota.TentativasReprocessamento >= MaxTentativasReprocessamento)
        {
            _logger.LogWarning(
                "NFC-e {NotaId} atingiu o limite de {Max} tentativas de reprocessamento — não vai tentar de novo.",
                nota.Id, MaxTentativasReprocessamento);
            return nota;
        }

        nota.TentativasReprocessamento++;
        await _db.SaveChangesAsync();

        await ExecutarComTratamentoDeErroAsync(nota, async () =>
        {
            var dados = nota.Origem == NotaFiscalOrigem.Comanda
                ? await CarregarDadosComandaAsync(nota.ComandaId!.Value)
                : await CarregarDadosVendaAvulsaAsync(nota.VendaAvulsaId!);

            nota.ValorTotalEmCentavos = dados.TotalCentavos; // líquido de desconto/pontos — não o bruto dos itens
            await TransmitirAsync(nota, dados);
        });

        return nota;
    }

    public async Task<NotaFiscalEmitida> CancelarAsync(Guid notaId, string justificativa)
    {
        await GarantirModuloFiscalAtivoAsync();

        if (string.IsNullOrWhiteSpace(justificativa) || justificativa.Trim().Length < 15)
            throw new InvalidOperationException("A justificativa do cancelamento precisa ter pelo menos 15 caracteres (exigência da SEFAZ).");

        var nota = await _db.NotasFiscaisEmitidas.FindAsync(notaId)
            ?? throw new InvalidOperationException($"Nota {notaId} não encontrada.");

        if (nota.Status != NotaFiscalStatus.Autorizada)
            throw new InvalidOperationException("Só é possível cancelar uma nota Autorizada.");

        if (nota.EmitidoEm is null || DateTime.UtcNow - nota.EmitidoEm.Value > JanelaCancelamento)
            throw new InvalidOperationException(
                $"Fora da janela legal de cancelamento ({JanelaCancelamento.TotalMinutes:0} minutos após a autorização).");

        // Nota "autorizada" em modo simulação nunca existiu pra SEFAZ — cancela só localmente,
        // sem tentar abrir certificado (que pode nem estar configurado no modo simulação).
        if (nota.Protocolo?.StartsWith("SIMULADO-") == true)
        {
            nota.Status                   = NotaFiscalStatus.Cancelada;
            nota.CanceladoEm              = DateTime.UtcNow;
            nota.JustificativaCancelamento = justificativa.Trim();
            await _db.SaveChangesAsync();

            _logger.LogInformation("NFC-e simulada {NotaId} cancelada localmente (nunca existiu pra SEFAZ).", nota.Id);
            return nota;
        }

        var (cfg, cfgServico, certificado, _, _, _) = await AbrirConfiguracaoSefazAsync();
        using var _certDispose = certificado;

        using var servico = new ServicosNFe(cfgServico, certificado);
        var retorno = servico.RecepcaoEventoCancelamento(
            idlote: 1, sequenciaEvento: 1,
            protocoloAutorizacao: nota.Protocolo!, chaveNFe: nota.ChaveAcesso!,
            justificativa: justificativa.Trim(), cpfcnpj: NormalizarCnpjParaSefaz(cfg.Cnpj), dhEvento: AgoraBrasil());

        var infEvento = retorno.Retorno?.retEvento?.FirstOrDefault()?.infEvento;
        // 135/136 = evento registrado | 573 = duplicidade de evento (o cancelamento já
        // estava registrado — ex: a resposta da 1ª tentativa se perdeu). Ambos = cancelada.
        if (infEvento is null || infEvento.cStat is not (135 or 136 or 573))
        {
            var motivo = infEvento?.xMotivo ?? retorno.RetornoStr ?? "SEFAZ não retornou motivo.";
            throw new InvalidOperationException($"SEFAZ rejeitou o cancelamento: {motivo}");
        }

        nota.Status                    = NotaFiscalStatus.Cancelada;
        nota.CanceladoEm                = DateTime.UtcNow;
        nota.JustificativaCancelamento  = justificativa.Trim();
        await _db.SaveChangesAsync();

        _logger.LogInformation("NFC-e {NotaId} (chave {Chave}) cancelada com sucesso.", nota.Id, nota.ChaveAcesso);
        return nota;
    }

    public async Task<CupomDto?> ObterCupomAsync(Guid notaId)
    {
        await GarantirModuloFiscalAtivoAsync();

        var nota = await _db.NotasFiscaisEmitidas.FindAsync(notaId);
        if (nota is null) return null;

        var dados = nota.Origem == NotaFiscalOrigem.Comanda
            ? await CarregarDadosComandaAsync(nota.ComandaId!.Value)
            : await CarregarDadosVendaAvulsaAsync(nota.VendaAvulsaId!);

        var cfg = await _db.FiscalConfigs.FindAsync(FiscalConfig.SingletonId);
        var endereco = cfg is null ? "" : $"{cfg.Logradouro}, {cfg.Numero} - {cfg.Bairro} - {cfg.Municipio}/{cfg.Uf}";

        return new CupomDto(
            RazaoSocial: cfg?.RazaoSocial ?? "",
            Cnpj:        cfg?.Cnpj ?? "",
            Endereco:    endereco,
            ChaveAcesso: nota.ChaveAcesso,
            Protocolo:   nota.Protocolo,
            EmitidoEm:   nota.EmitidoEm,
            Serie:       nota.Serie ?? 0,
            Numero:      nota.Numero ?? 0,
            Status:      nota.Status.ToString(),
            Itens:       dados.Itens.Select(i => new CupomItemDto(i.Nome, i.Quantidade, i.PrecoUnitarioCentavos, i.SubtotalCentavos)).ToList(),
            ValorTotalCentavos: nota.ValorTotalEmCentavos,
            FormaPagamento: dados.FormaPagamento,
            QrCodeUrl:   nota.UrlQrCode);
    }

    // ── Orquestração ──────────────────────────────────────────────────────────

    private async Task<NotaFiscalEmitida> EmitirAsync(NotaFiscalOrigem origem, Guid? comandaId, string? vendaAvulsaId)
    {
        // Defesa central: controllers, jobs e telas não são a fronteira de segurança.
        // Qualquer caller precisa passar pela trava antes de criar ou transmitir uma nota.
        await GarantirModuloFiscalAtivoAsync();

        // Idempotência: uma origem (comanda/venda avulsa) tem NO MÁXIMO uma nota. Sem isso,
        // clique duplo ou requisições concorrentes criavam duas notas pra mesma venda — e
        // duas NFC-e autorizadas pra uma venda só é problema fiscal sério. Reforçada pelos
        // índices únicos parciais no banco (ver Program.cs), que cobrem a corrida exata.
        var existente = await _db.NotasFiscaisEmitidas.FirstOrDefaultAsync(n =>
            origem == NotaFiscalOrigem.Comanda
                ? n.Origem == NotaFiscalOrigem.Comanda && n.ComandaId == comandaId
                : n.Origem == NotaFiscalOrigem.VendaAvulsa && n.VendaAvulsaId == vendaAvulsaId);
        if (existente is not null)
            // Se estiver num estado reprocessável, a "emissão" vira nova tentativa na MESMA
            // linha (rejeitada pega número novo; contingência reconstrói a mesma chave).
            return existente.Status is NotaFiscalStatus.PendenteEmissao or NotaFiscalStatus.Rejeitada or NotaFiscalStatus.AutorizadaContingencia
                ? await ReprocessarAsync(existente.Id)
                : existente; // Autorizada/Cancelada — nada a fazer.

        var nota = new NotaFiscalEmitida
        {
            Origem        = origem,
            ComandaId     = comandaId,
            VendaAvulsaId = vendaAvulsaId,
            Status        = NotaFiscalStatus.PendenteEmissao,
        };
        _db.NotasFiscaisEmitidas.Add(nota);
        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Perdeu a corrida contra outra requisição que inseriu a nota da mesma origem
            // primeiro (o índice único barrou a nossa) — descarta a linha local e usa a dela.
            _db.Entry(nota).State = EntityState.Detached;
            var vencedora = await _db.NotasFiscaisEmitidas.FirstAsync(n =>
                origem == NotaFiscalOrigem.Comanda
                    ? n.Origem == NotaFiscalOrigem.Comanda && n.ComandaId == comandaId
                    : n.Origem == NotaFiscalOrigem.VendaAvulsa && n.VendaAvulsaId == vendaAvulsaId);
            return vencedora.Status is NotaFiscalStatus.PendenteEmissao or NotaFiscalStatus.Rejeitada or NotaFiscalStatus.AutorizadaContingencia
                ? await ReprocessarAsync(vencedora.Id)
                : vencedora;
        }

        await ExecutarComTratamentoDeErroAsync(nota, async () =>
        {
            var dados = origem == NotaFiscalOrigem.Comanda
                ? await CarregarDadosComandaAsync(comandaId!.Value)
                : await CarregarDadosVendaAvulsaAsync(vendaAvulsaId!);

            nota.ValorTotalEmCentavos = dados.TotalCentavos; // líquido de desconto/pontos — não o bruto dos itens
            await TransmitirAsync(nota, dados);
        });

        return nota;
    }

    private async Task GarantirModuloFiscalAtivoAsync()
    {
        var moduloAtivo = await _db.FiscalConfigs
            .Where(c => c.Id == FiscalConfig.SingletonId)
            .Select(c => (bool?)c.ModuloFiscalAtivo)
            .FirstOrDefaultAsync();

        // Sem configuração não há dados/certificado suficientes para transmitir e o
        // fluxo antigo continua registrando a pendência de configuração. Assim que a
        // configuração existe, a liberação explícita passa a ser obrigatória.
        if (moduloAtivo == false)
            throw new FiscalModuloBloqueadoException();
    }

    /// <summary>
    /// Garantia central do serviço: falhas de emissão/reprocessamento viram
    /// PendenteEmissao (com log apropriado) em vez de derrubar o caller. A única exceção
    /// intencional é a trava geral, verificada antes de qualquer nota ser criada.
    /// </summary>
    private async Task ExecutarComTratamentoDeErroAsync(NotaFiscalEmitida nota, Func<Task> acao)
    {
        try
        {
            await acao();
        }
        catch (ComandaCanceladaException)
        {
            // Comanda foi cancelada antes da nota ser transmitida à SEFAZ — nunca chegou a
            // existir de verdade, então não há evento de cancelamento a fazer, só anular
            // localmente para o retry automático parar de tentar emitir esta nota.
            nota.Status                   = NotaFiscalStatus.Cancelada;
            nota.CanceladoEm              = DateTime.UtcNow;
            nota.JustificativaCancelamento = "Comanda cancelada antes da emissão fiscal — nota anulada automaticamente (nunca transmitida à SEFAZ).";
            await _db.SaveChangesAsync();

            _logger.LogInformation(
                "NFC-e {NotaId} anulada automaticamente — comanda de origem foi cancelada antes da transmissão.", nota.Id);
        }
        catch (NadaAFaturarException ex)
        {
            // Terminal: sem itens ou valor zero, nenhuma nova tentativa vai mudar nada.
            // Marcar Rejeitada tira a nota da fila do FiscalRetryBackgroundService, que só
            // pega PendenteEmissao — senão ela ficaria sendo retentada indefinidamente.
            nota.Status         = NotaFiscalStatus.Rejeitada;
            nota.MotivoRejeicao = ex.Message;
            await _db.SaveChangesAsync();

            _logger.LogWarning(
                "NFC-e {NotaId} ({Origem}) não emitida — {Motivo} Nenhum número fiscal foi consumido.",
                nota.Id, nota.Origem, ex.Message);
        }
        catch (FiscalNaoConfiguradoException ex)
        {
            // Estado esperado enquanto o admin não termina de configurar — não é uma falha real.
            nota.MotivoRejeicao = $"Configuração fiscal pendente: {ex.Message}";
            await _db.SaveChangesAsync();

            _logger.LogInformation(
                "NFC-e {NotaId} ({Origem}) não emitida — {Motivo} Nota registrada como PendenteEmissao.",
                nota.Id, nota.Origem, ex.Message);
        }
        catch (Exception ex)
        {
            // Nunca deixa a emissão fiscal derrubar o fechamento da venda — mas isso AQUI
            // é um erro de verdade (motor configurado mas falhou), por isso LogError.
            _logger.LogError(ex,
                "Falha ao emitir NFC-e {NotaId} ({Origem}) — motor configurado mas a transmissão falhou. " +
                "Nota registrada como PendenteEmissao para nova tentativa.", nota.Id, nota.Origem);

            // Persiste o motivo pra nota não ficar "pendente sem explicação" no painel —
            // antes disso aqui, uma falha inesperada (ex: erro ao assinar o XML) deixava
            // MotivoRejeicao nulo e o admin não tinha pista nenhuma do que aconteceu.
            try
            {
                nota.MotivoRejeicao = $"Falha inesperada na emissão: {ex.Message}";
                nota.UpdatedAt      = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }
            catch (Exception ex2)
            {
                _logger.LogError(ex2, "Não foi possível gravar o motivo da falha da NFC-e {NotaId}.", nota.Id);
            }
        }
    }

    // ── Carregamento dos dados de origem ──────────────────────────────────────

    internal record ItemFiscal(
        string Nome, string Ncm, string Cfop, string? Csosn, decimal? PercentualCreditoSn,
        int Quantidade, int PrecoUnitarioCentavos, int SubtotalCentavos,
        string? Cest = null);

    private record DadosEmissao(
        List<ItemFiscal> Itens, string FormaPagamento, string? ClienteCpf,
        string? SegundaFormaPagamento, int SegundoValorCentavos,
        // Total REALMENTE cobrado do cliente (já líquido de desconto/pontos aplicados) —
        // diferente de Itens.Sum(SubtotalCentavos), que é o valor BRUTO dos itens. Usado
        // pra declarar vNF/vDesc corretos na nota — sem isso a NFC-e saía pelo valor cheio
        // mesmo quando o cliente pagou menos (desconto/pontos nunca chegavam na nota).
        int TotalCentavos);

    private async Task<DadosEmissao> CarregarDadosComandaAsync(Guid comandaId)
    {
        var comanda = await _db.Comandas
            .Include(c => c.Items).ThenInclude(i => i.Product).ThenInclude(p => p!.NaturezaOperacao)
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == comandaId)
            ?? throw new InvalidOperationException($"Comanda {comandaId} não encontrada para emissão fiscal.");

        if (comanda.Status == ComandaStatus.Cancelada)
            throw new ComandaCanceladaException(comandaId);

        var padrao = await _db.NaturezasOperacao.FirstOrDefaultAsync(n => n.IsPadrao);

        var semNcm = comanda.Items
            .Where(item => string.IsNullOrWhiteSpace(item.Product?.Ncm))
            .Select(item => item.ItemNameSnapshot)
            .Distinct()
            .ToList();
        if (semNcm.Count > 0)
            throw new FiscalNaoConfiguradoException(
                $"Produto(s) sem NCM cadastrado (Admin > Estoque): {string.Join(", ", semNcm)}. " +
                "O NCM deve vir da nota fiscal de compra do produto — não é inventado pelo sistema.");

        var ncmInvalido = comanda.Items
            .Where(item => SanitizeNcm(item.Product?.Ncm).Length != 8)
            .Select(item => item.ItemNameSnapshot)
            .Distinct()
            .ToList();
        if (ncmInvalido.Count > 0)
            throw new FiscalNaoConfiguradoException(
                $"NCM inválido (precisa ter 8 dígitos) em: {string.Join(", ", ncmInvalido)}. " +
                "Corrija em Admin > Estoque — só números, sem ponto.");

        var itens = comanda.Items.Select(item => new ItemFiscal(
            Nome:                 item.ItemNameSnapshot,
            Ncm:                  SanitizeNcm(item.Product!.Ncm),
            Cfop:                 item.Product?.NaturezaOperacao?.Cfop ?? padrao?.Cfop ?? "5102",
            Csosn:                item.Product?.NaturezaOperacao?.Csosn ?? padrao?.Csosn ?? "102",
            PercentualCreditoSn:  item.Product?.NaturezaOperacao?.PercentualCreditoIcmsSn ?? padrao?.PercentualCreditoIcmsSn,
            Quantidade:           item.Quantity,
            PrecoUnitarioCentavos: item.UnitPriceInCents,
            SubtotalCentavos:     item.SubtotalInCents,
            Cest:                 item.Product?.Cest
        )).ToList();

        ValidarTemOQueFaturar(itens.Count, comanda.TotalInCents, $"Comanda {comanda.Id}");

        return new DadosEmissao(
            itens, comanda.PaymentMethod ?? "Dinheiro", comanda.User?.Cpf,
            comanda.SecondPaymentMethod, comanda.SecondPaymentAmountInCents,
            comanda.TotalInCents); // já líquido de PointsApplied/DiscountInCents (ver ComandaService)
    }

    /// <summary>
    /// Barra nota sem item ou com valor zero ANTES de reservar número na sequência fiscal.
    /// Sem isto, fechar uma comanda vazia com "emitir nota" marcado gerava um XML sem
    /// nenhum &lt;det&gt; — que o layout da NF-e exige (mínimo 1) — e a SEFAZ devolvia
    /// cStat 225 "Falha no Schema XML". O estrago não era só a rejeição: o número fiscal
    /// já tinha sido consumido e ficava um furo na sequência, que depois precisa de
    /// inutilização. Observado em produção em 30/07/2026 (nota nº 31, tudo 0.00).
    /// </summary>
    private static void ValidarTemOQueFaturar(int quantidadeItens, int totalCentavos, string origem)
    {
        if (quantidadeItens == 0)
            throw new NadaAFaturarException(
                $"{origem} não tem itens — não é possível emitir NFC-e de uma venda vazia. " +
                "A nota fiscal precisa de pelo menos um produto.");

        if (totalCentavos <= 0)
            throw new NadaAFaturarException(
                $"{origem} tem valor total de R$ {totalCentavos / 100m:N2} — não é possível emitir " +
                "NFC-e de valor zero. Confira se o desconto não zerou a venda inteira.");
    }

    private async Task<DadosEmissao> CarregarDadosVendaAvulsaAsync(string vendaAvulsaId)
    {
        var collection = _mongo.GetCollection<CardGameStore.Models.MongoDB.VendaAvulsa>("vendas_avulsas");
        var venda = await collection.Find(v => v.Id == vendaAvulsaId).FirstOrDefaultAsync()
            ?? throw new InvalidOperationException($"Venda avulsa {vendaAvulsaId} não encontrada para emissão fiscal.");

        var productIds = venda.Items.Select(i => i.ProductId).Distinct().ToList();
        var products = await _db.Products
            .Include(p => p.NaturezaOperacao)
            .Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id);

        var padrao = await _db.NaturezasOperacao.FirstOrDefaultAsync(n => n.IsPadrao);

        var semNcm = venda.Items
            .Where(item => { products.TryGetValue(item.ProductId, out var p); return string.IsNullOrWhiteSpace(p?.Ncm); })
            .Select(item => item.ProductName)
            .Distinct()
            .ToList();
        if (semNcm.Count > 0)
            throw new FiscalNaoConfiguradoException(
                $"Produto(s) sem NCM cadastrado (Admin > Estoque): {string.Join(", ", semNcm)}. " +
                "O NCM deve vir da nota fiscal de compra do produto — não é inventado pelo sistema.");

        var ncmInvalido = venda.Items
            .Where(item => { products.TryGetValue(item.ProductId, out var p); return SanitizeNcm(p?.Ncm).Length != 8; })
            .Select(item => item.ProductName)
            .Distinct()
            .ToList();
        if (ncmInvalido.Count > 0)
            throw new FiscalNaoConfiguradoException(
                $"NCM inválido (precisa ter 8 dígitos) em: {string.Join(", ", ncmInvalido)}. " +
                "Corrija em Admin > Estoque — só números, sem ponto.");

        var itens = venda.Items.Select(item =>
        {
            products.TryGetValue(item.ProductId, out var product);
            return new ItemFiscal(
                Nome:                 item.ProductName,
                Ncm:                  SanitizeNcm(product!.Ncm),
                Cfop:                 product?.NaturezaOperacao?.Cfop ?? padrao?.Cfop ?? "5102",
                Csosn:                product?.NaturezaOperacao?.Csosn ?? padrao?.Csosn ?? "102",
                PercentualCreditoSn:  product?.NaturezaOperacao?.PercentualCreditoIcmsSn ?? padrao?.PercentualCreditoIcmsSn,
                Quantidade:           item.Quantity,
                PrecoUnitarioCentavos: item.UnitPriceInCents,
                SubtotalCentavos:     item.SubtotalInCents,
                Cest:                 product?.Cest
            );
        }).ToList();

        string? cpf = null;
        if (venda.UserId.HasValue)
            cpf = (await _db.Users.FindAsync(venda.UserId.Value))?.Cpf;

        ValidarTemOQueFaturar(itens.Count, venda.TotalInCents, $"Venda avulsa {venda.Id}");

        return new DadosEmissao(
            itens, venda.PaymentMethod, cpf,
            venda.SecondPaymentMethod, venda.SecondPaymentAmountInCents,
            venda.TotalInCents); // já líquido de DiscountInCents (ver VendaAvulsaService)
    }

    // ── Montagem, assinatura e transmissão ─────────────────────────────────────

    /// <summary>
    /// Carrega o certificado (descriptografado) e monta a config de conexão com a SEFAZ,
    /// reaproveitada por emissão, cancelamento e inutilização.
    /// </summary>
    private async Task<(FiscalConfig cfg, ConfiguracaoServico cfgServico, X509Certificate2 certificado,
        ConfiguracaoCertificado cfgCertificado, Estado estado, TipoAmbiente ambiente)>
        AbrirConfiguracaoSefazAsync()
    {
        var cfg = await _db.FiscalConfigs.FindAsync(FiscalConfig.SingletonId);
        if (cfg is null || !cfg.CertificadoConfigurado)
            throw new FiscalNaoConfiguradoException("Certificado digital ainda não configurado.");

        if (string.IsNullOrWhiteSpace(cfg.RazaoSocial) || string.IsNullOrWhiteSpace(cfg.Logradouro) ||
            string.IsNullOrWhiteSpace(cfg.CodigoMunicipioIbge) || string.IsNullOrWhiteSpace(cfg.Uf))
            throw new FiscalNaoConfiguradoException("Dados da empresa (razão social/endereço) incompletos em Admin > Fiscal.");

        // CscId/CscToken são obrigatórios especificamente pra NFC-e (mod=65) — o grupo
        // <infNFeSupl><qrCode> é exigido pela XSD da SEFAZ só pra NFC-e (não existe essa
        // exigência pra NF-e mod=55). Sem CSC configurado, TransmitirAsync ainda monta um
        // <infNFeSupl> vazio (só pra manter a estrutura) e a SEFAZ rejeita o LOTE inteiro
        // com cStat 225 "Falha no Schema XML do lote de NFe" — sem isso aqui, cada
        // reprocessamento queima e inutiliza um número novo de NFC-e à toa.
        if (string.IsNullOrWhiteSpace(cfg.CscId) || string.IsNullOrWhiteSpace(cfg.CscToken))
            throw new FiscalNaoConfiguradoException(
                "CSC (Código de Segurança do Contribuinte) ainda não configurado — obrigatório " +
                "pra NFC-e ter o QR Code exigido pela SEFAZ. Configure em Admin > Fiscal.");

        var pfxBytes    = Convert.FromBase64String(_enc.Decrypt(cfg.CertificadoPfxEncrypted!));
        var senha       = _enc.Decrypt(cfg.CertificadoSenhaEncrypted!);
        var certificado = Pkcs12Loader.Abrir(pfxBytes, senha);

        // Certificado vencido derruba a autenticação mTLS na hora de falar com a SEFAZ, e o
        // .NET embrulha isso em HttpRequestException — o MESMO tipo que EhFalhaDeConectividade
        // usa pra reconhecer "SEFAZ fora do ar" e mandar a nota pra contingência offline. Sem
        // esse check, um certificado vencido seria tratado como problema de rede: o cliente
        // sairia com um cupom "válido" que a SEFAZ nunca vai aceitar transmitir de verdade, e
        // o retry automático ficaria tentando por até 24h achando que é só instabilidade.
        if (certificado.NotAfter.ToUniversalTime() < DateTime.UtcNow)
            throw new FiscalNaoConfiguradoException(
                $"Certificado digital vencido em {certificado.NotAfter:dd/MM/yyyy} — renove em Admin > Fiscal antes de emitir.");

        // TipoCertificado precisa vir ANTES de Senha (a ordem importa: o setter de Senha
        // valida contra o tipo já setado). Sem isso, ConfiguracaoCertificado.TipoCertificado
        // fica no padrão A1Repositorio (certificado instalado no repositório do Windows, sem
        // senha nenhuma) — e setar Senha nesse modo lança "Para Certificado A1 o Senha não
        // deve ser informada!". A gente guarda o .pfx como bytes no banco (A1ByteArray), não
        // no repositório do Windows — esse era o bug real por trás do erro confuso de "senha".
        var cfgCertificado = new ConfiguracaoCertificado
        {
            TipoCertificado    = TipoCertificado.A1ByteArray,
            ArrayBytesArquivo  = pfxBytes,
            Senha              = senha,
        };

        var estado   = Enum.Parse<Estado>(cfg.Uf);
        var ambiente = cfg.Ambiente == AmbienteFiscal.Producao ? TipoAmbiente.Producao : TipoAmbiente.Homologacao;

        var cfgServico = new ConfiguracaoServico
        {
            cUF             = estado,
            tpAmb           = ambiente,
            ModeloDocumento = ModeloDocumento.NFCe,
            VersaoLayout    = VersaoServico.Versao400,
            // tpEmis fica 0 (valor de enum inválido) se não for setado — a lib usa esse
            // campo pra procurar a URL do webservice numa tabela interna (UF+ambiente+
            // serviço+versão+tipoEmissao) e lança "Serviço X, versão , não disponível
            // para a UF Y..." (mensagem com "versão"/"tipo" em branco) se não achar
            // entrada pra tipoEmissao=0. teNormal é o certo pra emissão online — quem
            // entra em contingência offline (TransmitirAsync) sobrescreve pra teOffLine
            // só na hora de chamar NFeAutorizacao, igual o tpEmis já gravado na própria
            // NFe (nfe.infNFe.ide.tpEmis).
            tpEmis          = TipoEmissao.teNormal,
            TimeOut         = 15000,
            // Sem XSDs locais empacotados — a SEFAZ valida o schema no recebimento de qualquer forma.
            ValidarSchemas  = false,
        };

        return (cfg, cfgServico, certificado, cfgCertificado, estado, ambiente);
    }

    /// <summary>
    /// Reserva atomicamente o próximo número de NFC-e via UPDATE...RETURNING no Postgres —
    /// evita que dois fechamentos de comanda simultâneos peguem o mesmo número (a leitura +
    /// incremento em memória do EF não é segura contra concorrência entre requisições).
    /// </summary>
    private async Task<int> ReservarProximoNumeroNfceAsync(Guid fiscalConfigId)
    {
        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync();

        await using var cmd = conn.CreateCommand();
        cmd.CommandText =
            "UPDATE fiscal_config SET proximo_numero_nfce = proximo_numero_nfce + 1, updated_at = now() " +
            "WHERE id = @id RETURNING proximo_numero_nfce - 1";
        var param = cmd.CreateParameter();
        param.ParameterName = "id";
        param.Value = fiscalConfigId;
        cmd.Parameters.Add(param);

        var resultado = await cmd.ExecuteScalarAsync()
            ?? throw new InvalidOperationException("Não foi possível reservar o número da NFC-e — FiscalConfig não encontrado.");
        return Convert.ToInt32(resultado);
    }

    private async Task TransmitirAsync(NotaFiscalEmitida nota, DadosEmissao dados)
    {
        // Checa o modo simulação ANTES de exigir certificado — é justamente o caminho pra
        // testar o resto do fluxo (numeração, cupom, banco) sem ter um A1 configurado ainda.
        var cfgAtual = await _db.FiscalConfigs.FindAsync(FiscalConfig.SingletonId)
            ?? throw new FiscalNaoConfiguradoException("Configuração fiscal ainda não cadastrada (Admin > Fiscal).");

        if (cfgAtual.ModoSimulacao)
        {
            await TransmitirSimuladoAsync(nota, dados, cfgAtual);
            return;
        }

        var (cfg, cfgServico, certificado, cfgCertificado, estado, ambiente) = await AbrirConfiguracaoSefazAsync();
        using var _certDispose = certificado;

        // Monta os itens (e valida CSOSN) ANTES de reservar o número — uma Natureza de
        // Operação mal configurada não pode queimar um número de NFC-e sem transmitir nada.
        // A validação 1115 da NT 2025.002 exige o grupo IBS/CBS em homologação desde
        // 06/10/2025, inclusive para emitentes do Simples. Em produção, o Simples só
        // passa a destacar esses campos em 2027; durante 2026 a exigência é do regime
        // normal. As alíquotas abaixo são as alíquotas-teste oficiais de 2026.
        var jaEmContingencia = nota.CnfContingencia.HasValue;
        var anoIbsCbs = jaEmContingencia ? ParaBrasil(nota.CreatedAt).Year : AgoraBrasil().Year;
        var incluirIbsCbs = ambiente == TipoAmbiente.Homologacao ||
            cfg.RegimeTributario != RegimeTributario.SimplesNacional || anoIbsCbs >= 2027;
        if (incluirIbsCbs && anoIbsCbs != 2026)
            throw new FiscalNaoConfiguradoException(
                $"As alíquotas de IBS/CBS para {anoIbsCbs} ainda não estão configuradas no sistema. " +
                "Atualize a configuração fiscal conforme a tabela oficial vigente antes de emitir.");
        // O desconto precisa aparecer TAMBÉM item a item: a SEFAZ confere que ICMSTot.vDesc
        // é igual ao somatório dos prod.vDesc. Calculado aqui, em centavos, pra soma fechar
        // exata — dividir o valor em reais item a item deixaria diferença de arredondamento.
        var descontoCentavos = Math.Max(0, dados.Itens.Sum(i => i.SubtotalCentavos) - dados.TotalCentavos);
        var rateioDesconto   = RatearDesconto(dados.Itens, descontoCentavos);

        var detItens = dados.Itens
            .Select((item, idx) => MontarItem(item, idx + 1, incluirIbsCbs, rateioDesconto[idx]))
            .ToList();
        if (ambiente == TipoAmbiente.Homologacao && detItens.Count > 0)
            detItens[0].prod.xProd = ProdutoHomologacao;

        // Se esta nota já entrou em contingência offline numa tentativa anterior, a
        // retransmissão precisa reconstruir a MESMA chave de acesso (já mostrada ao
        // cliente no cupom) — número, cNf e tpEmis não podem mudar entre tentativas.
        var numero = jaEmContingencia ? nota.Numero!.Value : await ReservarProximoNumeroNfceAsync(cfg.Id);
        // Uma nova tentativa online recebe novo número/chave e precisa usar o horário
        // atual. Reaproveitar nota.CreatedAt depois de alguns minutos é rejeitado pela SEFAZ
        // como "Data-Hora de emissão atrasada". Só a contingência retransmitida preserva
        // o horário original porque precisa reconstruir a mesma emissão entregue ao cliente.
        var dhEmi  = jaEmContingencia ? ParaBrasil(nota.CreatedAt) : AgoraBrasil();
        var cNf    = jaEmContingencia ? nota.CnfContingencia!.Value : Random.Shared.Next(10_000_000, 99_999_999);
        var tpEmis = jaEmContingencia ? TipoEmissao.teOffLine : TipoEmissao.teNormal;
        // cfgServico.tpEmis já vem teNormal de AbrirConfiguracaoSefazAsync — só precisa
        // trocar pra teOffLine aqui quando a retransmissão é de uma nota que já entrou
        // em contingência (senão o lookup de URL do webservice usa o tipo errado).
        cfgServico.tpEmis = tpEmis;
        var cnpjEmitente = NormalizarCnpjParaSefaz(cfg.Cnpj);
        var chave  = ChaveFiscal.ObterChave(estado, dhEmi, cnpjEmitente, ModeloDocumento.NFCe, cfg.SerieNfce, numero, (int)tpEmis, cNf);

        var municipioIbge = long.Parse(cfg.CodigoMunicipioIbge!);
        // vProd = valor BRUTO dos itens (soma dos subtotais, sem desconto/pontos) — é o
        // valor de mercadoria de cada item, igual ao det. vNF = TotalCentavos, o valor
        // REALMENTE cobrado (já líquido de desconto/pontos aplicados na comanda/venda
        // avulsa). A diferença vira vDesc — sem isso a nota saía pelo valor cheio mesmo
        // quando o cliente pagou menos (ex: desconto de R$10 numa comanda de R$50 saía
        // como R$50 na NFC-e, não R$40).
        var valorBrutoItens = dados.Itens.Sum(i => i.SubtotalCentavos) / 100m;
        var valorTotal      = dados.TotalCentavos / 100m;
        var valorDesconto   = Math.Max(0, valorBrutoItens - valorTotal);

        var nfe = new NfeDocumento
        {
            infNFe = new infNFe
            {
                versao = "4.00",
                ide = new ide
                {
                    cUF     = estado,
                    cNF     = cNf.ToString("D8"),
                    natOp   = "Venda de mercadoria",
                    mod     = ModeloDocumento.NFCe,
                    serie   = cfg.SerieNfce,
                    nNF     = numero,
                    dhEmi   = dhEmi,
                    tpNF    = TipoNFe.tnSaida,
                    idDest  = DestinoOperacao.doInterna,
                    cMunFG  = municipioIbge,
                    tpImp   = TipoImpressao.tiNFCe,
                    tpEmis  = tpEmis,
                    cDV     = chave.DigitoVerificador,
                    tpAmb   = ambiente,
                    finNFe  = FinalidadeNFe.fnNormal,
                    indFinal = ConsumidorFinal.cfConsumidorFinal,
                    indPres  = PresencaComprador.pcPresencial,
                    procEmi  = ProcessoEmissao.peAplicativoContribuinte,
                    verProc  = "1.0",
                },
                emit = new emit
                {
                    CNPJ  = cnpjEmitente,
                    xNome = cfg.RazaoSocial,
                    // A IE usa o tipo TIE no XSD: somente dígitos. O formato
                    // comum da tela, "405.112.760.115", fazia o lote inteiro cair no cStat 225.
                    IE    = string.IsNullOrWhiteSpace(cfg.InscricaoEstadual)
                        ? null
                        : SomenteDigitos(cfg.InscricaoEstadual),
                    CRT   = MapCrt(cfg.RegimeTributario),
                    enderEmit = new enderEmit
                    {
                        xLgr    = cfg.Logradouro,
                        nro     = cfg.Numero ?? "S/N",
                        xCpl    = cfg.Complemento,
                        xBairro = cfg.Bairro ?? "-",
                        cMun    = municipioIbge,
                        xMun    = cfg.Municipio ?? "-",
                        UF      = estado,
                        // Mesma classe de bug do NCM/CFOP: o CEP precisa ir só com dígitos
                        // (a lib valida "deve receber somente números"). O admin pode ter
                        // digitado com hífen ("01234-567") no formulário — sanitiza aqui pra
                        // não depender só da validação de tela nem quebrar config salva antes.
                        CEP     = SomenteDigitos(cfg.Cep),
                    },
                },
                dest = string.IsNullOrWhiteSpace(dados.ClienteCpf) ? null : new dest(VersaoServico.Versao400)
                {
                    CPF       = dados.ClienteCpf,
                    xNome     = ambiente == TipoAmbiente.Homologacao ? DestinatarioHomologacao : null,
                    indIEDest = indIEDest.NaoContribuinte,
                },
                det = detItens,
                total = new total
                {
                    ICMSTot = new ICMSTot
                    {
                        // Apesar de serem zero no Simples Nacional, estes campos são 1-1
                        // no leiaute 4.00. Na classe da Zeus eles são nullable por compatibilidade
                        // com layouts antigos e somem do XML se não forem setados, causando 225.
                        vBC = 0, vICMS = 0, vICMSDeson = 0, vFCP = 0,
                        vBCST = 0, vST = 0, vFCPST = 0, vFCPSTRet = 0,
                        vProd    = valorBrutoItens,
                        vFrete   = 0, vSeg = 0, vDesc = valorDesconto, vII = 0, vIPI = 0,
                        vIPIDevol = 0,
                        vPIS     = 0, vCOFINS = 0, vOutro = 0,
                        vNF      = valorTotal,
                    },
                    IBSCBSTot = incluirIbsCbs ? MontarTotaisIbsCbs2026(detItens) : null,
                },
                // O grupo transp é obrigatório no leiaute 4.00 mesmo na NFC-e presencial.
                // Para NFC-e, a modalidade correta é 9 (sem ocorrência de transporte).
                transp = new transp { modFrete = ModalidadeFrete.mfSemFrete },
                pag = new List<pag> { new pag { detPag = MontarDetPag(dados, valorTotal) } },
            },
        };

        // dhCont/xJust só existem (e são exigidos) em contingência offline (tpEmis=9) — a
        // lib só serializa esses campos quando fazem sentido pro tpEmis atual.
        if (jaEmContingencia)
        {
            nfe.infNFe.ide.dhCont = ParaBrasil(nota.DhContingencia!.Value);
            nfe.infNFe.ide.xJust  = nota.JustificativaContingencia;
        }

        nfe.Assina(cfgServico, certificado);

        // QR Code: usa a própria lib (sabe a URL certa de cada estado e o hash do CSC) em vez
        // de reimplementar isso na mão — evita erro de domínio/fórmula por estado. A versão 3
        // foi implantada nacionalmente pela NT 2025.001; enviar o leiaute v2 atualmente faz a
        // NFC-e falhar na validação do XML (cStat 225) antes das rejeições específicas.
        nfe.infNFeSupl = new infNFeSupl();
        var qrCodeUrl = string.IsNullOrWhiteSpace(cfg.CscId) || string.IsNullOrWhiteSpace(cfg.CscToken)
            ? null
            : ExtinfNFeSupl.ObterUrlQrCode(nfe.infNFeSupl, nfe, VersaoQrCode.QrCodeVersao3, cfg.CscId, cfg.CscToken, cfgCertificado);
        if (qrCodeUrl is not null)
            nfe.infNFeSupl.qrCode = qrCodeUrl;
        // No QR Code v3, urlChave passou a ser obrigatória no infNFeSupl. O helper de
        // ObterUrlQrCode monta apenas o QR; a URL de consulta precisa ser preenchida à parte.
        nfe.infNFeSupl.urlChave = ExtinfNFeSupl.ObterUrlConsulta(
            nfe.infNFeSupl, nfe, VersaoQrCode.QrCodeVersao3);

        using var servico = new ServicosNFe(cfgServico, certificado);
        RetornoNFeAutorizacao retorno;
        try
        {
            retorno = servico.NFeAutorizacao(1, IndicadorSincronizacao.Sincrono, new List<NfeDocumento> { nfe }, false);
        }
        catch (Exception ex) when (EhFalhaDeConectividade(ex))
        {
            if (!jaEmContingencia)
            {
                // 1ª vez inalcançável nesta nota: entra em contingência offline agora — o
                // cliente já sai com o cupom (chave/QR válidos), a retransmissão de verdade
                // acontece sozinha no próximo ciclo do FiscalRetryBackgroundService.
                nota.Serie                     = cfg.SerieNfce;
                nota.Numero                    = numero;
                nota.CnfContingencia           = cNf;
                nota.DhContingencia            = DateTime.UtcNow;
                nota.JustificativaContingencia = "Sem comunicação com o webservice da SEFAZ no momento da venda.";
                nota.Status                    = NotaFiscalStatus.AutorizadaContingencia;
                nota.ChaveAcesso                = chave.Chave;
                nota.EmitidoEm                  = DateTime.UtcNow;
                nota.UrlQrCode                  = qrCodeUrl;
                await _db.SaveChangesAsync();

                _logger.LogWarning(ex,
                    "NFC-e {NotaId} emitida em CONTINGÊNCIA offline — SEFAZ inalcançável no momento da venda. " +
                    "Retransmissão automática tentará no próximo ciclo.", nota.Id);
            }
            else
            {
                // Já estava em contingência e a SEFAZ continua inalcançável — tenta de novo depois.
                _logger.LogWarning(ex,
                    "NFC-e {NotaId} (em contingência desde {DhContingencia}) ainda não conseguiu retransmitir — " +
                    "SEFAZ continua inalcançável.", nota.Id, nota.DhContingencia);
            }
            return;
        }

        var protInfo = retorno.Retorno?.protNFe?.infProt;

        // Número já foi consumido e persistido atomicamente em ReservarProximoNumeroNfceAsync,
        // autorizada ou não — a numeração da NFC-e não pode ser reaproveitada sem inutilização.
        nota.Serie     = cfg.SerieNfce;
        nota.Numero    = numero;
        nota.UpdatedAt = DateTime.UtcNow;

        // Quando a transmissão veio com 539 e a consulta não confirmou o estado real da
        // chave, a inutilização automática fica PROIBIDA — o número pode estar autorizado
        // na SEFAZ e a divergência é exatamente o que estamos evitando. Regularização manual.
        var inutilizacaoBloqueada = false;

        if (protInfo is not null && protInfo.cStat == 100)
        {
            nota.Status         = NotaFiscalStatus.Autorizada;
            nota.ChaveAcesso    = protInfo.chNFe ?? chave.Chave;
            nota.Protocolo      = protInfo.nProt;
            // Se veio de contingência, EmitidoEm já é o momento real da venda — não pisa nele
            // com o momento da confirmação tardia da SEFAZ.
            nota.EmitidoEm    ??= DateTime.UtcNow;
            // O "XML autorizado" de verdade é o nfeProc (NFe assinada + protNFe) — é o
            // documento que o contador precisa receber e que vale juridicamente. Antes se
            // guardava o envelope de ENVIO (EnvioStr), que não tem o protocolo de autorização.
            nota.XmlAutorizado  = MontarXmlProcNfe(nfe, retorno.Retorno!.protNFe!);
            nota.UrlQrCode      = qrCodeUrl;
            nota.MotivoRejeicao = null; // limpa motivo de tentativas anteriores que falharam antes desta autorização
        }
        else if (protInfo is not null && protInfo.cStat == 539)
        {
            // Duplicidade: a chave já existe na SEFAZ — na prática, uma tentativa anterior
            // AUTORIZOU a nota e a resposta se perdeu (timeout/rede). Marcar Rejeitada aqui
            // (e inutilizar o número!) criaria divergência grave com a SEFAZ, onde a nota
            // consta autorizada. Consulta a situação real da chave e reconcilia o estado.
            inutilizacaoBloqueada = !await ConciliarDuplicidadeAsync(servico, nota, nfe, chave.Chave);
        }
        else
        {
            nota.Status         = NotaFiscalStatus.Rejeitada;
            nota.MotivoRejeicao = protInfo?.xMotivo ?? retorno.RetornoStr ?? "SEFAZ não retornou motivo.";

            // A rejeição 225 acontece no schema do lote, antes de a SEFAZ informar qual
            // campo da NFC-e está inválido. Guardar o XML na entidade confundiria um XML
            // rejeitado com XmlAutorizado; por isso ele vai somente para o log de erro, onde
            // pode ser coletado pontualmente para validação contra a XSD oficial.
            if (retorno.Retorno?.cStat == 225)
                _logger.LogError(
                    "SEFAZ rejeitou NFC-e {NotaId} com cStat 225. XML exato enviado: {XmlEnvio}",
                    nota.Id, retorno.EnvioStr);
        }

        await _db.SaveChangesAsync();

        // Número já foi consumido acima independente do resultado — se rejeitada, esse
        // número nunca vai ser usado por nenhuma nota autorizada, então formaliza a
        // inutilização na hora pra não deixar buraco na numeração sem justificativa.
        // EXCEÇÕES (regularização manual, nunca automática):
        //  - nota que chegou a sair em contingência: o cliente já tem o cupom com a chave,
        //    inutilizar o número invalidaria o cupom entregue;
        //  - duplicidade (539) inconclusiva: a chave existe na SEFAZ mas a consulta não
        //    confirmou o estado — o número pode estar autorizado lá.
        if (nota.Status == NotaFiscalStatus.Rejeitada && nota.CnfContingencia is null && !inutilizacaoBloqueada)
        {
            try
            {
                await InutilizarNumeroAsync(cfg, cfgServico, certificado, nota, numero, dhEmi.Year);
            }
            catch (Exception ex)
            {
                // Inutilização é best-effort — não pode fazer a nota "sumir" do fluxo por causa disso.
                _logger.LogError(ex, "Falha ao inutilizar o número {Numero} da NFC-e rejeitada {NotaId}.", numero, nota.Id);
            }
        }
        else if (nota.Status == NotaFiscalStatus.Rejeitada)
        {
            _logger.LogWarning(
                "NFC-e {NotaId} (número {Numero}) saiu em contingência e foi rejeitada na retransmissão: {Motivo}. " +
                "Número NÃO inutilizado porque o cliente já recebeu o cupom — regularizar manualmente com o contador.",
                nota.Id, numero, nota.MotivoRejeicao);
        }
    }

    /// <summary>
    /// Trata o cStat 539 (duplicidade de chave) consultando a situação real da nota na
    /// SEFAZ e reconciliando o estado local. O 539 quase sempre significa "autorizada
    /// numa tentativa anterior cuja resposta se perdeu" — nesse caso a nota vira
    /// Autorizada com o protocolo verdadeiro, em vez de Rejeitada + número inutilizado
    /// (divergência fiscal). Se a consulta falhar, deixa pendente pro próximo ciclo
    /// (a retransmissão vai receber 539 de novo e consultar outra vez).
    /// Retorna true quando o estado final ficou claro (Autorizada/Cancelada) e false
    /// quando a situação continuou incerta — nesse caso a inutilização é proibida.
    /// </summary>
    private async Task<bool> ConciliarDuplicidadeAsync(
        ServicosNFe servico, NotaFiscalEmitida nota, NfeDocumento nfe, string chave)
    {
        NFe.Classes.Servicos.Consulta.retConsSitNFe? situacao;
        try
        {
            situacao = await Task.Run(() => servico.NfeConsultaProtocolo(chave).Retorno);
        }
        catch (Exception ex)
        {
            nota.MotivoRejeicao = $"Duplicidade (539) na SEFAZ, mas a consulta da situação falhou: {ex.Message}. Nova tentativa no próximo ciclo.";
            _logger.LogWarning(ex, "NFC-e {NotaId}: recebeu 539 e a consulta de situação da chave falhou.", nota.Id);
            return false; // status permanece PendenteEmissao/AutorizadaContingencia — próximo ciclo tenta de novo
        }

        var infCons = situacao?.protNFe?.infProt;

        // O envelope da consulta usa 101/110/151 quando a nota foi cancelada/denegada —
        // checar ANTES do infProt, que nesses casos continua dizendo "100 autorizada".
        if (situacao is not null && situacao.cStat is 101 or 110 or 151)
        {
            nota.Status                    = NotaFiscalStatus.Cancelada;
            nota.CanceladoEm             ??= DateTime.UtcNow;
            nota.JustificativaCancelamento ??= "Cancelamento/denegacao registrada diretamente na SEFAZ (reconciliado após duplicidade 539).";
            nota.MotivoRejeicao            = null;
            _logger.LogWarning(
                "NFC-e {NotaId}: consulta após 539 mostrou nota cancelada/denegada na SEFAZ (cStat {CStat} — {Motivo}).",
                nota.Id, situacao.cStat, situacao.xMotivo);
            return true;
        }
        else if (infCons is not null && infCons.cStat == 100)
        {
            nota.Status         = NotaFiscalStatus.Autorizada;
            nota.ChaveAcesso    = infCons.chNFe ?? chave;
            nota.Protocolo      = infCons.nProt;
            nota.EmitidoEm    ??= DateTime.UtcNow;
            nota.XmlAutorizado  = MontarXmlProcNfe(nfe, situacao!.protNFe!);
            nota.MotivoRejeicao = null;
            _logger.LogInformation(
                "NFC-e {NotaId} reconciliada: já estava autorizada na SEFAZ (protocolo {Protocolo}) — " +
                "o 539 era a resposta perdida de uma tentativa anterior.",
                nota.Id, infCons.nProt);
            return true;
        }
        else
        {
            nota.Status         = NotaFiscalStatus.Rejeitada;
            nota.MotivoRejeicao =
                $"Duplicidade (539) e a consulta não confirmou autorização " +
                $"({situacao?.cStat} — {situacao?.xMotivo ?? infCons?.xMotivo}). " +
                "Verificar manualmente no portal da SEFAZ antes de qualquer inutilização.";
            _logger.LogWarning(
                "NFC-e {NotaId}: 539 sem autorização correspondente na consulta ({CStat} — {Motivo}).",
                nota.Id, situacao?.cStat, situacao?.xMotivo);
            return false;
        }
    }

    /// <summary>
    /// Monta o nfeProc (NFe assinada + protocolo de autorização) — o "XML autorizado"
    /// oficial que a exportação manda pro contador e que a SEFAZ/contador reconhecem
    /// como documento fiscal válido. Serializado com o mesmo helper da própria lib.
    /// </summary>
    private static string MontarXmlProcNfe(NfeDocumento nfe, NFe.Classes.Protocolo.protNFe protocolo) =>
        FuncoesXml.ClasseParaXmlString(new nfeProc
        {
            versao  = "4.00",
            NFe     = nfe,
            protNFe = protocolo,
        });

    /// <summary>
    /// Caminho de teste: monta e "assina" a nota só na memória (nem chega a existir um
    /// certificado carregado), reserva um número real de NFC-e (pra testar a numeração
    /// atômica de verdade) e marca a nota como Autorizada com uma chave/protocolo fake.
    /// Nenhuma requisição sai pro SEFAZ. O protocolo sempre começa com "SIMULADO-" — usado
    /// por <see cref="CancelarAsync"/> pra saber que essa nota nunca existiu pra SEFAZ.
    /// </summary>
    private async Task TransmitirSimuladoAsync(NotaFiscalEmitida nota, DadosEmissao dados, FiscalConfig cfg)
    {
        // Ainda valida CSOSN/NCM dos itens — é a mesma lógica de negócio que roda numa
        // emissão real, só a assinatura/transmissão à SEFAZ que é pulada.
        _ = dados.Itens.Select((item, idx) => MontarItem(item, idx + 1)).ToList();

        if (string.IsNullOrWhiteSpace(cfg.Cnpj) || string.IsNullOrWhiteSpace(cfg.Uf))
            throw new FiscalNaoConfiguradoException(
                "Mesmo em modo simulação, CNPJ e UF precisam estar preenchidos em Admin > Fiscal " +
                "pra gerar uma chave de acesso de teste coerente.");

        var jaEmContingencia = nota.CnfContingencia.HasValue;
        var numero = jaEmContingencia ? nota.Numero!.Value : await ReservarProximoNumeroNfceAsync(cfg.Id);
        var dhEmi  = ParaBrasil(nota.CreatedAt);
        var cNf    = jaEmContingencia ? nota.CnfContingencia!.Value : Random.Shared.Next(10_000_000, 99_999_999);
        var estado = Enum.Parse<Estado>(cfg.Uf);
        // Mesma fronteira da emissão real: a simulação tem que reprovar o CNPJ inválido
        // aqui, senão o lojista só descobre o problema no primeiro contato com a SEFAZ.
        var chave  = ChaveFiscal.ObterChave(estado, dhEmi, NormalizarCnpjParaSefaz(cfg.Cnpj), ModeloDocumento.NFCe, cfg.SerieNfce, numero, (int)TipoEmissao.teNormal, cNf);

        nota.Serie          = cfg.SerieNfce;
        nota.Numero         = numero;
        nota.Status         = NotaFiscalStatus.Autorizada;
        nota.ChaveAcesso    = chave.Chave;
        nota.Protocolo      = $"SIMULADO-{DateTime.UtcNow:yyyyMMddHHmmssfff}";
        nota.EmitidoEm    ??= DateTime.UtcNow;
        nota.UrlQrCode      = null;
        nota.MotivoRejeicao = null;
        nota.UpdatedAt      = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        _logger.LogWarning(
            "NFC-e {NotaId} 'autorizada' em MODO SIMULAÇÃO (protocolo {Protocolo}) — nenhuma transmissão " +
            "real foi feita à SEFAZ. Desative FiscalConfig.ModoSimulacao antes de operar com clientes de verdade.",
            nota.Id, nota.Protocolo);
    }

    private async Task InutilizarNumeroAsync(
        FiscalConfig cfg, ConfiguracaoServico cfgServico, X509Certificate2 certificado,
        NotaFiscalEmitida nota, int numero, int anoEmissao)
    {
        using var servico = new ServicosNFe(cfgServico, certificado);
        var justificativa = $"Numero da NFCe {nota.Id} rejeitado pela SEFAZ, inutilizado automaticamente.";
        // O ano precisa ser o mesmo usado no dhEmi/chave desta tentativa. Isso importa
        // quando uma venda pendente de dezembro é reprocessada online em janeiro.
        var retorno = servico.NfeInutilizacao(NormalizarCnpjParaSefaz(cfg.Cnpj), anoEmissao, ModeloDocumento.NFCe, cfg.SerieNfce, numero, numero, justificativa);

        var infInut = retorno.Retorno?.infInut;
        if (infInut is not null && infInut.cStat == 102)
        {
            nota.InutilizadoEm            = DateTime.UtcNow;
            nota.ProtocoloInutilizacao    = infInut.nProt;
            await _db.SaveChangesAsync();
            _logger.LogInformation("Número {Numero} inutilizado com sucesso para a NFC-e {NotaId}.", numero, nota.Id);
        }
        else
        {
            _logger.LogWarning("SEFAZ não confirmou a inutilização do número {Numero} (nota {NotaId}): {Motivo}",
                numero, nota.Id, infInut?.xMotivo ?? retorno.RetornoStr ?? "motivo desconhecido");
        }
    }

    /// <summary>
    /// Monta um ou dois detPag conforme haja segundo método de pagamento (split).
    /// O valor do primeiro método é o total menos o que foi pago no segundo, pra bater
    /// exatamente com vNF — evita a diferença de centavos ser "engolida" num só método.
    /// </summary>
    private static List<detPag> MontarDetPag(DadosEmissao dados, decimal valorTotal)
    {
        if (string.IsNullOrWhiteSpace(dados.SegundaFormaPagamento) || dados.SegundoValorCentavos <= 0)
            return new List<detPag> { MontarDetPagUnico(dados.FormaPagamento, valorTotal) };

        var valorSegundo  = dados.SegundoValorCentavos / 100m;
        var valorPrimeiro = valorTotal - valorSegundo;
        return new List<detPag>
        {
            MontarDetPagUnico(dados.FormaPagamento,        valorPrimeiro),
            MontarDetPagUnico(dados.SegundaFormaPagamento, valorSegundo),
        };
    }

    /// <summary>
    /// Monta um detPag. Para cartão de crédito/débito E Pix, a SEFAZ exige o grupo `card`
    /// (rejeição observada em homologação: "Não informados os dados do cartão de
    /// crédito/débito" — a mesma rejeição aparece pra Pix, não só cartão; a validação
    /// da SEFAZ trata todo pagamento eletrônico igual, não só tPag 03/04). O sistema
    /// não integra com maquininha/TEF nem gateway de Pix — não há CNPJ da credenciadora,
    /// bandeira nem autorização pra informar — então o grupo é enviado só com
    /// `tpIntegra = Não integrado`, que é o mínimo aceito pela SEFAZ nesse caso.
    ///
    /// Crediário, Pontos e Cashback não têm código próprio no layout da NFC-e — caem
    /// em tPag=99 ("Outros"), e a SEFAZ rejeita esse código sem uma descrição em xPag
    /// (rejeição observada em produção: "Descrição do pagamento obrigatória para meio
    /// de pagamento 99-outros").
    /// </summary>
    private static detPag MontarDetPagUnico(string formaPagamento, decimal valor)
    {
        var tPag = MapFormaPagamento(formaPagamento);
        var pag  = new detPag { tPag = tPag, vPag = valor };
        if (formaPagamento is PaymentMethod.CartaoCredito or PaymentMethod.CartaoDebito or PaymentMethod.Pix)
            pag.card = new card { tpIntegra = TipoIntegracaoPagamento.TipNaoIntegrado };
        if (tPag == FormaPagamento.fpOutro)
            pag.xPag = DescricaoFormaPagamentoOutro(formaPagamento);
        return pag;
    }

    private static string DescricaoFormaPagamentoOutro(string formaPagamento) => formaPagamento switch
    {
        PaymentMethod.Crediario => "Crediário próprio da loja",
        PaymentMethod.Pontos    => "Resgate de pontos de fidelidade",
        PaymentMethod.Cashback  => "Cashback (saldo da loja)",
        _                       => formaPagamento,
    };

    /// <param name="descontoCentavos">Parte do desconto da venda que cabe A ESTE item.
    /// A SEFAZ exige que <c>ICMSTot.vDesc</c> seja exatamente a soma dos <c>prod.vDesc</c>
    /// dos itens — ver <see cref="RatearDesconto"/>.</param>
    internal static det MontarItem(ItemFiscal item, int numero, bool incluirIbsCbs = false,
                                   int descontoCentavos = 0) => new()
    {
        nItem = numero,
        prod = new prod
        {
            cProd      = numero.ToString("D6"),
            cEAN       = "SEM GTIN",
            cEANTrib   = "SEM GTIN",
            xProd      = item.Nome,
            NCM        = item.Ncm,
            CEST       = SanitizarCest(item.Cest, CsosnExigeCest(item.Csosn)),
            CFOP       = ParseCfop(item.Cfop),
            uCom       = "UN",
            qCom       = item.Quantidade,
            vUnCom     = item.PrecoUnitarioCentavos / 100m,
            vProd      = item.SubtotalCentavos / 100m,
            // Só sai no XML quando há desconto — mandar vDesc=0.00 em nota sem desconto
            // é ruído desnecessário, e o campo é opcional no leiaute.
            vDesc      = descontoCentavos > 0 ? descontoCentavos / 100m : null,
            uTrib      = "UN",
            qTrib      = item.Quantidade,
            vUnTrib    = item.PrecoUnitarioCentavos / 100m,
            indTot     = IndicadorTotal.ValorDoItemCompoeTotalNF,
        },
        imposto = new imposto
        {
            ICMS   = new ICMS   { TipoICMS   = MontarIcmsSimplesNacional(item, descontoCentavos) },
            // CST 99 "Outras Operações" é o padrão de fato usado por optantes do Simples
            // Nacional (o DAS já unifica PIS/COFINS — não há CST federal específico pra
            // esse regime na NFC-e). Confirmado contra prática de mercado, não é chute.
            PIS    = new PIS    { TipoPIS    = new PISOutr    { CST = CSTPIS.pis99,    vBC = 0, pPIS    = 0, vPIS    = 0 } },
            COFINS = new COFINS { TipoCOFINS = new COFINSOutr { CST = CSTCOFINS.cofins99, vBC = 0, pCOFINS = 0, vCOFINS = 0 } },
            // Base LÍQUIDA de desconto: regra UB16-10 da NT 2025.002 — a base do IBS/CBS
            // subtrai o desconto incondicional informado no item. Com a base bruta, ela
            // ficaria inconsistente com (vProd - vDesc) e a nota seria rejeitada.
            IBSCBS = incluirIbsCbs
                ? MontarIbsCbs2026(item, Math.Max(0, (item.SubtotalCentavos - descontoCentavos) / 100m))
                : null,
        },
    };

    /// <summary>
    /// Grupo de tributação integral usado na fase de testes de 2026 da RTC.
    /// CST 000 / cClassTrib 000001 representam situações tributadas integralmente;
    /// as alíquotas oficiais de 2026 são IBS-UF 0,1%, IBS-Mun 0% e CBS 0,9%.
    /// Os valores não compõem o total da operação em 2026.
    /// </summary>
    /// <param name="baseCalculoInformada">Base já líquida de desconto. Quando null, usa o
    /// subtotal bruto do item (nota sem desconto, onde os dois são iguais).</param>
    internal static IbsCbsItem MontarIbsCbs2026(ItemFiscal item, decimal? baseCalculoInformada = null)
    {
        var baseCalculo = baseCalculoInformada ?? item.SubtotalCentavos / 100m;
        var valorIbsUf  = ArredondarTributo(baseCalculo * 0.001m);
        var valorCbs    = ArredondarTributo(baseCalculo * 0.009m);

        return new IbsCbsItem
        {
            CST        = IbsCbsCst.Cst000,
            cClassTrib = "000001",
            gIBSCBS = new IbsCbsItemValues
            {
                vBC = baseCalculo,
                gIBSUF = new IbsItemUf { pIBSUF = 0.1m, vIBSUF = valorIbsUf },
                gIBSMun = new IbsItemMun { pIBSMun = 0m, vIBSMun = 0m },
                vIBS = valorIbsUf,
                gCBS = new CbsItem { pCBS = 0.9m, vCBS = valorCbs },
            },
        };
    }

    /// <summary>Consolida no grupo total exatamente os valores IBS/CBS dos itens.</summary>
    internal static IbsCbsTotal MontarTotaisIbsCbs2026(IEnumerable<det> itens)
    {
        var grupos = itens.Select(i => i.imposto.IBSCBS!.gIBSCBS!).ToList();
        var baseTotal   = grupos.Sum(g => g.vBC);
        var ibsUfTotal  = grupos.Sum(g => g.gIBSUF!.vIBSUF);
        var ibsMunTotal = grupos.Sum(g => g.gIBSMun!.vIBSMun);
        var cbsTotal    = grupos.Sum(g => g.gCBS!.vCBS);

        return new IbsCbsTotal
        {
            vBCIBSCBS = baseTotal,
            gIBS = new IbsTotal
            {
                gIBSUF = new IbsTotalUf { vDif = 0, vDevTrib = 0, vIBSUF = ibsUfTotal },
                gIBSMun = new IbsTotalMun { vDif = 0, vDevTrib = 0, vIBSMun = ibsMunTotal },
                vIBS = ibsUfTotal + ibsMunTotal,
                vCredPres = 0,
                vCredPresCondSus = 0,
            },
            gCBS = new CbsTotal
            {
                vDif = 0,
                vDevTrib = 0,
                vCBS = cbsTotal,
                vCredPres = 0,
                vCredPresCondSus = 0,
            },
        };
    }

    private static decimal ArredondarTributo(decimal valor) =>
        Math.Round(valor, 2, MidpointRounding.AwayFromZero);

    /// <summary>
    /// Mapeia o CSOSN da Natureza de Operação pra classe ICMS correta do Simples Nacional.
    /// Cobre os 7 códigos que fazem sentido pra um lojista que NÃO é substituto tributário:
    /// 101 (com crédito), 102/103/300/400 (sem crédito — mesma estrutura de campos, só muda
    /// o código), 500 (ICMS-ST já retido antes) e 900 (outros). 201/202/203 são bloqueados de
    /// propósito: exigem MVA/base de cálculo de ICMS-ST que este sistema não calcula sozinho —
    /// inventar esses valores seria pior do que não emitir. Ajustar aqui só com o contador.
    /// </summary>
    /// <param name="descontoCentavos">Parte do desconto que cabe a este item — o crédito do
    /// CSOSN 101 incide sobre o valor LÍQUIDO, não sobre o subtotal bruto.</param>
    internal static ICMSBasico MontarIcmsSimplesNacional(ItemFiscal item, int descontoCentavos = 0) => item.Csosn switch
    {
        "101" => new ICMSSN101
        {
            orig        = OrigemMercadoria.OmNacional,
            CSOSN       = Csosnicms.Csosn101,
            pCredSN     = item.PercentualCreditoSn ?? 0,
            vCredICMSSN = Math.Round(Math.Max(0, (item.SubtotalCentavos - descontoCentavos) / 100m)
                                     * (item.PercentualCreditoSn ?? 0) / 100m, 2),
        },
        "102" or null or "" => new ICMSSN102 { orig = OrigemMercadoria.OmNacional, CSOSN = Csosnicms.Csosn102 },
        "103"  => new ICMSSN102 { orig = OrigemMercadoria.OmNacional, CSOSN = Csosnicms.Csosn103 },
        "300"  => new ICMSSN102 { orig = OrigemMercadoria.OmNacional, CSOSN = Csosnicms.Csosn300 },
        "400"  => new ICMSSN102 { orig = OrigemMercadoria.OmNacional, CSOSN = Csosnicms.Csosn400 },
        "500"  => new ICMSSN500 { orig = OrigemMercadoria.OmNacional, CSOSN = Csosnicms.Csosn500 },
        "900"  => new ICMSSN900 { orig = OrigemMercadoria.OmNacional, CSOSN = Csosnicms.Csosn900 },
        "201" or "202" or "203" => throw new FiscalNaoConfiguradoException(
            $"CSOSN {item.Csosn} exige cálculo de ICMS-ST (substituição tributária) como substituto — " +
            "MVA, base reduzida etc. Este sistema não inventa esses valores. Consulte o contador antes " +
            "de usar essa Natureza de Operação, ou troque para um CSOSN sem ICMS-ST (102, por exemplo)."),
        _ => throw new FiscalNaoConfiguradoException(
            $"CSOSN \"{item.Csosn}\" não é um código suportado do Simples Nacional. " +
            "Use 101, 102, 103, 300, 400, 500 ou 900 em Admin > Fiscal > Naturezas de Operação."),
    };

    private static CRT MapCrt(RegimeTributario regime) => regime switch
    {
        RegimeTributario.SimplesNacional => CRT.SimplesNacional,
        RegimeTributario.LucroPresumido  => CRT.RegimeNormal,
        RegimeTributario.LucroReal       => CRT.RegimeNormal,
        _                                => CRT.SimplesNacional,
    };

    /// <summary>
    /// Remove tudo que não for dígito (o formulário de cadastro do produto mostra o NCM
    /// no formato "0000.00.00" — a XSD da NFC-e exige exatamente 8 dígitos, sem ponto.
    /// Enviar com ponto faz a SEFAZ rejeitar a nota; sanitiza aqui pra não depender só
    /// da validação do formulário nem quebrar produto cadastrado antes dela existir).
    /// </summary>
    internal static string SanitizeNcm(string? ncm) => SomenteDigitos(ncm);

    /// <summary>Remove tudo que não for dígito — usado em qualquer campo que a SEFAZ exige
    /// só numérico mas o cadastro/formulário aceita digitar com pontuação (NCM, CEP).</summary>
    internal static string SomenteDigitos(string? valor) =>
        valor is null ? "" : new string(valor.Where(char.IsDigit).ToArray());

    /// <summary>
    /// CFOP vem da Natureza de Operação (texto livre, sem sanitização no cadastro — só o
    /// placeholder "5102" guia o formato certo, ao contrário do NCM que tinha o placeholder
    /// com ponto). Mesmo assim, tira espaço/pontuação por segurança e valida 4 dígitos antes
    /// de mandar pra SEFAZ: um CFOP mal digitado virando FormatException aqui derrubaria a
    /// emissão com uma mensagem de erro sem explicação nenhuma pro admin.
    /// </summary>
    internal static int ParseCfop(string? cfop)
    {
        var digits = SomenteDigitos(cfop);
        if (digits.Length != 4 || !int.TryParse(digits, out var valor))
            throw new FiscalNaoConfiguradoException(
                $"CFOP \"{cfop}\" inválido (precisa ter 4 dígitos, ex: 5102). " +
                "Corrija em Admin > Fiscal > Naturezas de Operação.");
        return valor;
    }

    /// <summary>
    /// Distribui o desconto da venda entre os itens, em centavos, proporcionalmente ao
    /// valor de cada um. A soma do resultado é SEMPRE exatamente igual a
    /// <paramref name="descontoTotalCentavos"/>.
    ///
    /// Existe porque a SEFAZ valida que <c>ICMSTot.vDesc</c> seja idêntico ao somatório
    /// dos <c>prod.vDesc</c> — rejeição observada em homologação em 30/07/2026: "Total do
    /// Desconto difere do somatório dos itens". O desconto ia só no total, e nenhum item
    /// carregava a própria parte, então o somatório dava zero. Venda sem desconto passava
    /// (0 = 0), que foi o que mascarou o defeito.
    ///
    /// A sobra da divisão inteira é distribuída de 1 em 1 centavo entre os itens que ainda
    /// têm folga (desconto do item &lt; valor do item), nunca deixando um item com desconto
    /// maior que o próprio valor — o que a SEFAZ também rejeita.
    /// </summary>
    internal static int[] RatearDesconto(IReadOnlyList<ItemFiscal> itens, int descontoTotalCentavos)
    {
        var rateio = new int[itens.Count];
        if (descontoTotalCentavos <= 0 || itens.Count == 0) return rateio;

        var bruto = itens.Sum(i => (long)i.SubtotalCentavos);
        if (bruto <= 0) return rateio;

        long distribuido = 0;
        for (var i = 0; i < itens.Count; i++)
        {
            var parte = (int)(descontoTotalCentavos * (long)itens[i].SubtotalCentavos / bruto);
            rateio[i]    = parte;
            distribuido += parte;
        }

        // Sobra dos arredondamentos para baixo: no máximo (itens.Count - 1) centavos.
        var sobra = descontoTotalCentavos - (int)distribuido;
        for (var volta = 0; sobra > 0 && volta < itens.Count; volta++)
        {
            for (var i = 0; i < itens.Count && sobra > 0; i++)
            {
                if (rateio[i] >= itens[i].SubtotalCentavos) continue; // item já sem folga
                rateio[i]++;
                sobra--;
            }
        }

        return rateio;
    }

    /// <summary>
    /// Adaptador de fronteira para o identificador do estabelecimento. Toda dependência
    /// do formato exigido pela SEFAZ fica concentrada aqui.
    ///
    /// Aceita os dois modelos de CNPJ: o numérico de sempre e o alfanumérico que a
    /// Receita passou a emitir (IN RFB 2.229/2024), com o ambiente nacional de NF-e/NFC-e
    /// recebendo documentos nesse formato desde 01/07/2026 (NT 2026.004). Confere também
    /// o dígito verificador — antes qualquer sequência de 14 dígitos seguia pra SEFAZ e
    /// só voltava como rejeição, sem dizer ao lojista o que corrigir.
    /// </summary>
    internal static string NormalizarCnpjParaSefaz(string? identificadorAtual)
    {
        var cnpj = Cnpj.Normalizar(identificadorAtual);
        if (!Cnpj.EhValido(cnpj))
            throw new FiscalNaoConfiguradoException(
                "O CNPJ da loja não é válido para a SEFAZ. Informe as 14 posições do CNPJ " +
                "(numérico ou alfanumérico) em Admin > Fiscal.");
        return cnpj;
    }

    /// <summary>
    /// Sanitiza o CEST do cadastro: tira pontuação ("28.064.00" → "2806400") e valida
    /// os 7 dígitos. Campo opcional na maioria das operações, mas obrigatório quando o
    /// CSOSN indica substituição tributária — nesse caso a SEFAZ rejeita a nota sem ele.
    /// </summary>
    internal static string? SanitizarCest(string? cest, bool obrigatorio)
    {
        var digitos = new string((cest ?? string.Empty).Where(char.IsDigit).ToArray());
        if (digitos.Length == 0 && !obrigatorio) return null;
        if (digitos.Length != 7)
            throw new FiscalNaoConfiguradoException(
                obrigatorio
                    ? "CEST obrigatório para produto sujeito a ICMS-ST. Informe exatamente 7 dígitos " +
                      "no cadastro do produto (Admin > Estoque)."
                    : $"CEST \"{cest}\" inválido. Informe exatamente 7 dígitos ou deixe o campo vazio.");
        return digitos;
    }

    /// <summary>CSOSNs de substituição tributária — nesses a SEFAZ exige CEST no item.</summary>
    private static bool CsosnExigeCest(string? csosn) =>
        csosn is "201" or "202" or "203" or "500";

    /// <summary>
    /// Pontos/Cashback/Crediário não são formas de pagamento reconhecidas pela SEFAZ —
    /// são mecanismos internos da loja, então caem em "Outros" (99).
    /// </summary>
    private static FormaPagamento MapFormaPagamento(string formaPagamento) => formaPagamento switch
    {
        "Dinheiro"      => FormaPagamento.fpDinheiro,
        "Pix"           => FormaPagamento.fpPagamentoInstantaneoPIXDinamico,
        "CartaoCredito" => FormaPagamento.fpCartaoCredito,
        "CartaoDebito"  => FormaPagamento.fpCartaoDebito,
        _               => FormaPagamento.fpOutro,
    };
}

/// <summary>Sinaliza que a emissão não pôde ocorrer porque o admin ainda não terminou
/// de configurar o módulo fiscal — não é uma falha de transmissão de verdade.</summary>
public class FiscalNaoConfiguradoException : Exception
{
    public FiscalNaoConfiguradoException(string message) : base(message) { }
}

/// <summary>
/// A venda de origem não tem o que faturar (sem itens, ou valor total zerado). Diferente
/// de <see cref="FiscalNaoConfiguradoException"/>: não adianta tentar de novo, porque nada
/// vai mudar sozinho — a nota vira Rejeitada em vez de ficar na fila do retry pra sempre.
/// </summary>
public class NadaAFaturarException : Exception
{
    public NadaAFaturarException(string message) : base(message) { }
}

/// <summary>Interrompe qualquer operação do motor quando a trava geral está desligada.</summary>
public sealed class FiscalModuloBloqueadoException : InvalidOperationException
{
    public const string Mensagem = "Módulo bloqueado por hora";

    public FiscalModuloBloqueadoException() : base(Mensagem) { }
}

/// <summary>Sinaliza que a comanda de origem foi cancelada antes da NFC-e ser
/// transmitida à SEFAZ — a nota deve ser anulada localmente, nunca emitida.</summary>
public class ComandaCanceladaException : Exception
{
    public Guid ComandaId { get; }
    public ComandaCanceladaException(Guid comandaId)
        : base($"Comanda {comandaId} foi cancelada — emissão fiscal abortada.") => ComandaId = comandaId;
}
