using System.Security.Claims;

namespace NotificationService.API.Extensions;

public static class ClaimsPrincipalExtensions
{
    public static Guid GetUserId(this ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier)
                 ?? user.FindFirstValue("sub");

        return Guid.TryParse(value, out var id) ? id : Guid.Empty;
    }

    public static string GetUserRole(this ClaimsPrincipal user)
        => user.FindFirstValue(ClaimTypes.Role)
        ?? user.FindFirstValue("role")
        ?? string.Empty;

    public static bool IsAdmin(this ClaimsPrincipal user)
        => user.GetUserRole().Equals("Admin", StringComparison.OrdinalIgnoreCase);
}
