using NotificationService.Application.DTOs.Common;
using NotificationService.Domain.Entities;
using NotificationService.Domain.Enums;

namespace NotificationService.Application.Interfaces.Repositories;

public interface INotificationRepository
{
    Task<Notification?> GetByIdAsync(Guid id, Guid userId, CancellationToken ct = default);
    Task<PagedResult<Notification>> GetPagedAsync(Guid userId, bool? isRead, int page, int pageSize, CancellationToken ct = default);
    Task<int> GetUnreadCountAsync(Guid userId, CancellationToken ct = default);
    Task AddAsync(Notification notification, CancellationToken ct = default);
    Task UpdateAsync(Notification notification, CancellationToken ct = default);
    Task<int> MarkAllAsReadAsync(Guid userId, CancellationToken ct = default);
    Task<bool> ExistsByRelatedIdAndTypeAsync(Guid userId, Guid relatedId, NotificationType type, NotificationChannel channel, CancellationToken ct = default);

    // Smart dedup — son `within` süresi içinde aynı (UserId, DedupKey)
    // pair'inde notification var mı? Aynı sinyalin (ör. "risk:High") kısa
    // sürede tekrar tekrar bildirim üretmesini engeller.
    Task<bool> ExistsRecentByDedupKeyAsync(Guid userId, string dedupKey, TimeSpan within, CancellationToken ct = default);
}