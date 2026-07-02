using Microsoft.EntityFrameworkCore;
using NotificationService.Application.Interfaces.Repositories;
using NotificationService.Domain.Entities;
using NotificationService.Infrastructure.Persistence;

namespace NotificationService.Infrastructure.Persistence.Repositories;

public class NotificationPreferenceRepository(NotificationDbContext context)
    : INotificationPreferenceRepository
{
    public async Task<NotificationPreference?> GetByUserIdAsync(Guid userId, CancellationToken ct = default)
        => await context.NotificationPreferences
            .FirstOrDefaultAsync(p => p.UserId == userId, ct);

    public async Task AddAsync(NotificationPreference preference, CancellationToken ct = default)
        => await context.NotificationPreferences.AddAsync(preference, ct);

    public Task UpdateAsync(NotificationPreference preference, CancellationToken ct = default)
    {
        context.NotificationPreferences.Update(preference);
        return Task.CompletedTask;
    }

    public async Task<bool> ExistsByUserIdAsync(Guid userId, CancellationToken ct = default)
        => await context.NotificationPreferences
            .AnyAsync(p => p.UserId == userId, ct);
}
