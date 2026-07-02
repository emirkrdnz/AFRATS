namespace AuthService.Application.Interfaces.Repositories;

using AuthService.Domain.Entities;

public interface IRefreshTokenRepository
{
    Task<RefreshToken?> GetByTokenAsync(string token, CancellationToken cancellationToken = default);
    Task AddAsync(RefreshToken refreshToken, CancellationToken cancellationToken = default);
    void Update(RefreshToken refreshToken);
    Task RevokeAllByUserIdAsync(Guid userId, CancellationToken cancellationToken = default);
}
