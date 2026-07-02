namespace AuthService.Application.Interfaces.Repositories;

using AuthService.Domain.Entities;

public interface IUserRepository
{
    Task<User?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<User?> GetByEmailAsync(string email, CancellationToken cancellationToken = default);
    Task<(IReadOnlyList<User> Items, int TotalCount)> GetAllAsync(
        int page,
        int pageSize,
        bool? isActive = null,
        string? role = null,
        string? searchTerm = null,
        CancellationToken cancellationToken = default);
    Task<bool> ExistsByEmailAsync(string email, CancellationToken cancellationToken = default);
    Task AddAsync(User user, CancellationToken cancellationToken = default);
    void Update(User user);
    Task<User?> GetByIdIncludingDeletedAsync(Guid id, CancellationToken cancellationToken = default);
}
