// =============================================================================
// AlertaSistema.cs — o que o Vigia achou (Services/Vigia)
//
// Uma linha por problema ABERTO, identificado pela Chave (código + referência, ex.:
// "pix-pago-pedido-cancelado:<txid>"). A cada volta o Vigia soma ocorrências, resolve
// sozinho o que sumiu, e não recria o que o admin marcou como resolvido (ficou ciente).
// Erros de tela do site também caem aqui (código "erro-tela").
// =============================================================================

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

[Table("alertas_sistema")]
public class AlertaSistema
{
    /// <summary>"sozinho" em ResolvidoPor = o problema sumiu; qualquer outro valor = um admin resolveu.</summary>
    public const string ResolvidoSozinho = "sozinho";

    [Key] [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Tipo do problema (código da verificação), ex.: "estoque-negativo", "erro-tela".</summary>
    [MaxLength(60)] [Column("codigo")]
    public string Codigo { get; set; } = string.Empty;

    /// <summary>Identifica o caso: código + referência. O mesmo caso nunca abre dois alertas.</summary>
    [MaxLength(200)] [Column("chave")]
    public string Chave { get; set; } = string.Empty;

    /// <summary>"info" (só registra), "aviso" ou "critico" (os dois vão pro sininho dos admins).</summary>
    [MaxLength(10)] [Column("gravidade")]
    public string Gravidade { get; set; } = VigiaGravidade.Aviso;

    [MaxLength(200)] [Column("titulo")]
    public string Titulo { get; set; } = string.Empty;

    [MaxLength(2000)] [Column("detalhe")]
    public string Detalhe { get; set; } = string.Empty;

    /// <summary>Tela do admin onde se resolve (ex.: /admin/reservas).</summary>
    [MaxLength(300)] [Column("link")]
    public string? Link { get; set; }

    [Column("ocorrencias")]
    public int Ocorrencias { get; set; } = 1;

    [Column("criado_em")]
    public DateTime CriadoEm { get; set; } = DateTime.UtcNow;

    [Column("ultima_vez_em")]
    public DateTime UltimaVezEm { get; set; } = DateTime.UtcNow;

    [Column("resolvido_em")]
    public DateTime? ResolvidoEm { get; set; }

    [MaxLength(120)] [Column("resolvido_por")]
    public string? ResolvidoPor { get; set; }
}

public static class VigiaGravidade
{
    public const string Info    = "info";
    public const string Aviso   = "aviso";
    public const string Critico = "critico";
}
