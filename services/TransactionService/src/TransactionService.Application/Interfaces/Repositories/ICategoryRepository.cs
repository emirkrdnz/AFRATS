namespace TransactionService.Application.Interfaces.Repositories;

using TransactionService.Domain.Entities;
using TransactionService.Domain.Enums;

public interface ICategoryRepository
{
    Task<Category?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<List<Category>> GetAllByUserAsync(Guid userId, TransactionType? type = null, CancellationToken cancellationToken = default);
    Task<bool> ExistsForUserAsync(Guid id, Guid userId, CancellationToken cancellationToken = default);
    Task<bool> NameExistsAsync(Guid userId, string name, TransactionType type, CancellationToken cancellationToken = default);
    Task AddAsync(Category category, CancellationToken cancellationToken = default);
}
