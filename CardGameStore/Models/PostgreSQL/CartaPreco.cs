// =============================================================================
// CartaPreco.cs — preço de referência das cartas avulsas (v1.92.0, chave "preco-referencia-cartas")
//
// CartaPrecoHistorico: uma linha por carta por dia (calendário de Brasília) com o preço de mercado
//   em dólar, a cotação usada e a referência em reais. É daqui que sai a variação de 7 e 30 dias.
//   Sem FK de propósito, como estoque_movimentos: o histórico sobrevive à exclusão do produto.
// CartaRegraPreco: a regra da loja pra sugerir o preço de venda a partir da referência
//   (ex.: 90% da referência, arredondado pra cima em R$ 0,50, nunca abaixo de R$ 1,00). Uma linha só.
// =============================================================================

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace CardGameStore.Models.PostgreSQL;

[Table("carta_preco_historico")]
[Index(nameof(ProductId), nameof(Dia), IsUnique = true)]
public class CartaPrecoHistorico
{
    [Key] [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("product_id")]
    public Guid ProductId { get; set; }

    /// <summary>Dia no calendário de Brasília, gravado como meia-noite UTC daquela data.</summary>
    [Column("dia")]
    public DateTime Dia { get; set; }

    [Column("mercado_usd")]
    public decimal MercadoUsd { get; set; }

    [Column("cotacao")]
    public decimal Cotacao { get; set; }

    [Column("referencia_centavos")]
    public int ReferenciaCentavos { get; set; }

    [Column("criado_em")]
    public DateTime CriadoEm { get; set; } = DateTime.UtcNow;
}

[Table("carta_regra_preco")]
public class CartaRegraPreco
{
    public const int IdUnico = 1;

    [Key] [Column("id")] [DatabaseGenerated(DatabaseGeneratedOption.None)]
    public int Id { get; set; } = IdUnico;

    /// <summary>Quanto da referência vira preço de venda: 100 = igual à referência, 90 = 10% abaixo.</summary>
    [Column("fator_percent")]
    public decimal FatorPercent { get; set; } = 100m;

    /// <summary>Arredonda pra cima neste múltiplo (centavos): 1 = centavo, 50 = R$ 0,50, 100 = R$ 1,00.</summary>
    [Column("arredondar_centavos")]
    public int ArredondarCentavos { get; set; } = 50;

    /// <summary>Preço mínimo de venda (centavos) — carta de R$ 0,30 lá fora não sai por R$ 0,30 aqui.</summary>
    [Column("minimo_centavos")]
    public int MinimoCentavos { get; set; } = 100;

    [Column("atualizada_em")]
    public DateTime AtualizadaEm { get; set; } = DateTime.UtcNow;
}
