namespace AuthService.Infrastructure.Persistence;

using AuthService.Application.Interfaces;

public class UnitOfWork(AuthDbContext context) : IUnitOfWork
{
    public async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        return await context.SaveChangesAsync(cancellationToken);
    }
}
