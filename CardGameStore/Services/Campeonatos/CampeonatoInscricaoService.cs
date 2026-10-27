// =============================================================================
// CampeonatoInscricaoService.cs — inscrição em campeonato e o Pix da entrada.
//
// Campeonato pago: a vaga só fica firme quando o Pix cai (a baixa mora no
// PixReconciliationService). Até lá ela fica segurada até InscricaoExpiraEm.
// Pagamento no balcão foi desativado — a cobrança é sempre Pix antecipado.
// Campeonato gratuito: entra com vaga firme na hora.
// =============================================================================

using CardGameStore.Common;
using CardGameStore.Data;
using CardGameStore.DTOs;
using CardGameStore.Models.PostgreSQL;
using CardGameStore.Services.Implementations;
using CardGameStore.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Services.Campeonatos;

public interface ICampeonatoInscricaoService
{
    /// <summary>Participantes com o valor da última cobrança de cada um.</summary>
    Task<List<ParticipantDto>> ParticipantesAsync(Guid championshipId);

    /// <summary>Cliente se inscreve (ou retoma a inscrição). Criada=false: já existia.</summary>
    Task<(bool Criada, InscricaoDto Inscricao)> InscreverAsync(Guid championshipId, Guid userId, RegisterChampionshipRequest? req);

    /// <summary>Admin inscreve um cliente; em campeonato pago o Pix já sai e ele é avisado.</summary>
    Task<ParticipantDto> InscreverPeloAdminAsync(Guid championshipId, AdminRegisterRequest req, Guid adminId);

    /// <summary>Pix da inscrição do próprio cliente (reaproveita o que ainda está no prazo).</summary>
    Task<PixInscricaoDto> GerarPixAsync(Guid championshipId, Guid userId);

    /// <summary>Admin cobra a inscrição de um participante e avisa o jogador.</summary>
    Task<CobrancaInscricaoDto> CobrarAsync(Guid participantId, Guid adminId);

    /// <summary>Confere no Inter se o Pix da inscrição caiu.</summary>
    Task<PixInscricaoVerificadoDto> VerificarPixAsync(Guid championshipId, Guid userId);

    /// <summary>Rota legada do balcão: só desmarca pagamento que não veio do Pix.</summary>
    Task<PagamentoInscricaoDto> MarcarPagamentoAsync(Guid participantId, bool pago);
}

public class CampeonatoInscricaoService(
    AppDbContext db, IChampionshipService campeonatos, InterSyncService inter,
    IPixReconciliationService reconciliacao, IPushService push,
    ILogger<CampeonatoInscricaoService> logger) : ICampeonatoInscricaoService
{
    private const string NaoEncontrado = "Campeonato não encontrado.";
    private const string Lotado = "O campeonato atingiu o número máximo de participantes.";

    public async Task<List<ParticipantDto>> ParticipantesAsync(Guid championshipId)
    {
        var participantes = await campeonatos.GetParticipantsAsync(championshipId);
        // Valor da cobrança de cada um (a mais recente): o preço da entrada pode mudar depois das
        // primeiras inscrições, e quem já tinha cobrança fica com o valor dela.
        var ids = participantes.Select(p => p.Id).ToList();
        var cobrancas = await db.PixCobrancas.AsNoTracking()
            .Where(c => c.ChampionshipParticipantId != null && ids.Contains(c.ChampionshipParticipantId.Value))
            .Select(c => new { Id = c.ChampionshipParticipantId!.Value, c.ValorEmCentavos, c.CriadoEm, c.Status })
            .ToListAsync();
        var ultimaPor = cobrancas.GroupBy(c => c.Id)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(c => c.CriadoEm).First());

        return participantes.Select(p =>
        {
            var ultima = ultimaPor.GetValueOrDefault(p.Id);
            return new ParticipantDto
            {
                ValorInscricaoEmCentavos = ultima?.ValorEmCentavos,
                // Cobrança em aberto conta como "a receber" mesmo com vaga firme (cobrada depois de a entrada virar paga)
                CobrancaEmAberto      = ultima?.Status == "ATIVA" && p.EntryFeePaidAt == null,
                Id                    = p.Id,
                UserId                = p.UserId,
                UserName              = p.User?.Name ?? string.Empty,
                PlayerNumber          = p.PlayerNumber,
                DeckName              = p.DeckName,
                DeckId                = p.DeckId,
                Placement             = p.Placement,
                RegisteredAt          = p.RegisteredAt,
                EntryFeePaidAt        = p.EntryFeePaidAt,
                EntryFeePaymentMethod = p.EntryFeePaymentMethod,
                InscricaoExpiraEm     = p.InscricaoExpiraEm,
            };
        }).ToList();
    }

    public async Task<(bool Criada, InscricaoDto Inscricao)> InscreverAsync(Guid championshipId, Guid userId, RegisterChampionshipRequest? req)
    {
        var ch = await campeonatos.GetByIdAsync(championshipId) ?? throw new RegraException(NaoEncontrado, 404);
        if (ch.Status != ChampionshipStatus.Inscricoes)
            throw new RegraException("As inscrições para este campeonato não estão abertas.");
        if (ch.RegistrationDeadline.HasValue && ch.RegistrationDeadline.Value < DateTime.UtcNow)
            throw new RegraException("O prazo de inscrição para este campeonato já encerrou.");

        IntegrationConfig? cfg = null;
        if (ch.EntryFeeInCents > 0)
            cfg = await InterAsync() ?? throw new RegraException("O Pix está indisponível. A inscrição não foi criada; fale com o Maikon.");

        var participante = await ParticipanteAsync(p => p.ChampionshipId == championshipId && p.UserId == userId);
        var criouAgora = participante is null;

        if (participante?.EntryFeePaidAt is not null)
            throw new RegraException("Sua inscrição neste campeonato já está confirmada.");

        // Quem já estava segurando uma vaga pode retomar o Pix mesmo se as demais vagas encheram.
        // Inscrição nova (ou vencida) precisa disputar a capacidade atual.
        if ((participante is null || !participante.VagaVale) && Cheio(ch))
            throw new RegraException(Lotado);

        if (participante is not null && !participante.VagaVale)
        {
            participante.InscricaoExpiraEm = DateTime.UtcNow.AddMinutes(Math.Max(1, ch.MinutosParaPagar));
            await db.SaveChangesAsync();
        }

        if (participante is null)
        {
            await RegistrarAsync(championshipId, userId, req?.DeckName, req?.DeckId, vagaFirme: ch.EntryFeeInCents <= 0);
            participante = (await ParticipanteAsync(p => p.ChampionshipId == championshipId && p.UserId == userId))!;
        }

        PixInscricaoDto? pixDto = null;
        if (ch.EntryFeeInCents > 0)
        {
            var (pix, erro) = await CriarOuReaproveitarCobrancaAsync(participante, ch.EntryFeeInCents, cfg!, userId);
            if (erro is not null)
            {
                if (criouAgora)
                {
                    db.ChampionshipParticipants.Remove(participante);
                    await db.SaveChangesAsync();
                }
                var prefixo = criouAgora
                    ? "Não foi possível gerar o Pix; a inscrição não foi criada."
                    : "Não foi possível retomar o Pix da sua inscrição.";
                throw new RegraException($"{prefixo} {erro}", 422);
            }
            pixDto = PixInscricaoDto.De(pix!);
        }

        logger.LogInformation("Usuário {UserId} iniciou inscrição no campeonato {ChampionshipId}", userId, championshipId);
        return (criouAgora, new InscricaoDto(new ParticipantDto
        {
            Id                = participante.Id,
            UserId            = participante.UserId,
            UserName          = string.Empty,
            PlayerNumber      = participante.PlayerNumber,
            DeckName          = participante.DeckName,
            DeckId            = participante.DeckId,
            RegisteredAt      = participante.RegisteredAt,
            InscricaoExpiraEm = participante.InscricaoExpiraEm,
        }, pixDto));
    }

    public async Task<ParticipantDto> InscreverPeloAdminAsync(Guid championshipId, AdminRegisterRequest req, Guid adminId)
    {
        var ch = await campeonatos.GetByIdAsync(championshipId) ?? throw new RegraException(NaoEncontrado, 404);
        if (Cheio(ch)) throw new RegraException(Lotado);

        IntegrationConfig? cfg = null;
        if (ch.EntryFeeInCents > 0)
            cfg = await InterAsync() ?? throw new RegraException("Pagamento Pix indisponível. Configure a integração antes de adicionar participantes.");

        // Campeonato pago só confirma a vaga quando o Pix cair. Gratuito entra firme.
        var participante = await RegistrarAsync(championshipId, req.UserId, req.DeckName, req.DeckId, vagaFirme: ch.EntryFeeInCents <= 0);

        if (ch.EntryFeeInCents > 0)
        {
            var completo = (await ParticipanteAsync(p => p.Id == participante.Id))!;
            var (_, erro) = await CriarOuReaproveitarCobrancaAsync(completo, ch.EntryFeeInCents, cfg!, adminId);
            if (erro is not null)
            {
                db.ChampionshipParticipants.Remove(completo);
                await db.SaveChangesAsync();
                throw new RegraException($"Não foi possível criar o Pix; o participante não foi incluído. {erro}", 422);
            }
            await AvisarCobrancaAsync(completo, ch.EntryFeeInCents);
        }

        logger.LogInformation("Maikon inscreveu usuário {UserId} no campeonato {ChampionshipId}", req.UserId, championshipId);

        var nome = (await campeonatos.GetParticipantsAsync(championshipId)).FirstOrDefault(p => p.UserId == req.UserId)?.User?.Name;
        return new ParticipantDto
        {
            Id                = participante.Id,
            UserId            = participante.UserId,
            UserName          = nome ?? string.Empty,
            PlayerNumber      = participante.PlayerNumber,
            DeckName          = participante.DeckName,
            DeckId            = participante.DeckId,
            RegisteredAt      = participante.RegisteredAt,
            InscricaoExpiraEm = participante.InscricaoExpiraEm,
        };
    }

    public async Task<PixInscricaoDto> GerarPixAsync(Guid championshipId, Guid userId)
    {
        var participante = await ParticipanteAsync(p => p.ChampionshipId == championshipId && p.UserId == userId)
            ?? throw new RegraException("Você não está inscrito neste campeonato.", 404);
        if (participante.EntryFeePaidAt is not null)
            throw new RegraException("A inscrição já está paga.");

        var valor = participante.Championship.EntryFeeInCents;
        if (valor <= 0) throw new RegraException("Este campeonato não tem taxa de inscrição.");

        var cfg = await InterAsync()
            ?? throw new RegraException("Pagamento Pix indisponível no momento. Fale com o Maikon; pagamento na chegada não é aceito.");

        var (pix, erro) = await CriarOuReaproveitarCobrancaAsync(participante, valor, cfg, userId);
        if (erro is not null) throw new RegraException(erro, 422);
        return PixInscricaoDto.De(pix!);
    }

    // É o caminho pra quem já estava inscrito antes do pagamento virar obrigatório — ninguém
    // perde a vaga, mas dá pra cobrar.
    public async Task<CobrancaInscricaoDto> CobrarAsync(Guid participantId, Guid adminId)
    {
        var participante = await ParticipanteAsync(p => p.Id == participantId)
            ?? throw new RegraException("Participante não encontrado.", 404);
        if (participante.EntryFeePaidAt is not null)
            throw new RegraException("A inscrição deste jogador já está paga.");

        var valor = participante.Championship.EntryFeeInCents;
        if (valor <= 0) throw new RegraException("Este campeonato não tem taxa de inscrição.");

        var cfg = await InterAsync()
            ?? throw new RegraException("Pagamento Pix indisponível no momento. Configure o Pix antes de incluir ou cobrar participantes.");

        var (pix, erro) = await CriarOuReaproveitarCobrancaAsync(participante, valor, cfg, adminId);
        if (erro is not null) throw new RegraException(erro, 422);

        await AvisarCobrancaAsync(participante, valor);
        logger.LogInformation("Admin cobrou a inscrição {ParticipantId} ({Valor})", participante.Id, Reais(valor));

        return new CobrancaInscricaoDto(pix!.TxId, pix.Status, pix.PixCopiaCola, pix.ImagemQrCode, pix.ExpiraEm, pix.ValorEmReais,
            "Cobrança enviada — o jogador foi notificado e vê o Pix na conta dele.");
    }

    public async Task<PixInscricaoVerificadoDto> VerificarPixAsync(Guid championshipId, Guid userId)
    {
        var participante = await db.ChampionshipParticipants
            .FirstOrDefaultAsync(p => p.ChampionshipId == championshipId && p.UserId == userId)
            ?? throw new RegraException("Você não está inscrito neste campeonato.", 404);
        if (participante.EntryFeePaidAt is not null)
            return new PixInscricaoVerificadoDto("CONCLUIDA", participante.EntryFeePaidAt);

        var pix = await db.PixCobrancas
            .Where(p => p.ChampionshipParticipantId == participante.Id && p.Status == "ATIVA")
            .OrderByDescending(p => p.CriadoEm)
            .FirstOrDefaultAsync()
            ?? throw new RegraException("Nenhuma cobrança Pix ativa para esta inscrição.", 404);

        // A baixa mora no PixReconciliationService — mesmo caminho do robô
        var result = await reconciliacao.ReconciliarAsync(pix);
        if (result.Error is not null) throw new RegraException(result.Error, 422);

        return new PixInscricaoVerificadoDto(pix.Status, pix.PagoEm);
    }

    public async Task<PagamentoInscricaoDto> MarcarPagamentoAsync(Guid participantId, bool pago)
    {
        var participante = await db.ChampionshipParticipants.FindAsync(participantId)
            ?? throw new RegraException("Participante não encontrado.", 404);

        if (pago)
            throw new RegraException("Pagamento no balcão foi desativado para campeonatos. Envie a cobrança Pix antecipada.");
        // Pagamento via Pix confirmado pelo banco não pode ser desfeito à mão
        if (participante.EntryFeePaymentMethod == "Pix")
            throw new RegraException("Pagamento confirmado via Pix não pode ser desmarcado.");

        participante.EntryFeePaidAt        = null;
        participante.EntryFeePaymentMethod = null;
        await db.SaveChangesAsync();
        return new PagamentoInscricaoDto(participante.Id, participante.EntryFeePaidAt, participante.EntryFeePaymentMethod);
    }

    /// <summary>
    /// Reaproveita a cobrança que ainda está no prazo, senão pede uma nova ao Inter. Sem isso, cada
    /// clique em "cobrar" geraria um QR diferente e o jogador ficaria com vários códigos válidos.
    /// </summary>
    private async Task<(PixCobranca? Pix, string? Erro)> CriarOuReaproveitarCobrancaAsync(
        ChampionshipParticipant participante, int valorEmCentavos, IntegrationConfig cfg, Guid criadaPor)
    {
        var agora = DateTime.UtcNow;
        var viva = await db.PixCobrancas
            .Where(p => p.ChampionshipParticipantId == participante.Id
                     && p.Status == "ATIVA"
                     && (p.ExpiraEm == null || p.ExpiraEm > agora))
            .OrderByDescending(p => p.CriadoEm)
            .FirstOrDefaultAsync();
        if (viva is not null) return (viva, null);

        var cpf = participante.User?.Cpf?.Length == 11 ? participante.User.Cpf : null;
        var result = await inter.CriarCobrancaAsync(cfg, valorEmCentavos, participante.User?.Name, cpf,
            $"Inscrição — {participante.Championship.Name}");
        if (result.Error is not null) return (null, result.Error);

        var pix = new PixCobranca
        {
            Origem                    = PixCobrancaOrigem.Campeonato,
            ChampionshipParticipantId = participante.Id,
            TxId                      = result.TxId!,
            ValorEmCentavos           = valorEmCentavos,
            Status                    = result.Status ?? "ATIVA",
            PixCopiaCola              = result.PixCopiaCola,
            ImagemQrCode              = result.ImagemQrCode,
            NomeDevedor               = participante.User?.Name,
            CriadoPorAdminId          = criadaPor,
            ExpiraEm                  = result.ExpiraEm,
        };
        db.PixCobrancas.Add(pix);
        await db.SaveChangesAsync();
        return (pix, null);
    }

    private async Task AvisarCobrancaAsync(ChampionshipParticipant participante, int valorEmCentavos)
    {
        var titulo = $"Pix da inscrição — {participante.Championship.Name}";
        var corpo  = $"O Maikon adicionou você ao campeonato. Pague {Reais(valorEmCentavos)} antecipadamente por Pix para confirmar sua vaga.";

        db.Notifications.Add(new Notification
        {
            UserId = participante.UserId, Title = titulo, Body = corpo, Link = "/cliente", CreatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
        await push.SendAsync(participante.UserId, titulo, corpo, "/cliente");
    }

    /// <summary>RegisterParticipantAsync recusa com InvalidOperationException (já inscrito, lotado...).</summary>
    private async Task<ChampionshipParticipant> RegistrarAsync(Guid championshipId, Guid userId, string? deckName, Guid? deckId, bool vagaFirme)
    {
        try
        {
            return await campeonatos.RegisterParticipantAsync(championshipId, userId, deckName, deckId, vagaFirme);
        }
        catch (InvalidOperationException ex)
        {
            throw new RegraException(ex.Message);
        }
    }

    private static bool Cheio(Championship ch) =>
        ch.MaxParticipants.HasValue && ch.Participants.Count(p => p.VagaVale) >= ch.MaxParticipants.Value;

    private static string Reais(int centavos) => $"R$ {(centavos / 100m):0.00}".Replace(".", ",");

    private Task<IntegrationConfig?> InterAsync() =>
        db.IntegrationConfigs.FirstOrDefaultAsync(c => c.Source == "inter");

    private Task<ChampionshipParticipant?> ParticipanteAsync(System.Linq.Expressions.Expression<Func<ChampionshipParticipant, bool>> filtro) =>
        db.ChampionshipParticipants.Include(p => p.Championship).Include(p => p.User).FirstOrDefaultAsync(filtro);
}
