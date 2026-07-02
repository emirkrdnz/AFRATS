namespace TransactionService.Infrastructure.Persistence.Repositories;

using Microsoft.EntityFrameworkCore;
using TransactionService.Application.Interfaces.Repositories;
using TransactionService.Domain.Entities;
using TransactionService.Domain.Enums;

public class CategoryRepository(TransactionDbContext context) : ICategoryRepository
{
    public async Task<Category?> GetByIdAsync(Guid id, CancellationToken cancellationToken)
    {
        return await context.Categories
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);
    }

    public async Task<List<Category>> GetAllByUserAsync(Guid userId, TransactionType? type, CancellationToken cancellationToken)
    {
        // IK-01/02: System categories (UserId == null) + user's own categories
        var query = context.Categories
            .Where(c => c.IsSystem || c.UserId == userId);

        if (type.HasValue)
            query = query.Where(c => c.Type == type.Value);

        return await query
            .OrderBy(c => c.IsSystem ? 0 : 1)
            .ThenBy(c => c.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<bool> ExistsForUserAsync(Guid id, Guid userId, CancellationToken cancellationToken)
    {
        // Category is accessible if it's a system category OR belongs to the user
        return await context.Categories
            .AnyAsync(c => c.Id == id && (c.IsSystem || c.UserId == userId), cancellationToken);
    }

    public async Task<bool> NameExistsAsync(Guid userId, string name, TransactionType type, CancellationToken cancellationToken)
    {
        // IK-02: Unique per user + type. System categories are a different scope (IK-03)
        return await context.Categories
            .AnyAsync(c => c.UserId == userId
                        && c.Type == type
                        && c.Name.ToLower() == name.ToLower(), cancellationToken);
    }

    public async Task AddAsync(Category category, CancellationToken cancellationToken)
    {
        await context.Categories.AddAsync(category, cancellationToken);
    }
}
