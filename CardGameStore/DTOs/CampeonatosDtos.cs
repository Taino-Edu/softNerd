using System.ComponentModel.DataAnnotations;
using CardGameStore.Models.PostgreSQL;

namespace CardGameStore.DTOs;

// =============================================================================
// CampeonatosDtos.cs — entrada e saída dos campeonatos (Controllers/ChampionshipController.cs)
// e da inscrição (Services/Campeonatos/CampeonatoInscricaoService.cs).
// =============================================================================


/// <summary>Request para atualizar campos editáveis de um campeonato.</summary>
public class UpdateChampionshipRequest
{
    [Required]
    [MaxLength(200)]
    public string    Name                 { get; init; } = string.Empty;

    [MaxLength(1000)]
    public string?   Description          { get; init; }

    [Required]
    [MaxLength(100)]
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
    /// <summary>Liga ou Campeonato. Ausente: Liga na criação, mantém na edição.</summary>
    public ModalidadeTorneio? Modalidade { get; init; }
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
    /// <summary>"Livre" (campeonato comum ou etapa lançada de fora) ou "Suico" (liguinha rodada no sistema).</summary>
    public string    Formato              { get; init; } = "Livre";
    /// <summary>"Liga" (soma na Liga Mensal) ou "Campeonato" (avulso, não soma).</summary>
    public string    Modalidade           { get; init; } = "Liga";
    public int       RodadaAtual          { get; init; }
    public int?      NumeroRodadas        { get; init; }
    /// <summary>Participantes com check-in feito.</summary>
    public int       PresentesCount       { get; init; }
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
    /// <summary>Valor da cobrança Pix da inscrição (null = sem cobrança: grátis ou pago no balcão).</summary>
    public int?      ValorInscricaoEmCentavos { get; init; }
    /// <summary>Tem cobrança Pix ativa e ainda não pagou.</summary>
    public bool      CobrancaEmAberto         { get; init; }
}

/// <summary>Request do admin para marcar/desmarcar pagamento da inscrição no balcão.</summary>
public class MarcarPagamentoRequest
{
    public bool Pago { get; init; }
}

/// <summary>Request para criar campeonato.</summary>
public class CreateChampionshipRequest
{
    [Required]
    [MaxLength(200)]
    public string    Name                 { get; init; } = string.Empty;

    [MaxLength(1000)]
    public string?   Description          { get; init; }

    [Required]
    [MaxLength(100)]
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
    /// <summary>Liga ou Campeonato. Ausente: Liga na criação, mantém na edição.</summary>
    public ModalidadeTorneio? Modalidade { get; init; }
}

/// <summary>Request para alterar status do campeonato.</summary>
public record UpdateStatusRequest(string Status);

/// <summary>Request para o admin inscrever um usuário específico.</summary>
public class AdminRegisterRequest
{
    [Required]
    public Guid UserId { get; init; }
    public string? DeckName { get; init; }
    public Guid?   DeckId   { get; init; }
}

/// <summary>Request para inscrição em campeonato (deck é opcional).</summary>
public record RegisterChampionshipRequest(
    [MaxLength(200)] string? DeckName,
    Guid? DeckId = null);

/// <summary>Request para definir colocação de participante.</summary>
public record SetPlacementRequest(int Placement);

/// <summary>Request para definir/atualizar a imagem de capa do campeonato.</summary>
public record SetImageRequest(string? ImageUrl);

/// <summary>Request de pré-inscrição pública (sem login).</summary>
public class PreInscricaoRequest
{
    [Required, MaxLength(200)]
    public string  Nome     { get; init; } = string.Empty;
    [Required, MaxLength(30)]
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

/// <summary>Pix da inscrição como as telas recebem.</summary>
public sealed record PixInscricaoDto(
    string TxId, string Status, string? PixCopiaCola, string? ImagemQrCode, DateTime? ExpiraEm, decimal ValorEmReais)
{
    public static PixInscricaoDto De(PixCobranca pix) =>
        new(pix.TxId, pix.Status, pix.PixCopiaCola, pix.ImagemQrCode, pix.ExpiraEm, pix.ValorEmReais);
}

/// <summary>Inscrição feita (ou retomada) pelo cliente; Pix nulo em campeonato gratuito.</summary>
public sealed record InscricaoDto(ParticipantDto Participant, PixInscricaoDto? Pix);

/// <summary>Cobrança da inscrição enviada pelo admin.</summary>
public sealed record CobrancaInscricaoDto(
    string TxId, string Status, string? PixCopiaCola, string? ImagemQrCode, DateTime? ExpiraEm, decimal ValorEmReais,
    string Message);

public sealed record PixInscricaoVerificadoDto(string Status, DateTime? PagoEm);

public sealed record PagamentoInscricaoDto(Guid Id, DateTime? EntryFeePaidAt, string? EntryFeePaymentMethod);

/// <summary>Request → entidade e entidade → DTO dos campeonatos.</summary>
public static class CampeonatoMapeamento
{
    public static Championship ParaCampeonato(this CreateChampionshipRequest r, Guid adminId) => new()
    {
        Name                 = r.Name,
        Description          = r.Description,
        Game                 = r.Game,
        StartDate            = r.StartDate,
        EndDate              = r.EndDate,
        RegistrationDeadline = r.RegistrationDeadline,
        MaxParticipants      = r.MaxParticipants,
        EntryFeeInCents      = r.EntryFeeInCents,
        MinutosParaPagar     = Math.Clamp(r.MinutosParaPagar ?? 30, 1, 1440),
        ImageUrl             = r.ImageUrl,
        Modalidade           = r.Modalidade ?? ModalidadeTorneio.Liga,
        Status               = ChampionshipStatus.Planejado,
        CreatedByAdminId     = adminId,
    };

    public static void AplicarEm(this UpdateChampionshipRequest r, Championship ch)
    {
        ch.Name                 = r.Name;
        ch.Description          = r.Description;
        ch.Game                 = r.Game;
        ch.StartDate            = r.StartDate;
        ch.EndDate              = r.EndDate;
        ch.RegistrationDeadline = r.RegistrationDeadline;
        ch.MaxParticipants      = r.MaxParticipants;
        ch.EntryFeeInCents      = r.EntryFeeInCents;
        ch.ImageUrl             = r.ImageUrl;
        // Só sobrescreve se veio no corpo — assim uma tela antiga não zera o prazo
        if (r.MinutosParaPagar is int minutos) ch.MinutosParaPagar = Math.Clamp(minutos, 1, 1440);
        if (r.Modalidade is { } modalidade) ch.Modalidade = modalidade;
    }

    public static ChampionshipDto ParaDto(this Championship ch) => new()
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
        PreInscricaoCount    = ch.PreInscricoes?.Count(p => !p.IsListaEspera) ?? 0,
        ListaEsperaCount     = ch.PreInscricoes?.Count(p =>  p.IsListaEspera) ?? 0,
        CreatedAt            = ch.CreatedAt,
        ImageUrl             = ch.ImageUrl,
        PodioJson            = ch.PodioJson,
        Formato              = ch.Formato.ToString(),
        Modalidade           = ch.Modalidade.ToString(),
        RodadaAtual          = ch.RodadaAtual,
        NumeroRodadas        = ch.NumeroRodadas,
        PresentesCount       = ch.Participants?.Count(p => p.CheckInEm != null) ?? 0,
    };

    public static MyParticipationDto ParaMinhaParticipacao(this ChampionshipParticipant p) => new()
    {
        ParticipationId       = p.Id,
        ChampionshipId        = p.ChampionshipId,
        ChampionshipName      = p.Championship?.Name ?? string.Empty,
        Game                  = p.Championship?.Game ?? string.Empty,
        StartDate             = p.Championship?.StartDate ?? default,
        Status                = p.Championship?.Status.ToString() ?? string.Empty,
        EntryFeeInReais       = (p.Championship?.EntryFeeInCents ?? 0) / 100m,
        PlayerNumber          = p.PlayerNumber,
        DeckName              = p.DeckName,
        Placement             = p.Placement,
        RegisteredAt          = p.RegisteredAt,
        EntryFeePaidAt        = p.EntryFeePaidAt,
        EntryFeePaymentMethod = p.EntryFeePaymentMethod,
        InscricaoExpiraEm     = p.InscricaoExpiraEm,
    };

    /// <summary>Pré-inscrições em ordem de chegada; Numero conta separado confirmados e lista de espera.</summary>
    public static List<PreInscricaoDto> Numeradas(IEnumerable<ChampionshipPreInscricao> lista)
    {
        var confirmadas = 0;
        var espera = 0;
        return lista.OrderBy(p => p.CreatedAt).Select(p => p.ParaDto(p.IsListaEspera ? ++espera : ++confirmadas)).ToList();
    }

    public static PreInscricaoDto ParaDto(this ChampionshipPreInscricao p, int numero) => new()
    {
        Id = p.Id, Nome = p.Nome, WhatsApp = p.WhatsApp, IsListaEspera = p.IsListaEspera, Numero = numero,
        CreatedAt = p.CreatedAt, DeckId = p.DeckId, DeckName = p.DeckName,
    };
}
