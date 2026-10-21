// =============================================================================
// MarcoOperacao.cs — "isto rodou por último em…" pra coisas que rodam FORA da API
//
// O backup (deploy/backup.sh, cron das 3h e antes de todo deploy) roda na VPS e a API
// não enxerga os arquivos dele. No fim, o script grava aqui (chave "backup-diario") e o
// Vigia confere a idade (VerificacaoBackupAtrasado). Uma linha por chave.
// =============================================================================

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

[Table("marcos_operacao")]
public class MarcoOperacao
{
    public const string BackupDiario = "backup-diario";
    /// <summary>Fim do deploy/backup-drive.sh (cópia no Google Drive) — só gravado depois do upload.</summary>
    public const string BackupDrive = "backup-drive";

    [Key, MaxLength(60)] [Column("chave")]
    public string Chave { get; set; } = string.Empty;

    [Column("quando")]
    public DateTime Quando { get; set; } = DateTime.UtcNow;

    [MaxLength(500)] [Column("detalhe")]
    public string? Detalhe { get; set; }
}
