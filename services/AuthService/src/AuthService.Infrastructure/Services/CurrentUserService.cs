namespace AuthService.Infrastructure.Services;

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using AuthService.Application.Interfaces.Services;
using Microsoft.AspNetCore.Http;

public class CurrentUserService(IHttpContextAccessor httpContextAccessor) : ICurrentUserService
{
    private ClaimsPrincipal? User => httpContextAccessor.HttpContext?.User;

    public Guid UserId
    {
        get
        {
            var sub = User?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
                      ?? User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            return Guid.TryParse(sub, out var id) ? id : Guid.Empty;
        }
    }

    public string Email =>
        User?.FindFirst(JwtRegisteredClaimNames.Email)?.Value
        ?? User?.FindFirst(ClaimTypes.Email)?.Value
        ?? string.Empty;

    public string Role =>
        User?.FindFirst(ClaimTypes.Role)?.Value ?? string.Empty;
}
