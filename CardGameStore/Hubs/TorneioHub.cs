// =============================================================================
// TorneioHub.cs — Tempo real da liguinha (/hubs/torneio)
//
// Aberto pra visitante: o telão da loja mostra a classificação sem login.
// Só avisa "mudou alguma coisa" (TorneioAtualizado) e cada tela busca de novo
// o que mostra — os dados continuam saindo da API, com as regras de acesso dela.
//
// Por que não polling: todo mundo da loja sai pelo mesmo IP, e o limite global
// é por IP (Program.cs). 20 celulares consultando a cada 5 s estouravam o limite.
//
// Grupo: Torneio_{championshipId}
// Evento: TorneioAtualizado { championshipId, motivo }
//   motivo: "rodada" | "partida" | "checkin" | "encerrado" | "timer"
// =============================================================================

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace CardGameStore.Hubs;

[AllowAnonymous]
public class TorneioHub : Hub
{
    public static string Grupo(Guid championshipId) => $"Torneio_{championshipId}";

    public Task Acompanhar(Guid championshipId) =>
        Groups.AddToGroupAsync(Context.ConnectionId, Grupo(championshipId));

    public Task Sair(Guid championshipId) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, Grupo(championshipId));
}
