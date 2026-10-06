// =============================================================================
// PagamentoCrediarioController.cs — Link público de pagamento do crediário
//
// GET  /api/pagar/crediario/{token}                → resumo da conta (sem login)
// POST /api/pagar/crediario/{token}/pix            → cobrança Pix (saldo, valor escolhido ou todas as contas)
// GET  /api/pagar/crediario/{token}/pix/{txid}     → confere se pagou (e dá baixa)
//
// É o link que vai no aviso de vencimento. Quem tem o link vê só o primeiro nome,
// o saldo, o vencimento e as datas/valores das compras — nada de e-mail, telefone,
// CPF ou itens. O token tem 128 bits aleatórios; token errado devolve sempre a
// mesma resposta, sem dizer se a conta existe.
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/pagar/crediario/{token}")]
[AllowAnonymous]
[EnableRateLimiting("api")]
public class PagamentoCrediarioController : ControllerBase
{
    private const string LinkInvalido = "Link de pagamento inválido.";

    private readonly AppDbContext        _db;
    private readonly CrediarioPixService _pix;

    public PagamentoCrediarioController(AppDbContext db, CrediarioPixService pix)
    {
        _db  = db;
        _pix = pix;
    }

    [HttpGet]
    public async Task<IActionResult> Resumo(string token, CancellationToken ct)
    {
        var conta = await BuscarAsync(token, ct);
        if (conta is null) return NotFound(new { Message = LinkInvalido });

        var nomeLoja = await _db.SiteConfigs
            .Where(s => s.Id == SiteConfig.SingletonId)
            .Select(s => s.SiteName)
            .FirstOrDefaultAsync(ct) ?? "Santuário Nerd";

        var outras = await OutrasContasAsync(conta, ct);
        var hoje  = CrediarioLancamentos.HojeBrasil();
        var dias  = CrediarioAvisoService.DiasDoVencimento(conta, hoje);
        var pago  = conta.Status == CrediariosStatus.Pago;

        return Ok(new
        {
            Loja                 = nomeLoja,
            PrimeiroNome         = conta.User.Name.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "",
            ValorEmReais         = conta.ValorEmReais,
            ValorPagoEmReais     = conta.ValorPagoEmReais,
            SaldoRestanteEmReais = conta.SaldoRestanteEmReais,
            DataVencimento       = conta.DataVencimento,
            Quitado              = pago,
            Vencido              = !pago && dias > 0,
            DiasDeAtraso         = !pago && dias > 0 ? dias : 0,
            PixDisponivel        = !pago && await CrediarioPixService.PixConfiguradoAsync(_db, ct),
            ValorMinimoEmReais   = CrediarioPixService.ValorMinimoEmCentavos / 100m,
            // Outras contas abertas do mesmo cliente: habilita "pagar todas num Pix só"
            OutrasContas         = outras.Count,
            SaldoTodasEmReais    = (outras.Sum(c => c.SaldoRestanteEmCentavos) + (pago ? 0 : conta.SaldoRestanteEmCentavos)) / 100m,
            Compras = conta.Lancamentos
                .Where(l => l.EstornadoEm == null && l.ValorEmCentavos > 0)
                .OrderBy(l => l.CreatedAt)
                .Select(l => new { Data = l.CreatedAt, ValorEmReais = l.ValorEmCentavos / 100m }),
        });
    }

    public sealed class GerarPixRequest
    {
        /// <summary>Valor escolhido (parcial), em centavos. Null = saldo inteiro da conta.</summary>
        public int?  ValorEmCentavos { get; set; }
        /// <summary>Pagar todas as contas abertas do cliente num Pix só.</summary>
        public bool  Tudo            { get; set; }
    }

    [HttpPost("pix")]
    public async Task<IActionResult> GerarPix(string token, [FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)] GerarPixRequest? request, CancellationToken ct)
    {
        var conta = await BuscarAsync(token, ct);
        if (conta is null) return NotFound(new { Message = LinkInvalido });

        if (!await CrediarioPixService.PixConfiguradoAsync(_db, ct))
            return BadRequest(new { Message = "Pagamento por Pix indisponível no momento — pague no balcão." });

        if (conta.Status == CrediariosStatus.Pago && request?.Tudo != true)
            return BadRequest(new { Message = "Esta conta já está quitada." });

        var resultado = await _pix.ObterOuGerarAsync(
            conta.Id, criadoPor: null,
            valorEmCentavos: request?.Tudo == true ? null : request?.ValorEmCentavos,
            todasDoCliente: request?.Tudo == true,
            ct: ct);
        if (resultado.Pix is null)
            return StatusCode(resultado.StatusCode == 422 ? 503 : resultado.StatusCode,
                new { Message = resultado.StatusCode == 422
                    ? "Não deu pra gerar o Pix agora. Tente de novo em instantes ou pague no balcão."
                    : resultado.Erro });

        var pix = resultado.Pix;
        return Ok(new
        {
            pix.TxId,
            pix.Status,
            pix.PixCopiaCola,
            pix.ImagemQrCode,
            pix.ExpiraEm,
            ValorEmReais = pix.ValorEmReais,
        });
    }

    [HttpGet("pix/{txid}")]
    public async Task<IActionResult> StatusPix(string token, string txid, CancellationToken ct)
    {
        var conta = await BuscarAsync(token, ct);
        if (conta is null) return NotFound(new { Message = LinkInvalido });

        var (pix, erro) = await _pix.VerificarAsync(conta.Id, txid, adminId: null, ct);
        if (pix is null) return NotFound(new { Message = erro });

        // Relê a conta: a baixa pode ter acabado de quitar
        await _db.Entry(conta).ReloadAsync(ct);
        var outras = await OutrasContasAsync(conta, ct);
        return Ok(new
        {
            pix.Status,
            pix.PagoEm,
            Quitado              = conta.Status == CrediariosStatus.Pago,
            SaldoRestanteEmReais = conta.SaldoRestanteEmReais,
            SaldoTodasEmReais    = (outras.Sum(c => c.SaldoRestanteEmCentavos) + conta.SaldoRestanteEmCentavos) / 100m,
            // Falha de consulta ao Inter não é "não pagou": a tela segue esperando
            Aviso                = erro,
        });
    }

    private Task<List<Crediario>> OutrasContasAsync(Crediario conta, CancellationToken ct) =>
        _db.Crediarios
            .Where(c => c.UserId == conta.UserId
                     && c.Id != conta.Id
                     && c.Status == CrediariosStatus.Aberto
                     && c.ValorEmCentavos > c.ValorPagoEmCentavos)
            .ToListAsync(ct);

    private async Task<Crediario?> BuscarAsync(string token, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length != 32) return null;
        return await _db.Crediarios
            .Include(c => c.User)
            .Include(c => c.Lancamentos)
            .FirstOrDefaultAsync(c => c.PagamentoToken == token, ct);
    }
}
