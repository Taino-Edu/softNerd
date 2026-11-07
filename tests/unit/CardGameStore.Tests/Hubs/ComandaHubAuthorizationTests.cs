using System.Reflection;
using CardGameStore.Hubs;
using Microsoft.AspNetCore.Authorization;

namespace CardGameStore.Tests.Hubs;

public class ComandaHubAuthorizationTests
{
    [Theory]
    [InlineData("Admin")]
    [InlineData("Operator")]
    public void PerfilAdministrativo_DeveReceberEventosDoDashboard(string role)
    {
        ComandaHub.CanReceiveAdminEvents(role).Should().BeTrue();
    }

    [Theory]
    [InlineData("Customer")]
    [InlineData("")]
    public void PerfilNaoAdministrativo_NaoDeveReceberEventosDoDashboard(string role)
    {
        ComandaHub.CanReceiveAdminEvents(role).Should().BeFalse();
    }

    [Theory]
    [InlineData(nameof(ComandaHub.CloseComanda))]
    [InlineData(nameof(ComandaHub.AdminAddItemToComanda))]
    public void OperacoesAdministrativasDoHub_DevemAceitarAdminEOperator(string methodName)
    {
        var method = typeof(ComandaHub).GetMethod(methodName, BindingFlags.Instance | BindingFlags.Public);
        var authorize = method!.GetCustomAttribute<AuthorizeAttribute>();

        authorize.Should().NotBeNull();
        authorize!.Roles.Should().Be("Admin,Operator");
    }
}
