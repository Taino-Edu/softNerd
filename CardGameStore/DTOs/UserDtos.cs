// =============================================================================
// UserDtos.cs — DTOs para gerenciamento de usuários e pontos
// =============================================================================

using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace CardGameStore.DTOs;

// ── Preferências ─────────────────────────────────────────────────────────────

public class AiButtonPrefs
{
    [JsonPropertyName("mode")]    public string Mode    { get; set; } = "draggable";
    [JsonPropertyName("corner")]  public string Corner  { get; set; } = "bottom-right";
    [JsonPropertyName("enabled")] public bool   Enabled { get; set; } = true;
}

public class VLibrasPrefs
{
    [JsonPropertyName("enabled")] public bool   Enabled { get; set; } = true;
    [JsonPropertyName("corner")]  public string Corner  { get; set; } = "bottom-right";
}

/// <summary>Widget lateral do timer de torneio — mesmo formato do VLibras.</summary>
public class TimerPrefs
{
    [JsonPropertyName("enabled")] public bool   Enabled { get; set; } = true;
    [JsonPropertyName("corner")]  public string Corner  { get; set; } = "bottom-right";
}

public class NotificationPrefs
{
    [JsonPropertyName("soundEnabled")]
    public bool SoundEnabled { get; set; } = true;

    [JsonPropertyName("browserEnabled")]
    public bool BrowserEnabled { get; set; } = true;
}

public class PdvPrefs
{
    [JsonPropertyName("defaultDiscount")]
    public int DefaultDiscount { get; set; } = 0; // 0, 5, 10, 15, 20
}

public class DashboardPanelsPrefs
{
    [JsonPropertyName("finHoje")]       public bool FinHoje       { get; set; } = true;
    [JsonPropertyName("grafico")]       public bool Grafico       { get; set; } = true;
    [JsonPropertyName("previsao")]      public bool Previsao      { get; set; } = true;
    [JsonPropertyName("patrimonio")]    public bool Patrimonio    { get; set; } = true;
    [JsonPropertyName("clientes")]      public bool Clientes      { get; set; } = true;
    [JsonPropertyName("produtos")]      public bool Produtos      { get; set; } = true;
    [JsonPropertyName("lgpd")]          public bool Lgpd          { get; set; } = true;
    [JsonPropertyName("preInscricoes")] public bool PreInscricoes { get; set; } = true;
}

public class DashboardPrefs
{
    [JsonPropertyName("refreshInterval")] public int                   RefreshInterval { get; set; } = 30;
    [JsonPropertyName("chartScheme")]     public string                ChartScheme     { get; set; } = "default";
    [JsonPropertyName("panels")]          public DashboardPanelsPrefs  Panels          { get; set; } = new();
}

/// <summary>Preferências completas do usuário.</summary>
public class UserPreferencesDto
{
    [JsonPropertyName("aiButton")]      public AiButtonPrefs     AiButton      { get; set; } = new();
    [JsonPropertyName("vlibras")]       public VLibrasPrefs      Vlibras       { get; set; } = new();
    [JsonPropertyName("timer")]         public TimerPrefs        Timer         { get; set; } = new();
    [JsonPropertyName("notifications")] public NotificationPrefs Notifications { get; set; } = new();
    [JsonPropertyName("pdv")]           public PdvPrefs          Pdv           { get; set; } = new();
    [JsonPropertyName("dashboard")]     public DashboardPrefs    Dashboard     { get; set; } = new();
}

/// <summary>Request para atualizar preferências (corpo idêntico ao DTO).</summary>
public class UpdatePreferencesRequest : UserPreferencesDto { }

/// <summary>Retorno resumido de um usuário (para listagem admin).</summary>
public class UserSummaryDto
{
    public Guid     Id              { get; set; }
    public string   Name            { get; set; } = string.Empty;
    public string?  Email           { get; set; }
    public string?  Cpf             { get; set; }
    public string?  WhatsApp        { get; set; }
    public string?  ProfileImageUrl { get; set; }
    public string   Role            { get; set; } = string.Empty;
    public Guid?    PerfilId        { get; set; }
    public string?  PerfilNome      { get; set; }
    public int      PointsBalance   { get; set; }
    public DateTime? PointsExpiresAt { get; set; }
    public bool     PointsExpired   { get; set; }
    public int      BalanceInCents  { get; set; }
    public bool     IsActive        { get; set; }
    public DateTime CreatedAt       { get; set; }
}

/// <summary>Perfil completo do cliente logado (retornado em GET /api/user/me).</summary>
public class UserProfileDto
{
    public Guid      Id              { get; set; }
    public string    Name            { get; set; } = string.Empty;
    public string?   Email           { get; set; }
    public string?   Cpf             { get; set; }
    public string?   WhatsApp        { get; set; }
    public string?   ProfileImageUrl { get; set; }
    public string    Role            { get; set; } = string.Empty;
    public int       PointsBalance   { get; set; }
    public DateTime? PointsExpiresAt { get; set; }
    public bool      PointsExpired   { get; set; }
    public int       BalanceInCents  { get; set; }
    public DateTime  CreatedAt       { get; set; }
    public bool      HasPassword     { get; set; }

    /// <summary>Conta completa = tem senha E e-mail. Quick-login cria conta semi-criada
    /// (sem ambos) — o site exige completar no primeiro acesso.</summary>
    public bool      ProfileComplete { get; set; }
}

/// <summary>Request para ajustar saldo monetário de um usuário (Admin).</summary>
public class AdjustBalanceRequest
{
    /// <summary>Valor em centavos. Positivo = crédito (recarga), negativo = débito (uso).</summary>
    [Required]
    public int AmountInCents { get; set; }

    [MaxLength(255)]
    public string? Reason { get; set; }
}

/// <summary>Request para adicionar pontos a um usuário (Admin).</summary>
public class AddPointsRequest
{
    [Required]
    [Range(1, 100000, ErrorMessage = "Quantidade de pontos deve ser entre 1 e 100.000.")]
    public int Points { get; set; }

    [MaxLength(255)]
    public string? Reason { get; set; }  // Motivo (opcional, ex: "Campeonato de Pokémon")
}

/// <summary>
/// Request para o titular corrigir seus próprios dados (LGPD — direito de retificação).
/// Todos os campos são opcionais: apenas os campos fornecidos são atualizados.
/// </summary>
public class UpdateMeRequest
{
    [MaxLength(150)]
    public string? Name { get; set; }

    [EmailAddress]
    [MaxLength(255)]
    public string? Email { get; set; }

    [MaxLength(20)]
    public string? WhatsApp { get; set; }
}

/// <summary>Request para o Admin criar uma conta de cliente ou operador.</summary>
public class AdminCreateUserRequest
{
    [Required]
    [MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    /// <summary>Aceita com ou sem máscara — é gravado só com os dígitos.</summary>
    [MaxLength(14)]
    public string? Cpf { get; set; }

    [MaxLength(20)]
    public string? WhatsApp { get; set; }

    [EmailAddress]
    [MaxLength(255)]
    public string? Email { get; set; }

    /// <summary>Senha inicial (opcional para Customer; obrigatória para Operator).</summary>
    [MinLength(8)]
    [MaxLength(100)]
    public string? Password { get; set; }

    /// <summary>"Customer" (padrão) ou "Operator".</summary>
    [MaxLength(20)]
    public string? Role { get; set; }

    /// <summary>ID do perfil de permissões (somente para Operator).</summary>
    public Guid? PerfilId { get; set; }
}

/// <summary>Request para o Admin redefinir a senha de um cliente.</summary>
public class AdminResetPasswordRequest
{
    [Required]
    [MinLength(8)]
    [MaxLength(100)]
    public string NewPassword { get; set; } = string.Empty;
}

/// <summary>
/// Request para o Admin corrigir os dados de um cliente (nome, e-mail, CPF, WhatsApp).
/// Todos os campos são opcionais: apenas os campos fornecidos são atualizados.
/// </summary>
public class AdminUpdateUserRequest
{
    [MaxLength(150)]
    public string? Name { get; set; }

    [EmailAddress]
    [MaxLength(255)]
    public string? Email { get; set; }

    /// <summary>Aceita com ou sem máscara — é gravado só com os dígitos.</summary>
    [MaxLength(14)]
    public string? Cpf { get; set; }

    [MaxLength(20)]
    public string? WhatsApp { get; set; }
}

public class AtualizarPerfilOperadorRequest
{
    /// <summary>ID do perfil a atribuir, ou null para desatribuir.</summary>
    public Guid? PerfilId { get; set; }
}

// ─── Histórico de cliente ─────────────────────────────────────────────────────

public class ClienteHistoricoDto
{
    public Guid    UserId   { get; set; }
    public string  UserName { get; set; } = string.Empty;

    // Totalizadores
    public int     TotalVisitas     { get; set; }
    public decimal TotalGasto       { get; set; }
    public DateTime? PrimeiraVisita { get; set; }
    public DateTime? UltimaVisita   { get; set; }

    // Paginação de comandas
    public int TotalComandas { get; set; }
    public int Page          { get; set; }
    public int PageSize      { get; set; }

    // Listas
    public List<ComandaHistoricoDto>     Comandas      { get; set; } = new();
    public List<VendaAvulsaHistoricoDto> VendasAvulsas { get; set; } = new();
    public List<CrediariosHistoricoDto>  Crediarios    { get; set; } = new();
    public List<CampeonatoHistoricoDto>  Campeonatos   { get; set; } = new();
}

public class ComandaHistoricoDto
{
    public Guid     Id             { get; set; }
    public string   Status         { get; set; } = string.Empty;
    public decimal  TotalInReais   { get; set; }
    public string?  PaymentMethod  { get; set; }
    public string?  SecondPaymentMethod { get; set; }
    public DateTime OpenedAt       { get; set; }
    public DateTime? ClosedAt      { get; set; }
    public string?  TableIdentifier { get; set; }
    public List<ComandaItemHistoricoDto> Items { get; set; } = new();
}

public class ComandaItemHistoricoDto
{
    public string  ItemName         { get; set; } = string.Empty;
    public int     Quantity         { get; set; }
    public decimal UnitPriceInReais { get; set; }
    public decimal SubtotalInReais  { get; set; }
}

public class VendaAvulsaHistoricoDto
{
    public string   Id            { get; set; } = string.Empty;
    public decimal  TotalInReais  { get; set; }
    public string   PaymentMethod { get; set; } = string.Empty;
    public DateTime SoldAt        { get; set; }
    public List<VendaAvulsaItemHistoricoDto> Items { get; set; } = new();
}

public class VendaAvulsaItemHistoricoDto
{
    public string  ProductName      { get; set; } = string.Empty;
    public int     Quantity         { get; set; }
    public decimal UnitPriceInReais { get; set; }
    public decimal SubtotalInReais  { get; set; }
}

public class CrediariosHistoricoDto
{
    public Guid      Id              { get; set; }
    public decimal   ValorEmReais    { get; set; }
    public decimal   SaldoRestante   { get; set; }
    public string    Status          { get; set; } = string.Empty;
    public bool      Vencido         { get; set; }
    public DateTime  DataAbertura    { get; set; }
    public DateTime  DataVencimento  { get; set; }
    public DateTime? DataPagamento   { get; set; }
    public string?   Observacao      { get; set; }
}

public class CampeonatoHistoricoDto
{
    public Guid     ChampionshipId   { get; set; }
    public string   ChampionshipName { get; set; } = string.Empty;
    public string   Game             { get; set; } = string.Empty;
    public string   Status           { get; set; } = string.Empty;
    public DateTime StartDate        { get; set; }
    public int      PlayerNumber     { get; set; }
    public string?  DeckName         { get; set; }
    public int?     Placement        { get; set; }
    public DateTime RegisteredAt     { get; set; }
}
