// =============================================================================
// ChampionshipController.cs — Endpoints REST de Campeonatos/Torneios
// GET  /api/championship              → lista campeonatos (Planejado/Inscrições)
// GET  /api/championship/{id}         → detalhes de um campeonato
// GET  /api/championship/{id}/participants → lista participantes
// POST /api/championship              → cria campeonato (Admin)
// POST /api/championship/{id}/register → inscreve usuário logado
// PUT  /api/championship/{id}         → edita campeonato (Admin)
// PUT  /api/championship/{id}/status  → muda status (Admin)
// PUT  /api/championship/{id}/participants/{pid}/placement → define colocação (Admin)
// =============================================================================

using CardGameStore.Data;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class ChampionshipController : ControllerBase
{
    private readonly IChampionshipService _service;
    private readonly AppDbContext         _db;
    private readonly InterSyncService     _inter;
    private readonly IPixReconciliationService _pixReconciliation;
    private readonly IPushService         _push;
    private readonly ILogger<ChampionshipController> _logger;

    public ChampionshipController(
        IChampionshipService service, AppDbContext db, InterSyncService inter,
        IPixReconciliationService pixReconciliation, IPushService push,
        ILogger<ChampionshipController> logger)
    {
        _service           = service;
        _db                = db;
        _inter             = inter;
        _pixReconciliation = pixReconciliation;
        _push              = push;
        _logger            = logger;
    }

    // -------------------------------------------------------------------------
    // LEITURA — acessível por qualquer pessoa autenticada (ou anônima para listagem)
    // -------------------------------------------------------------------------

    /// <summary>Lista campeonatos planejados e com inscrições abertas (público).</summary>
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IEnumerable<ChampionshipDto>), 200)]
    public async Task<IActionResult> GetAll()
    {
        var list = await _service.GetUpcomingAsync();
        return Ok(list.Select(ToDto));
    }

    /// <summary>Lista TODOS os campeonatos incluindo finalizados (Admin).</summary>
    [HttpGet("admin/all")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(IEnumerable<ChampionshipDto>), 200)]
    public async Task<IActionResult> GetAllAdmin([FromQuery] string? search = null)
    {
        var list = await _service.GetAllAsync(search);
        return Ok(list.Select(ToDto));
    }

    /// <summary>Exclui um campeonato (Admin). Só permite excluir Finalizados ou Cancelados.</summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(200)]
    [ProducesResponseType(400)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> Delete(Guid id)
    {
        try
        {
            await _service.DeleteAsync(id);
            _logger.LogInformation("Campeonato {Id} excluído pelo admin", id);
            return Ok(new { Message = "Campeonato excluído." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    /// <summary>Busca um campeonato pelo ID com lista de participantes.</summary>
    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(ChampionshipDto), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var ch = await _service.GetByIdAsync(id);
        return ch == null ? NotFound(new { Message = "Campeonato não encontrado." }) : Ok(ToDto(ch));
    }

    /// <summary>Lista todos os campeonatos em que o usuário autenticado está inscrito.</summary>
    [HttpGet("my-participations")]
    [Authorize]
    [ProducesResponseType(typeof(IEnumerable<MyParticipationDto>), 200)]
    public async Task<IActionResult> GetMyParticipations()
    {
        var userId       = GetUserId();
        var participations = await _service.GetUserParticipationsAsync(userId);
        return Ok(participations.Select(p => new MyParticipationDto
        {
            ParticipationId  = p.Id,
            ChampionshipId   = p.ChampionshipId,
            ChampionshipName = p.Championship?.Name ?? string.Empty,
            Game             = p.Championship?.Game ?? string.Empty,
            StartDate        = p.Championship?.StartDate ?? default,
            Status           = p.Championship?.Status.ToString() ?? string.Empty,
            EntryFeeInReais  = (p.Championship?.EntryFeeInCents ?? 0) / 100m,
            PlayerNumber     = p.PlayerNumber,
            DeckName         = p.DeckName,
            Placement        = p.Placement,
            RegisteredAt     = p.RegisteredAt,
            EntryFeePaidAt        = p.EntryFeePaidAt,
            EntryFeePaymentMethod = p.EntryFeePaymentMethod,
            InscricaoExpiraEm     = p.InscricaoExpiraEm,
        }));
    }

    /// <summary>Lista os participantes inscritos em um campeonato.</summary>
    [HttpGet("{id:guid}/participants")]
    [Authorize]
    [ProducesResponseType(typeof(IEnumerable<ParticipantDto>), 200)]
    public async Task<IActionResult> GetParticipants(Guid id)
    {
        var participants = await _service.GetParticipantsAsync(id);
        return Ok(participants.Select(p => new ParticipantDto
        {
            Id             = p.Id,
            UserId         = p.UserId,
            UserName       = p.User?.Name ?? string.Empty,
            PlayerNumber   = p.PlayerNumber,
            DeckName       = p.DeckName,
            DeckId         = p.DeckId,
            Placement      = p.Placement,
            RegisteredAt   = p.RegisteredAt,
            EntryFeePaidAt        = p.EntryFeePaidAt,
            EntryFeePaymentMethod = p.EntryFeePaymentMethod,
            InscricaoExpiraEm     = p.InscricaoExpiraEm,
        }));
    }

    // -------------------------------------------------------------------------
    // CRIAÇÃO — apenas Admin
    // -------------------------------------------------------------------------

    /// <summary>Cria um novo campeonato. Apenas Admin.</summary>
    [HttpPost]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(ChampionshipDto), 201)]
    [ProducesResponseType(400)]
    public async Task<IActionResult> Create([FromBody] CreateChampionshipRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var adminId = GetUserId();

        var championship = new Championship
        {
            Name                 = request.Name,
            Description          = request.Description,
            Game                 = request.Game,
            StartDate            = request.StartDate,
            EndDate              = request.EndDate,
            RegistrationDeadline = request.RegistrationDeadline,
            MaxParticipants      = request.MaxParticipants,
            EntryFeeInCents      = request.EntryFeeInCents,
            MinutosParaPagar     = Math.Clamp(request.MinutosParaPagar ?? 30, 1, 1440),
            ImageUrl             = request.ImageUrl,
            Status               = ChampionshipStatus.Planejado,
            CreatedByAdminId     = adminId
        };

        var created = await _service.CreateAsync(championship);
        _logger.LogInformation("Campeonato {Id} criado pelo admin {AdminId}", created.Id, adminId);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, ToDto(created));
    }

    // -------------------------------------------------------------------------
    // EDIÇÃO — apenas Admin
    // -------------------------------------------------------------------------

    /// <summary>Atualiza os campos editáveis de um campeonato. Apenas Admin.</summary>
    [HttpPut("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(ChampionshipDto), 200)]
    [ProducesResponseType(400)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateChampionshipRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var ch = await _service.GetByIdAsync(id);
        if (ch == null)
            return NotFound(new { Message = "Campeonato não encontrado." });

        ch.Name                 = request.Name;
        ch.Description          = request.Description;
        ch.Game                 = request.Game;
        ch.StartDate            = request.StartDate;
        ch.EndDate              = request.EndDate;
        ch.RegistrationDeadline = request.RegistrationDeadline;
        ch.MaxParticipants      = request.MaxParticipants;
        ch.EntryFeeInCents      = request.EntryFeeInCents;
        ch.ImageUrl             = request.ImageUrl;
        // Só sobrescreve se veio no corpo — assim uma tela antiga não zera o prazo.
        if (request.MinutosParaPagar is int minutos)
            ch.MinutosParaPagar = Math.Clamp(minutos, 1, 1440);

        var updated = await _service.UpdateAsync(ch);
        _logger.LogInformation("Campeonato {Id} editado pelo admin", id);
        return Ok(ToDto(updated));
    }

    // -------------------------------------------------------------------------
    // INSCRIÇÃO — qualquer usuário autenticado
    // -------------------------------------------------------------------------

    /// <summary>Inscreve o usuário autenticado em um campeonato.</summary>
    [HttpPost("{id:guid}/register")]
    [Authorize]
    [ProducesResponseType(typeof(ParticipantDto), 201)]
    [ProducesResponseType(400)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> Register(Guid id, [FromBody] RegisterChampionshipRequest? request)
    {
        var userId = GetUserId();

        // Verifica se o campeonato existe e aceita inscrições
        var ch = await _service.GetByIdAsync(id);
        if (ch == null)
            return NotFound(new { Message = "Campeonato não encontrado." });

        if (ch.Status != ChampionshipStatus.Inscricoes)
            return BadRequest(new { Message = "As inscrições para este campeonato não estão abertas." });

        if (ch.RegistrationDeadline.HasValue && ch.RegistrationDeadline.Value < DateTime.UtcNow)
            return BadRequest(new { Message = "O prazo de inscrição para este campeonato já encerrou." });

        // Só conta quem realmente segura vaga: inscrição com taxa que venceu sem pagamento
        // volta a liberar o lugar (a linha continua lá pro admin cobrar ou remover).
        if (ch.MaxParticipants.HasValue && ch.Participants.Count(p => p.VagaVale) >= ch.MaxParticipants.Value)
            return BadRequest(new { Message = "O campeonato atingiu o número máximo de participantes." });

        ChampionshipParticipant participant;
        try
        {
            participant = await _service.RegisterParticipantAsync(id, userId, request?.DeckName, request?.DeckId);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        _logger.LogInformation("Usuário {UserId} inscrito no campeonato {ChampionshipId}", userId, id);

        return StatusCode(201, new ParticipantDto
        {
            Id           = participant.Id,
            UserId       = participant.UserId,
            UserName     = string.Empty,   // sem eager load aqui
            PlayerNumber = participant.PlayerNumber,
            DeckName     = participant.DeckName,
            DeckId       = participant.DeckId,
            RegisteredAt = participant.RegisteredAt,
            // Sem isto a tela não sabe até quando a vaga fica segurada logo depois
            // da inscrição — só descobria no carregamento seguinte.
            InscricaoExpiraEm = participant.InscricaoExpiraEm
        });
    }

    // -------------------------------------------------------------------------
    // PAGAMENTO DA INSCRIÇÃO — Pix (cliente) ou balcão (admin marca manual)
    // -------------------------------------------------------------------------

    /// <summary>Gera cobrança Pix da taxa de inscrição do próprio usuário. Enquanto não pagar,
/// a vaga fica segurada só até <c>InscricaoExpiraEm</c>.</summary>
    [HttpPost("{id:guid}/my-inscription/pix")]
    [Authorize]
    public async Task<IActionResult> GerarPixInscricao(Guid id)
    {
        var userId = GetUserId();

        var participant = await _db.ChampionshipParticipants
            .Include(p => p.Championship)
            .Include(p => p.User)
            .FirstOrDefaultAsync(p => p.ChampionshipId == id && p.UserId == userId);
        if (participant is null)
            return NotFound(new { Message = "Você não está inscrito neste campeonato." });

        if (participant.EntryFeePaidAt is not null)
            return BadRequest(new { Message = "A inscrição já está paga." });

        var valorEmCentavos = participant.Championship.EntryFeeInCents;
        if (valorEmCentavos <= 0)
            return BadRequest(new { Message = "Este campeonato não tem taxa de inscrição." });

        var cfg = await _db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == "inter");
        if (cfg is null)
            return BadRequest(new { Message = "Pagamento Pix indisponível no momento — pague no balcão." });

        var (pix, erro) = await CriarOuReaproveitarCobrancaAsync(participant, valorEmCentavos, cfg, userId);
        if (erro is not null) return StatusCode(422, new { message = erro });

        return Ok(new { pix!.TxId, pix.Status, pix.PixCopiaCola, pix.ImagemQrCode, pix.ExpiraEm, pix.ValorEmReais });
    }

    /// <summary>
    /// Cobrança da inscrição: reaproveita a que já existe se ainda estiver no prazo, senão
    /// pede uma nova ao Inter. Sem isso, cada clique em "cobrar" geraria um QR diferente e
    /// o jogador ficaria com vários códigos válidos pra mesma inscrição.
    /// </summary>
    private async Task<(PixCobranca? Pix, string? Erro)> CriarOuReaproveitarCobrancaAsync(
        ChampionshipParticipant participant, int valorEmCentavos, IntegrationConfig cfg, Guid criadaPor)
    {
        var agora = DateTime.UtcNow;
        var viva = await _db.PixCobrancas
            .Where(p => p.ChampionshipParticipantId == participant.Id
                     && p.Status == "ATIVA"
                     && (p.ExpiraEm == null || p.ExpiraEm > agora))
            .OrderByDescending(p => p.CriadoEm)
            .FirstOrDefaultAsync();
        if (viva is not null) return (viva, null);

        var cpf    = participant.User?.Cpf?.Length == 11 ? participant.User.Cpf : null;
        var result = await _inter.CriarCobrancaAsync(
            cfg, valorEmCentavos, participant.User?.Name, cpf,
            $"Inscrição — {participant.Championship.Name}");

        if (result.Error is not null) return (null, result.Error);

        var pix = new PixCobranca
        {
            Origem                    = PixCobrancaOrigem.Campeonato,
            ChampionshipParticipantId = participant.Id,
            TxId                      = result.TxId!,
            ValorEmCentavos           = valorEmCentavos,
            Status                    = result.Status ?? "ATIVA",
            PixCopiaCola              = result.PixCopiaCola,
            ImagemQrCode              = result.ImagemQrCode,
            NomeDevedor               = participant.User?.Name,
            CriadoPorAdminId          = criadaPor,
            ExpiraEm                  = result.ExpiraEm,
        };
        _db.PixCobrancas.Add(pix);
        await _db.SaveChangesAsync();
        return (pix, null);
    }

    /// <summary>
    /// Admin cobra a inscrição de um participante: gera a cobrança, deixa ela visível na
    /// conta do jogador e avisa por notificação. É o caminho pra quem já estava inscrito
    /// antes do pagamento virar obrigatório — ninguém perde a vaga, mas dá pra cobrar.
    /// </summary>
    [HttpPost("participants/{participantId:guid}/cobrar")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> CobrarInscricao(Guid participantId)
    {
        var participant = await _db.ChampionshipParticipants
            .Include(p => p.Championship)
            .Include(p => p.User)
            .FirstOrDefaultAsync(p => p.Id == participantId);
        if (participant is null)
            return NotFound(new { Message = "Participante não encontrado." });

        if (participant.EntryFeePaidAt is not null)
            return BadRequest(new { Message = "A inscrição deste jogador já está paga." });

        var valorEmCentavos = participant.Championship.EntryFeeInCents;
        if (valorEmCentavos <= 0)
            return BadRequest(new { Message = "Este campeonato não tem taxa de inscrição." });

        var cfg = await _db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == "inter");
        if (cfg is null)
            return BadRequest(new { Message = "Pagamento Pix indisponível no momento — cobre no balcão." });

        var (pix, erro) = await CriarOuReaproveitarCobrancaAsync(
            participant, valorEmCentavos, cfg, GetUserId());
        if (erro is not null) return StatusCode(422, new { message = erro });

        // Cobrar não encurta a vaga de quem já estava dentro: se a inscrição não tinha
        // prazo, continua sem prazo. O jogador vê a cobrança e paga quando puder.
        var valor = $"R$ {(valorEmCentavos / 100m):0.00}".Replace(".", ",");
        var titulo = $"Inscrição pendente — {participant.Championship.Name}";
        var corpo  = $"Falta pagar {valor} da sua inscrição. Dá pra pagar por Pix aqui mesmo, na sua conta.";

        _db.Notifications.Add(new Notification
        {
            UserId    = participant.UserId,
            Title     = titulo,
            Body      = corpo,
            Link      = "/cliente",
            CreatedAt = DateTime.UtcNow,
        });
        await _db.SaveChangesAsync();

        await _push.SendAsync(participant.UserId, titulo, corpo, "/cliente");

        _logger.LogInformation("Admin cobrou a inscrição {ParticipantId} ({Valor})", participant.Id, valor);

        return Ok(new
        {
            pix!.TxId, pix.Status, pix.PixCopiaCola, pix.ImagemQrCode, pix.ExpiraEm, pix.ValorEmReais,
            Message = "Cobrança enviada — o jogador foi notificado e vê o Pix na conta dele.",
        });
    }

    /// <summary>Verifica no Inter se a taxa de inscrição caiu; se sim, marca a inscrição como paga (Pix).</summary>
    [HttpPost("{id:guid}/my-inscription/pix/verificar")]
    [Authorize]
    public async Task<IActionResult> VerificarPixInscricao(Guid id)
    {
        var userId = GetUserId();

        var participant = await _db.ChampionshipParticipants
            .FirstOrDefaultAsync(p => p.ChampionshipId == id && p.UserId == userId);
        if (participant is null)
            return NotFound(new { Message = "Você não está inscrito neste campeonato." });

        if (participant.EntryFeePaidAt is not null)
            return Ok(new { status = "CONCLUIDA", pagoEm = participant.EntryFeePaidAt });

        var pix = await _db.PixCobrancas
            .Where(p => p.ChampionshipParticipantId == participant.Id && p.Status == "ATIVA")
            .OrderByDescending(p => p.CriadoEm)
            .FirstOrDefaultAsync();
        if (pix is null)
            return NotFound(new { Message = "Nenhuma cobrança Pix ativa para esta inscrição." });

        // A baixa mora no PixReconciliationService — mesmo caminho do robô.
        var result = await _pixReconciliation.ReconciliarAsync(pix);
        if (result.Error is not null)
            return StatusCode(422, new { message = result.Error });

        return Ok(new { status = pix.Status, pagoEm = pix.PagoEm });
    }

    /// <summary>Admin marca/desmarca a taxa de inscrição como paga no balcão.</summary>
    [HttpPut("participants/{participantId:guid}/pagamento")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> MarcarPagamentoInscricao(Guid participantId, [FromBody] MarcarPagamentoRequest req)
    {
        var participant = await _db.ChampionshipParticipants.FindAsync(participantId);
        if (participant is null)
            return NotFound(new { Message = "Participante não encontrado." });

        if (req.Pago)
        {
            participant.EntryFeePaidAt        = DateTime.UtcNow;
            participant.EntryFeePaymentMethod = "Balcao";
            participant.InscricaoExpiraEm     = null; // pagou: vaga firme, não expira mais
        }
        else
        {
            // Pagamento via Pix confirmado pelo banco não pode ser desfeito manualmente
            if (participant.EntryFeePaymentMethod == "Pix")
                return BadRequest(new { Message = "Pagamento confirmado via Pix não pode ser desmarcado." });
            participant.EntryFeePaidAt        = null;
            participant.EntryFeePaymentMethod = null;
        }

        await _db.SaveChangesAsync();
        return Ok(new { participant.Id, participant.EntryFeePaidAt, participant.EntryFeePaymentMethod });
    }

    // -------------------------------------------------------------------------
    // INSCRIÇÃO MANUAL — Admin adiciona/remove participante
    // -------------------------------------------------------------------------

    /// <summary>Admin inscreve qualquer usuário em um campeonato.</summary>
    [HttpPost("{id:guid}/admin-register")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(ParticipantDto), 201)]
    [ProducesResponseType(400)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> AdminRegister(Guid id, [FromBody] AdminRegisterRequest request)
    {
        var ch = await _service.GetByIdAsync(id);
        if (ch == null)
            return NotFound(new { Message = "Campeonato não encontrado." });

        if (ch.MaxParticipants.HasValue && ch.Participants.Count >= ch.MaxParticipants.Value)
            return BadRequest(new { Message = "O campeonato atingiu o número máximo de participantes." });

        ChampionshipParticipant participant;
        try
        {
            // Inscrição pelo balcão entra firme: quem cadastra é o lojista, que cobra na hora.
            participant = await _service.RegisterParticipantAsync(
                id, request.UserId, request.DeckName, request.DeckId, vagaFirme: true);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }

        _logger.LogInformation("Admin inscreveu usuário {UserId} no campeonato {ChampionshipId}", request.UserId, id);

        // Busca o nome do usuário para retornar no DTO
        var user = await _service.GetParticipantsAsync(id);
        var registered = user.FirstOrDefault(p => p.UserId == request.UserId);

        return StatusCode(201, new ParticipantDto
        {
            Id           = participant.Id,
            UserId       = participant.UserId,
            UserName     = registered?.User?.Name ?? string.Empty,
            PlayerNumber = participant.PlayerNumber,
            DeckName     = participant.DeckName,
            DeckId       = participant.DeckId,
            RegisteredAt = participant.RegisteredAt,
            // Sem isto a tela não sabe até quando a vaga fica segurada logo depois
            // da inscrição — só descobria no carregamento seguinte.
            InscricaoExpiraEm = participant.InscricaoExpiraEm
        });
    }

    /// <summary>Admin remove participante de um campeonato.</summary>
    [HttpDelete("{id:guid}/participants/{participantId:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> RemoveParticipant(Guid id, Guid participantId)
    {
        try
        {
            await _service.RemoveParticipantAsync(participantId);
            _logger.LogInformation("Participante {ParticipantId} removido do campeonato {Id}", participantId, id);
            return Ok(new { Message = "Participante removido." });
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { Message = ex.Message });
        }
    }

    // -------------------------------------------------------------------------
    // ATUALIZAÇÃO DE STATUS — apenas Admin
    // -------------------------------------------------------------------------

    /// <summary>Muda o status de um campeonato. Apenas Admin.</summary>
    [HttpPut("{id:guid}/status")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(ChampionshipDto), 200)]
    [ProducesResponseType(400)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateStatusRequest request)
    {
        if (!Enum.TryParse<ChampionshipStatus>(request.Status, ignoreCase: true, out var newStatus))
            return BadRequest(new { Message = $"Status inválido: '{request.Status}'. Valores válidos: Planejado, Inscricoes, EmAndamento, Finalizado, Cancelado" });

        try
        {
            var updated = await _service.UpdateStatusAsync(id, newStatus);
            _logger.LogInformation("Status do campeonato {Id} alterado para {Status}", id, newStatus);
            return Ok(ToDto(updated));
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { Message = ex.Message });
        }
    }

    // -------------------------------------------------------------------------
    // COLOCAÇÃO FINAL — apenas Admin
    // -------------------------------------------------------------------------

    /// <summary>Define a colocação final de um participante. Apenas Admin.</summary>
    [HttpPut("{id:guid}/participants/{participantId:guid}/placement")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(200)]
    [ProducesResponseType(400)]
    public async Task<IActionResult> SetPlacement(Guid id, Guid participantId, [FromBody] SetPlacementRequest request)
    {
        if (request.Placement <= 0)
            return BadRequest(new { Message = "A colocação deve ser maior que zero." });

        await _service.SetPlacementAsync(participantId, request.Placement);
        return Ok(new { Message = $"Colocação {request.Placement}º definida com sucesso." });
    }

    // -------------------------------------------------------------------------
    // IMAGEM — apenas Admin
    // -------------------------------------------------------------------------

    /// <summary>Atualiza a URL da imagem de capa de um campeonato.</summary>
    [HttpPut("{id:guid}/image")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(ChampionshipDto), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> SetImage(Guid id, [FromBody] SetImageRequest request)
    {
        var ch = await _service.GetByIdAsync(id);
        if (ch == null) return NotFound(new { Message = "Campeonato não encontrado." });

        ch.ImageUrl = request.ImageUrl;
        await _service.UpdateAsync(ch);
        return Ok(ToDto(ch));
    }

    // -------------------------------------------------------------------------
    // PRÉ-INSCRIÇÃO (landing page, sem login)
    // -------------------------------------------------------------------------

    /// <summary>Registra pré-inscrição pública (nome + WhatsApp) em um campeonato.</summary>
    [HttpPost("{id:guid}/preinscricoes")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(PreInscricaoDto), 201)]
    [ProducesResponseType(400)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> AddPreInscricao(Guid id, [FromBody] PreInscricaoRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var ch = await _service.GetByIdAsync(id);
        if (ch == null) return NotFound(new { Message = "Campeonato não encontrado." });

        if (ch.Status != ChampionshipStatus.Inscricoes && ch.Status != ChampionshipStatus.Planejado)
            return BadRequest(new { Message = "Este campeonato não está aceitando inscrições." });

        var (pi, numero) = await _service.AddPreInscricaoAsync(id, request.Nome, request.WhatsApp, request.DeckId, request.DeckName);
        _logger.LogInformation("Pré-inscrição recebida para campeonato {Id}: {Nome} (nº {Numero})", id, request.Nome, numero);
        return StatusCode(201, new PreInscricaoDto { Id = pi.Id, Nome = pi.Nome, WhatsApp = pi.WhatsApp, IsListaEspera = pi.IsListaEspera, Numero = numero, CreatedAt = pi.CreatedAt, DeckId = pi.DeckId, DeckName = pi.DeckName });
    }

    /// <summary>Lista pré-inscrições de um campeonato (Admin).</summary>
    [HttpGet("{id:guid}/preinscricoes")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(typeof(IEnumerable<PreInscricaoDto>), 200)]
    public async Task<IActionResult> GetPreInscricoes(Guid id)
    {
        var list = await _service.GetPreInscricoesAsync(id);
        var ordered = list.OrderBy(p => p.CreatedAt).ToList();
        var confirmedOrdered = ordered.Where(p => !p.IsListaEspera).ToList();
        var waitingOrdered   = ordered.Where(p =>  p.IsListaEspera).ToList();
        return Ok(ordered.Select(p => new PreInscricaoDto
        {
            Id            = p.Id,
            Nome          = p.Nome,
            WhatsApp      = p.WhatsApp,
            IsListaEspera = p.IsListaEspera,
            Numero        = p.IsListaEspera
                ? waitingOrdered.IndexOf(p) + 1
                : confirmedOrdered.IndexOf(p) + 1,
            CreatedAt     = p.CreatedAt,
            DeckId        = p.DeckId,
            DeckName      = p.DeckName,
        }));
    }

    /// <summary>Remove uma pré-inscrição (Admin — recusar ou após confirmar manualmente).</summary>
    [HttpDelete("{id:guid}/preinscricoes/{preInscricaoId:guid}")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(204)]
    public async Task<IActionResult> DeletePreInscricao(Guid id, Guid preInscricaoId)
    {
        await _service.DeletePreInscricaoAsync(preInscricaoId);
        return NoContent();
    }

    // -------------------------------------------------------------------------
    // PÓDIO — apenas Admin
    // -------------------------------------------------------------------------

    /// <summary>Salva o pódio do campeonato como JSON. Apenas Admin.</summary>
    [HttpPatch("{id:guid}/podio")]
    [Authorize(Policy = "AdminOnly")]
    [ProducesResponseType(200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> SetPodio(Guid id, [FromBody] SetPodioRequest request)
    {
        try
        {
            await _service.SetPodioAsync(id, request.PodioJson);
            return Ok(new { Message = "Pódio salvo com sucesso." });
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { Message = ex.Message });
        }
    }

    // -------------------------------------------------------------------------
    // Helpers privados
    // -------------------------------------------------------------------------

    private Guid GetUserId()
    {
        var claim = User.FindFirst("sub") ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (claim is null || !Guid.TryParse(claim.Value, out var id))
            throw new UnauthorizedAccessException("Token inválido: identificador de usuário ausente.");
        return id;
    }

    /// <summary>Mapeia Championship → ChampionshipDto (evita circular reference).</summary>
    private static ChampionshipDto ToDto(Championship ch) => new()
    {
        Id                   = ch.Id,
        Name                 = ch.Name,
        Description          = ch.Description,
        Game                 = ch.Game,
        StartDate            = ch.StartDate,
        EndDate              = ch.EndDate,
        RegistrationDeadline = ch.RegistrationDeadline,
        MaxParticipants      = ch.MaxParticipants,
        EntryFeeInCents      = ch.EntryFeeInCents,
        EntryFeeInReais      = ch.EntryFeeInCents / 100m,
        MinutosParaPagar     = ch.MinutosParaPagar,
        Status               = ch.Status.ToString(),
        ParticipantCount     = ch.Participants?.Count ?? 0,
        PreInscricaoCount    = ch.PreInscricoes?.Count(p => !p.IsListaEspera)  ?? 0,
        ListaEsperaCount     = ch.PreInscricoes?.Count(p =>  p.IsListaEspera) ?? 0,
        CreatedAt            = ch.CreatedAt,
        ImageUrl             = ch.ImageUrl,
        PodioJson            = ch.PodioJson,
    };
}

// =============================================================================
// DTOs e Request Records — definidos no mesmo arquivo para simplicidade
// =============================================================================

/// <summary>Request para atualizar campos editáveis de um campeonato.</summary>
public class UpdateChampionshipRequest
{
    [System.ComponentModel.DataAnnotations.Required]
    [System.ComponentModel.DataAnnotations.MaxLength(200)]
    public string    Name                 { get; init; } = string.Empty;

    [System.ComponentModel.DataAnnotations.MaxLength(1000)]
    public string?   Description          { get; init; }

    [System.ComponentModel.DataAnnotations.Required]
    [System.ComponentModel.DataAnnotations.MaxLength(100)]
    public string    Game                 { get; init; } = string.Empty;

    public DateTime  StartDate            { get; init; }
    public DateTime? EndDate              { get; init; }
    public DateTime? RegistrationDeadline { get; init; }
    public int?      MaxParticipants      { get; init; }
    public int       EntryFeeInCents      { get; init; }
    public string?   ImageUrl             { get; init; }

    /// <summary>
    /// Minutos que a vaga fica segurada esperando o pagamento. Null = mantém o
    /// que já está gravado (cliente antigo que não manda o campo não zera nada).
    /// </summary>
    public int?      MinutosParaPagar     { get; init; }
}

/// <summary>DTO de resposta de campeonato (sem circular reference).</summary>
public class ChampionshipDto
{
    public Guid      Id                   { get; init; }
    public string    Name                 { get; init; } = string.Empty;
    public string?   Description          { get; init; }
    public string    Game                 { get; init; } = string.Empty;
    public DateTime  StartDate            { get; init; }
    public DateTime? EndDate              { get; init; }
    public DateTime? RegistrationDeadline { get; init; }
    public int?      MaxParticipants      { get; init; }
    public int       EntryFeeInCents      { get; init; }
    public decimal   EntryFeeInReais      { get; init; }
    /// <summary>Minutos que a vaga fica segurada esperando pagamento.</summary>
    public int       MinutosParaPagar     { get; init; }
    public string    Status               { get; init; } = string.Empty;
    public int       ParticipantCount     { get; init; }
    public int       PreInscricaoCount    { get; init; }
    public int       ListaEsperaCount     { get; init; }
    public DateTime  CreatedAt            { get; init; }
    public string?   ImageUrl             { get; init; }
    public string?   PodioJson            { get; init; }
}

/// <summary>DTO de participação do próprio usuário (GET /api/championship/my-participations).</summary>
public class MyParticipationDto
{
    public Guid      ParticipationId  { get; init; }
    public Guid      ChampionshipId   { get; init; }
    public string    ChampionshipName { get; init; } = string.Empty;
    public string    Game             { get; init; } = string.Empty;
    public DateTime  StartDate        { get; init; }
    public string    Status           { get; init; } = string.Empty;
    public decimal   EntryFeeInReais  { get; init; }
    public int       PlayerNumber     { get; init; }
    public string?   DeckName         { get; init; }
    public int?      Placement        { get; init; }
    public DateTime  RegisteredAt     { get; init; }
    public DateTime? EntryFeePaidAt        { get; init; }
    public string?   EntryFeePaymentMethod { get; init; }
    /// <summary>Até quando a vaga fica segurada esperando pagamento. Null = vaga firme.</summary>
    public DateTime? InscricaoExpiraEm     { get; init; }
}

/// <summary>DTO de participante em um campeonato.</summary>
public class ParticipantDto
{
    public Guid      Id           { get; init; }
    public Guid      UserId       { get; init; }
    public string    UserName     { get; init; } = string.Empty;
    public int       PlayerNumber { get; init; }
    public string?   DeckName     { get; init; }
    public Guid?     DeckId       { get; init; }
    public int?      Placement    { get; init; }
    public DateTime  RegisteredAt { get; init; }
    public DateTime? EntryFeePaidAt        { get; init; }
    public string?   EntryFeePaymentMethod { get; init; }
    /// <summary>Até quando a vaga fica segurada esperando pagamento. Null = vaga firme.</summary>
    public DateTime? InscricaoExpiraEm     { get; init; }
}

/// <summary>Request do admin para marcar/desmarcar pagamento da inscrição no balcão.</summary>
public class MarcarPagamentoRequest
{
    public bool Pago { get; init; }
}

/// <summary>Request para criar campeonato.</summary>
public class CreateChampionshipRequest
{
    [System.ComponentModel.DataAnnotations.Required]
    [System.ComponentModel.DataAnnotations.MaxLength(200)]
    public string    Name                 { get; init; } = string.Empty;

    [System.ComponentModel.DataAnnotations.MaxLength(1000)]
    public string?   Description          { get; init; }

    [System.ComponentModel.DataAnnotations.Required]
    [System.ComponentModel.DataAnnotations.MaxLength(100)]
    public string    Game                 { get; init; } = string.Empty;

    public DateTime  StartDate            { get; init; }
    public DateTime? EndDate              { get; init; }
    public DateTime? RegistrationDeadline { get; init; }
    public int?      MaxParticipants      { get; init; }
    public int       EntryFeeInCents      { get; init; }
    public string?   ImageUrl             { get; init; }

    /// <summary>
    /// Minutos que a vaga fica segurada esperando o pagamento. Null = mantém o
    /// que já está gravado (cliente antigo que não manda o campo não zera nada).
    /// </summary>
    public int?      MinutosParaPagar     { get; init; }
}

/// <summary>Request para alterar status do campeonato.</summary>
public record UpdateStatusRequest(string Status);

/// <summary>Request para o admin inscrever um usuário específico.</summary>
public class AdminRegisterRequest
{
    [System.ComponentModel.DataAnnotations.Required]
    public Guid UserId { get; init; }
    public string? DeckName { get; init; }
    public Guid?   DeckId   { get; init; }
}

/// <summary>Request para inscrição em campeonato (deck é opcional).</summary>
public record RegisterChampionshipRequest(
    [System.ComponentModel.DataAnnotations.MaxLength(200)] string? DeckName,
    Guid? DeckId = null);

/// <summary>Request para definir colocação de participante.</summary>
public record SetPlacementRequest(int Placement);

/// <summary>Request para definir/atualizar a imagem de capa do campeonato.</summary>
public record SetImageRequest(string? ImageUrl);

/// <summary>Request de pré-inscrição pública (sem login).</summary>
public class PreInscricaoRequest
{
    [System.ComponentModel.DataAnnotations.Required, System.ComponentModel.DataAnnotations.MaxLength(200)]
    public string  Nome     { get; init; } = string.Empty;
    [System.ComponentModel.DataAnnotations.Required, System.ComponentModel.DataAnnotations.MaxLength(30)]
    public string  WhatsApp { get; init; } = string.Empty;
    public Guid?   DeckId   { get; init; }
    public string? DeckName { get; init; }
}

/// <summary>DTO de pré-inscrição retornado ao frontend.</summary>
public class PreInscricaoDto
{
    public Guid     Id            { get; init; }
    public string   Nome          { get; init; } = string.Empty;
    public string   WhatsApp      { get; init; } = string.Empty;
    public bool     IsListaEspera { get; init; }
    /// <summary>Posição na fila de confirmados ou na lista de espera.</summary>
    public int      Numero        { get; init; }
    public DateTime CreatedAt     { get; init; }
    public Guid?    DeckId        { get; init; }
    public string?  DeckName      { get; init; }
}

/// <summary>Request para salvar o pódio de um campeonato.</summary>
public record SetPodioRequest(string PodioJson);
