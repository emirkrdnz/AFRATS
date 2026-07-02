namespace AuthService.Application.Features.Auth.Login;

using AuthService.Application.DTOs.Auth;
using AuthService.Application.Interfaces;
using AuthService.Application.Interfaces.Repositories;
using AuthService.Application.Interfaces.Services;
using AuthService.Domain.Entities;
using AuthService.Domain.Exceptions;
using MediatR;
using Microsoft.Extensions.Logging;

public class LoginCommandHandler(
    IUserRepository userRepository,
    IRefreshTokenRepository refreshTokenRepository,
    IPasswordHasher passwordHasher,
    ITokenService tokenService,
    IUnitOfWork unitOfWork,
    ILogger<LoginCommandHandler> logger) : IRequestHandler<LoginCommand, LoginResponse>
{
    public async Task<LoginResponse> Handle(LoginCommand request, CancellationToken cancellationToken)
    {
        // IK-01: Validate credentials — generic error message for security (IK from section 7.3)
        var user = await userRepository.GetByEmailAsync(request.Email.Trim().ToLowerInvariant(), cancellationToken);

        if (user is null || !passwordHasher.VerifyPassword(request.Password, user.PasswordHash))
            throw new UnauthorizedException("Invalid credentials.");

        // IK-02: Check if account is active
        if (!user.IsActive)
            throw new ForbiddenException("This account has been deactivated.");

        // IK-03: Generate access + refresh tokens (lifetimes from JwtSettings)
        var roleName = user.Role?.Name ?? "User";
        var accessToken = tokenService.GenerateAccessToken(user, roleName);
        var refreshTokenValue = tokenService.GenerateRefreshToken();

        var now = DateTime.UtcNow;

        // IK-05: Persist refresh token
        var refreshToken = new RefreshToken
        {
            UserId = user.Id,
            Token = refreshTokenValue,
            ExpiresAt = now.Add(tokenService.RefreshTokenLifetime),
            IsRevoked = false,
            CreatedAt = now
        };

        await refreshTokenRepository.AddAsync(refreshToken, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        logger.LogInformation("User logged in successfully: {UserId}", user.Id);

        // IK-04: Return tokens with user info
        return new LoginResponse(
            accessToken,
            refreshTokenValue,
            now.Add(tokenService.AccessTokenLifetime),
            new LoginUserInfo(
                user.Id,
                user.Email,
                user.FirstName,
                user.LastName,
                roleName));
    }
}
