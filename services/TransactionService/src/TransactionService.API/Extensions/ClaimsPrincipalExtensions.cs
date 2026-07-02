namespace TransactionService.API.Extensions;

using System.Security.Claims;

public static class ClaimsPrincipalExtensions
{
    public static Guid GetUserId(this ClaimsPrincipal user)
    {
        var userIdClaim = user.FindFirst(ClaimTypes.NameIdentifier)
                       ?? user.FindFirst("sub");

        if (userIdClaim is null || !Guid.TryParse(userIdClaim.Value, out var userId))
            throw new UnauthorizedAccessException("User ID claim not found in token.");

        return userId;
    }

    public static string GetUserRole(this ClaimsPrincipal user)
    {
        return user.FindFirst(ClaimTypes.Role)?.Value
            ?? user.FindFirst("role")?.Value
            ?? "User";
    }

    public static bool IsAdmin(this ClaimsPrincipal user)
    {
        return user.GetUserRole().Equals("Admin", StringComparison.OrdinalIgnoreCase);
    }
}
