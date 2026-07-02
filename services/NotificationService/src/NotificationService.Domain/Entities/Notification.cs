using NotificationService.Domain.Common;
using NotificationService.Domain.Enums;

namespace NotificationService.Domain.Entities;

public class Notification : BaseEntity
{
    public Guid UserId { get; set; }
    public NotificationType Type { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public bool IsRead { get; set; } = false;
    public NotificationChannel Channel { get; set; }
    public Guid? RelatedId { get; set; }
    public DateTime? ReadAt { get; set; }

    // Smart dedup — aynı sinyalin kısa süre içinde tekrar etmesini engeller.
    // Örn. HighRisk "risk:High" → user High band'a girdiyse 60 dk içinde
    // tekrar HighRisk alert üretilmez (5 tx → 5 notification spam'i çözer).
    // Format: "{signal}:{discriminator}" (ör. "risk:High"). AnomalyAlert için
    // null bırakılır (her tx zaten unique). Repository ExistsRecentByDedupKey
    // ile lookup yapar.
    public string? DedupKey { get; set; }
}