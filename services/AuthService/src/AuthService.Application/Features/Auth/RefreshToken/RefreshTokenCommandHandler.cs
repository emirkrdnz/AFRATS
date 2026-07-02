namespace AuthService.Application.Features.Auth.RefreshToken;

using AuthService.Application.DTOs.Auth;
using AuthService.Application.Interfaces;
using AuthService.Application.Interfaces.Repositories;
using AuthService.Application.Interfaces.Services;
using AuthService.Domain.Exceptions;
using MediatR;
using Microsoft.Extensions.Logging;

public class RefreshTokenCommandHandler(
    IRefreshTokenRepository refreshTokenRepository,
    IUserRepository userRepository,
    ITokenService tokenService,
    IUnitOfWork unitOfWork,
    ILogger<RefreshTokenCommandHandler> logger) : IRequestHandler<RefreshTokenCommand, TokenResponse>
{
    public async Task<TokenResponse> Handle(RefreshTokenCommand request, CancellationToken cancellationToken)
    {
        var existingToken = await refreshTokenRepository.GetByTokenAsync(request.RefreshToken, cancellationToken);

        if (existingToken is null)
            throw new UnauthorizedException("Invalid refresh token.");

        // IK-06: Replay attack protection — revoked token reuse revokes ALL user tokens
        if (existingToken.IsRevoked)
        {
            logger.LogWarning("Replay attack detected: {UserId}, revoking all tokens", existingToken.UserId);
            await refreshTokenRepository.RevokeAllByUserIdAsync(existingToken.UserId, cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            throw new UnauthorizedException("Invalid refresh token.");
        }

        // IK-02: Token must not be expired
        if (existingToken.IsExpired)
            throw new UnauthorizedException("Refresh token has expired.");

        // IK-05: User must be active
        var user = await userRepository.GetByIdAsync(existingToken.UserId, cancellationToken)
            ?? throw new UnauthorizedException("Invalid refresh token.");

        if (!user.IsActive)
            throw new ForbiddenException("This account has been deactivated.");

        // IK-04: Revoke old token (token rotation)
        existingToken.IsRevoked = true;
        existingToken.RevokedAt = DateTime.UtcNow;
        refreshTokenRepository.Update(existingToken);

        // IK-03: Generate new token pair (lifetimes from JwtSettings)
        var roleName = user.Role?.Name ?? "User";
        var newAccessToken = tokenService.GenerateAccessToken(user, roleName);
        var newRefreshTokenValue = tokenService.GenerateRefreshToken();

        var now = DateTime.UtcNow;

        var newRefreshToken = new Domain.Entities.RefreshToken
        {
            UserId = user.Id,
            Token = newRefreshTokenValue,
            ExpiresAt = now.Add(tokenService.RefreshTokenLifetime),
            IsRevoked = false,
            CreatedAt = now
        };

        await refreshTokenRepository.AddAsync(newRefreshToken, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Token refreshed: {UserId}", user.Id);

        return new TokenResponse(
            newAccessToken,
            newRefreshTokenValue,
            now.Add(tokenService.AccessTokenLifetime));
    }
}
