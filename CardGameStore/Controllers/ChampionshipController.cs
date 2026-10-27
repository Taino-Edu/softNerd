// =============================================================================
// ChampionshipController.cs — Campeonatos: cadastro, inscrição e Pix da entrada.
// Só HTTP: lê quem está logado, chama o serviço e devolve a resposta. Cadastro em
// IChampionshipService; inscrição e Pix em Services/Campeonatos/CampeonatoInscricaoService.
// =============================================================================

using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Campeonatos;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class ChampionshipController(
    IChampionshipService campeonatos, ICampeonatoInscricaoService inscricoes,
    ILogger<ChampionshipController> logger) : ControllerBase
{
    private const string NaoEncontrado = "Campeonato não encontrado.";

    // ── Leitura ──────────────────────────────────────────────────────────────

    /// <summary>Campeonatos planejados e com inscrições abertas (público).</summary>
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IEnumerable<ChampionshipDto>), 200)]
    public async Task<IActionResult> GetAll() =>
        Ok((await campeonatos.GetUpcomingAsync()).Select(c => c.ParaDto()));

    /// <summary>Todos os campeonatos, inclusive finalizados (Admin).</summary>
    [HttpGet("admin/all")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(IEnumerable<ChampionshipDto>), 200)]
    public async Task<IActionResult> GetAllAdmin([FromQuery] string? search = null) =>
        Ok((await campeonatos.GetAllAsync(search)).Select(c => c.ParaDto()));

    /// <summary>Um campeonato.</summary>
    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(ChampionshipDto), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> GetById(Guid id) =>
        await campeonatos.GetByIdAsync(id) is { } ch ? Ok(ch.ParaDto()) : NotFound(new { Message = NaoEncontrado });

    /// <summary>Campeonatos em que o cliente logado está inscrito.</summary>
    [HttpGet("my-participations")]
    [Authorize]
    [ProducesResponseType(typeof(IEnumerable<MyParticipationDto>), 200)]
    public async Task<IActionResult> GetMyParticipations() =>
        Ok((await campeonatos.GetUserParticipationsAsync(UsuarioId())).Select(p => p.ParaMinhaParticipacao()));

    /// <summary>Participantes de um campeonato, com o valor da cobrança de cada um.</summary>
    [HttpGet("{id:guid}/participants")]
    [Authorize]
    [ProducesResponseType(typeof(IEnumerable<ParticipantDto>), 200)]
    public async Task<IActionResult> GetParticipants(Guid id) => Ok(await inscricoes.ParticipantesAsync(id));

    // ── Cadastro (Admin) ─────────────────────────────────────────────────────

    [HttpPost]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(ChampionshipDto), 201)]
    [ProducesResponseType(400)]
    public async Task<IActionResult> Create([FromBody] CreateChampionshipRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var adminId = UsuarioId();
        var criado = await campeonatos.CreateAsync(request.ParaCampeonato(adminId));
        logger.LogInformation("Campeonato {Id} criado pelo admin {AdminId}", criado.Id, adminId);
        return CreatedAtAction(nameof(GetById), new { id = criado.Id }, criado.ParaDto());
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(ChampionshipDto), 200)]
    [ProducesResponseType(400)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateChampionshipRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var ch = await campeonatos.GetByIdAsync(id);
        if (ch is null) return NotFound(new { Message = NaoEncontrado });

        request.AplicarEm(ch);
        var atualizado = await campeonatos.UpdateAsync(ch);
        logger.LogInformation("Campeonato {Id} editado pelo admin", id);
        return Ok(atualizado.ParaDto());
    }

    /// <summary>Exclui um campeonato (só Finalizados ou Cancelados).</summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(200)]
    [ProducesResponseType(400)]
    public async Task<IActionResult> Delete(Guid id)
    {
        try
        {
            await campeonatos.DeleteAsync(id);
            logger.LogInformation("Campeonato {Id} excluído pelo admin", id);
            return Ok(new { Message = "Campeonato excluído." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    [HttpPut("{id:guid}/status")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(ChampionshipDto), 200)]
    [ProducesResponseType(400)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateStatusRequest request)
    {
        if (!Enum.TryParse<ChampionshipStatus>(request.Status, ignoreCase: true, out var novo))
            return BadRequest(new { Message = $"Status inválido: '{request.Status}'. Valores válidos: Planejado, Inscricoes, EmAndamento, Finalizado, Cancelado" });

        try
        {
            var atualizado = await campeonatos.UpdateStatusAsync(id, novo);
            logger.LogInformation("Status do campeonato {Id} alterado para {Status}", id, novo);
            return Ok(atualizado.ParaDto());
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { Message = ex.Message });
        }
    }

    /// <summary>Colocação final de um participante.</summary>
    [HttpPut("{id:guid}/participants/{participantId:guid}/placement")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(200)]
    [ProducesResponseType(400)]
    public async Task<IActionResult> SetPlacement(Guid id, Guid participantId, [FromBody] SetPlacementRequest request)
    {
        if (request.Placement <= 0) return BadRequest(new { Message = "A colocação deve ser maior que zero." });

        await campeonatos.SetPlacementAsync(participantId, request.Placement);
        return Ok(new { Message = $"Colocação {request.Placement}º definida com sucesso." });
    }

    /// <summary>Imagem de capa.</summary>
    [HttpPut("{id:guid}/image")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(ChampionshipDto), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> SetImage(Guid id, [FromBody] SetImageRequest request)
    {
        var ch = await campeonatos.GetByIdAsync(id);
        if (ch is null) return NotFound(new { Message = NaoEncontrado });

        ch.ImageUrl = request.ImageUrl;
        await campeonatos.UpdateAsync(ch);
        return Ok(ch.ParaDto());
    }

    /// <summary>Pódio do campeonato (JSON).</summary>
    [HttpPatch("{id:guid}/podio")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> SetPodio(Guid id, [FromBody] SetPodioRequest request)
    {
        try
        {
            await campeonatos.SetPodioAsync(id, request.PodioJson);
            return Ok(new { Message = "Pódio salvo com sucesso." });
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { Message = ex.Message });
        }
    }

    // ── Inscrição e Pix da entrada ───────────────────────────────────────────

    /// <summary>Cliente se inscreve; em campeonato pago o Pix já vem junto (201 nova, 200 retomada).</summary>
    [HttpPost("{id:guid}/register")]
    [Authorize]
    [ProducesResponseType(typeof(InscricaoDto), 201)]
    [ProducesResponseType(400)]
    [ProducesResponseType(404)]
    public Task<IActionResult> Register(Guid id, [FromBody] RegisterChampionshipRequest? request) =>
        this.ResponderCom(async () =>
        {
            var (criada, inscricao) = await inscricoes.InscreverAsync(id, UsuarioId(), request);
            return StatusCode(criada ? StatusCodes.Status201Created : StatusCodes.Status200OK, inscricao);
        });

    /// <summary>Pix da inscrição do próprio cliente. Enquanto não pagar, a vaga fica segurada até InscricaoExpiraEm.</summary>
    [HttpPost("{id:guid}/my-inscription/pix")]
    [Authorize]
    public Task<IActionResult> GerarPixInscricao(Guid id) => this.Responder(() => inscricoes.GerarPixAsync(id, UsuarioId()));

    /// <summary>Confere no Inter se a entrada caiu; se sim, a inscrição fica paga.</summary>
    [HttpPost("{id:guid}/my-inscription/pix/verificar")]
    [Authorize]
    public Task<IActionResult> VerificarPixInscricao(Guid id) => this.Responder(() => inscricoes.VerificarPixAsync(id, UsuarioId()));

    /// <summary>Admin cobra a inscrição de um participante (gera o Pix e avisa o jogador).</summary>
    [HttpPost("participants/{participantId:guid}/cobrar")]
    [Authorize(Policy = "OwnerOnly")]
    public Task<IActionResult> CobrarInscricao(Guid participantId) =>
        this.Responder(() => inscricoes.CobrarAsync(participantId, UsuarioId()));

    /// <summary>Rota legada. Campeonato pago só aceita confirmação automática via Pix.</summary>
    [HttpPut("participants/{participantId:guid}/pagamento")]
    [Authorize(Policy = "AdminOnly")]
    public Task<IActionResult> MarcarPagamentoInscricao(Guid participantId, [FromBody] MarcarPagamentoRequest req) =>
        this.Responder(() => inscricoes.MarcarPagamentoAsync(participantId, req.Pago));

    /// <summary>Maikon inscreve um cliente. Em campeonato pago, o Pix sai na hora e ele é avisado.</summary>
    [HttpPost("{id:guid}/admin-register")]
    [Authorize(Policy = "OwnerOnly")]
    [ProducesResponseType(typeof(ParticipantDto), 201)]
    [ProducesResponseType(400)]
    [ProducesResponseType(404)]
    public Task<IActionResult> AdminRegister(Guid id, [FromBody] AdminRegisterRequest request) =>
        this.ResponderCom(async () => StatusCode(201, await inscricoes.InscreverPeloAdminAsync(id, request, UsuarioId())));

    /// <summary>Admin remove participante.</summary>
    [HttpDelete("{id:guid}/participants/{participantId:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> RemoveParticipant(Guid id, Guid participantId)
    {
        try
        {
            await campeonatos.RemoveParticipantAsync(participantId);
            logger.LogInformation("Participante {ParticipantId} removido do campeonato {Id}", participantId, id);
            return Ok(new { Message = "Participante removido." });
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { Message = ex.Message });
        }
    }

    // ── Pré-inscrição (landing page, sem login) ──────────────────────────────

    [HttpPost("{id:guid}/preinscricoes")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(PreInscricaoDto), 201)]
    [ProducesResponseType(400)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> AddPreInscricao(Guid id, [FromBody] PreInscricaoRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var ch = await campeonatos.GetByIdAsync(id);
        if (ch is null) return NotFound(new { Message = NaoEncontrado });
        if (ch.Status != ChampionshipStatus.Inscricoes && ch.Status != ChampionshipStatus.Planejado)
            return BadRequest(new { Message = "Este campeonato não está aceitando inscrições." });

        var (pi, numero) = await campeonatos.AddPreInscricaoAsync(id, request.Nome, request.WhatsApp, request.DeckId, request.DeckName);
        // Sem o nome no log: é dado pessoal e vem digitado pela pessoa (CodeQL: log forging)
        logger.LogInformation("Pré-inscrição recebida para campeonato {Id} (nº {Numero})", id, numero);
        return StatusCode(201, pi.ParaDto(numero));
    }

    [HttpGet("{id:guid}/preinscricoes")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(IEnumerable<PreInscricaoDto>), 200)]
    public async Task<IActionResult> GetPreInscricoes(Guid id) =>
        Ok(CampeonatoMapeamento.Numeradas(await campeonatos.GetPreInscricoesAsync(id)));

    /// <summary>Remove uma pré-inscrição (recusar, ou depois de confirmar à mão).</summary>
    [HttpDelete("{id:guid}/preinscricoes/{preInscricaoId:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(204)]
    public async Task<IActionResult> DeletePreInscricao(Guid id, Guid preInscricaoId)
    {
        await campeonatos.DeletePreInscricaoAsync(preInscricaoId);
        return NoContent();
    }

    private Guid UsuarioId()
    {
        var claim = User.FindFirst("sub") ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (claim is null || !Guid.TryParse(claim.Value, out var id))
            throw new UnauthorizedAccessException("Token inválido: identificador de usuário ausente.");
        return id;
    }
}
