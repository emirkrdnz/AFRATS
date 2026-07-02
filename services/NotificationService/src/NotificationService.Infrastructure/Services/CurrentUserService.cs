using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using NotificationService.Application.Interfaces.Services;

namespace NotificationService.Infrastructure.Services;

public class CurrentUserService(IHttpContextAccessor httpContextAccessor) : ICurrentUserService
{
    private ClaimsPrincipal? User => httpContextAccessor.HttpContext?.User;

    public Guid UserId
    {
        get
        {
            var value = User?.FindFirstValue(ClaimTypes.NameIdentifier)
                     ?? User?.FindFirstValue("sub");

            return Guid.TryParse(value, out var id)
                ? id
                : Guid.Empty;
        }
    }

    public string Role
        => User?.FindFirstValue(ClaimTypes.Role)
        ?? User?.FindFirstValue("role")
        ?? string.Empty;

    // JWT'den email claim'i. AuthService token'a "email" ya da
    // ClaimTypes.Email koyar; ikisini de dene.
    public string Email
        => User?.FindFirstValue(ClaimTypes.Email)
        ?? User?.FindFirstValue("email")
        ?? string.Empty;

    public bool IsAuthenticated
        => User?.Identity?.IsAuthenticated ?? false;
}
