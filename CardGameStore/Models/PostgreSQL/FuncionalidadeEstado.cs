// =============================================================================
// FuncionalidadeEstado.cs — chave de funcionalidade mudada à mão pelo dono
//
// Só existe linha pra chave que alguém ligou/desligou em /admin/funcionalidades.
// Sem linha, vale o padrão do catálogo (Configuration/Funcionalidades.cs).
// =============================================================================

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CardGameStore.Models.PostgreSQL;

[Table("funcionalidades")]
public class FuncionalidadeEstado
{
    [Key, MaxLength(60)]
    [Column("codigo")]
    public string Codigo { get; set; } = string.Empty;

    [Column("ligada")]
    public bool Ligada { get; set; }

    [Column("alterada_em")]
    public DateTime AlteradaEm { get; set; } = DateTime.UtcNow;

    [Column("alterada_por_id")]
    public Guid? AlteradaPorId { get; set; }
}
