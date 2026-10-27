namespace CardGameStore.Common;

/// <summary>
/// Quem está pedindo a ação. O controller monta a partir dos claims do login e passa pro serviço —
/// regra de negócio não lê User nem HttpContext.
/// </summary>
public sealed record Ator(Guid Id, string Nome, bool EhAdmin);
