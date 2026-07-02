using Microsoft.EntityFrameworkCore;
using NotificationService.Application.DTOs.Common;
using NotificationService.Application.Interfaces.Repositories;
using NotificationService.Domain.Entities;
using NotificationService.Domain.Enums;
using NotificationService.Infrastructure.Persistence;

namespace NotificationService.Infrastructure.Persistence.Repositories;

public class NotificationRepository(NotificationDbContext context) : INotificationRepository
{
    public async Task<Notification?> GetByIdAsync(Guid id, Guid userId, CancellationToken ct = default)
        => await context.Notifications
            .FirstOrDefaultAsync(n => n.Id == id && n.UserId == userId, ct);

    public async Task<PagedResult<Notification>> GetPagedAsync(
        Guid userId,
        bool? isRead,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var query = context.Notifications
            .Where(n => n.UserId == userId && n.Channel == NotificationChannel.InApp);

        if (isRead.HasValue)
            query = query.Where(n => n.IsRead == isRead.Value);

        var totalCount = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(n => n.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new PagedResult<Notification>(items, totalCount, page, pageSize);
    }

    public async Task<int> GetUnreadCountAsync(Guid userId, CancellationToken ct = default)
        => await context.Notifications
            .CountAsync(n => n.UserId == userId
                          && n.Channel == NotificationChannel.InApp
                          && !n.IsRead, ct);

    public async Task AddAsync(Notification notification, CancellationToken ct = default)
        => await context.Notifications.AddAsync(notification, ct);

    public Task UpdateAsync(Notification notification, CancellationToken ct = default)
    {
        context.Notifications.Update(notification);
        return Task.CompletedTask;
    }

    public async Task<int> MarkAllAsReadAsync(Guid userId, CancellationToken ct = default)
        => await context.Notifications
            .Where(n => n.UserId == userId
                     && n.Channel == NotificationChannel.InApp
                     && !n.IsRead)
            .ExecuteUpdateAsync(s => s
                .SetProperty(n => n.IsRead, true)
                .SetProperty(n => n.ReadAt, DateTime.UtcNow), ct);

    public async Task<bool> ExistsByRelatedIdAndTypeAsync(
    Guid userId,
    Guid relatedId,
    NotificationType type,
    NotificationChannel channel,
    CancellationToken ct = default)
    {
        var typeStr = type.ToString();
        var channelStr = channel.ToString();

        return await context.Notifications
            .IgnoreQueryFilters()
            .AnyAsync(n => n.UserId == userId
                        && n.RelatedId == relatedId
                        && n.Type.ToString() == typeStr
                        && n.Channel.ToString() == channelStr
                        && !n.IsDeleted, ct);
    }

    // Smart dedup query — son `within` window içinde aynı sinyal var mı?
    // IX_Notifications_UserId_DedupKey_CreatedAt index'i tarafından servis
    // edilir; soft-deleted'leri de dahil et (silinmiş bile olsa "yakın
    // zamanda gönderildi" sayılmalı, yeniden spam'lemesin).
    public async Task<bool> ExistsRecentByDedupKeyAsync(
        Guid userId,
        string dedupKey,
        TimeSpan within,
        CancellationToken ct = default)
    {
        var threshold = DateTime.UtcNow - within;
        return await context.Notifications
            .IgnoreQueryFilters()
            .AnyAsync(n => n.UserId == userId
                        && n.DedupKey == dedupKey
                        && n.CreatedAt >= threshold, ct);
    }
}