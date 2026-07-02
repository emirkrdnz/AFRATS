namespace TransactionService.Infrastructure.Persistence;

using TransactionService.Application.Interfaces;

public class UnitOfWork(TransactionDbContext context) : IUnitOfWork
{
    public async Task<int> SaveChangesAsync(CancellationToken cancellationToken)
    {
        return await context.SaveChangesAsync(cancellationToken);
    }
}
