namespace AuthService.Application.Features.Auth.Logout;

using AuthService.Application.Interfaces;
using AuthService.Application.Interfaces.Repositories;
using AuthService.Application.Interfaces.Services;
using MediatR;
using Microsoft.Extensions.Logging;

public class LogoutCommandHandler(
    IRefreshTokenRepository refreshTokenRepository,
    ICurrentUserService currentUserService,
    IUnitOfWork unitOfWork,
    ILogger<LogoutCommandHandler> logger) : IRequestHandler<LogoutCommand, Unit>
{
    public async Task<Unit> Handle(LogoutCommand request, CancellationToken cancellationToken)
    {
        var token = await refreshTokenRepository.GetByTokenAsync(request.RefreshToken, cancellationToken);

        // Ownership guard: only revoke if the token belongs to the authenticated caller.
        // Silently no-op otherwise — IK-04 contract is "always return 204".
        if (token is not null && !token.IsRevoked && token.UserId == currentUserService.UserId)
        {
            token.IsRevoked = true;
            token.RevokedAt = DateTime.UtcNow;
            refreshTokenRepository.Update(token);
            await unitOfWork.SaveChangesAsync(cancellationToken);

            logger.LogInformation("User logged out, token revoked: {UserId}", token.UserId);
        }

        // IK-04: Always return success (204) regardless of token validity
        return Unit.Value;
    }
}
