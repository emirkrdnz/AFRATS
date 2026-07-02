namespace AuthService.Application.Interfaces.Services;

using AuthService.Domain.Entities;

public interface ITokenService
{
    TimeSpan AccessTokenLifetime { get; }
    TimeSpan RefreshTokenLifetime { get; }

    string GenerateAccessToken(User user, string roleName);
    string GenerateRefreshToken();
    string GenerateEmailConfirmationToken(Guid userId);
    string GeneratePasswordResetToken(Guid userId);
    Guid? ValidateEmailConfirmationToken(string token);
    Guid? ValidatePasswordResetToken(string token);
}
