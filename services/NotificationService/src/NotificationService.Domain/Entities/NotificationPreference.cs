using NotificationService.Domain.Common;

namespace NotificationService.Domain.Entities;

public class NotificationPreference : BaseEntity
{
    public Guid UserId { get; set; }
    public bool EmailEnabled { get; set; } = true;
    public bool PushEnabled { get; set; } = true;
    public bool InAppEnabled { get; set; } = true;
    public bool HighRiskEmailOnly { get; set; } = false;
    public string? FcmDeviceToken { get; set; }
    public DateTime? UpdatedAt { get; set; }

    // Email — user'ın aldığı email adresi. AuthService DB'sinde duran ground
    // truth burada cache'lenir; HighRisk handler email gönderirken bunu
    // okur. ICurrentUserService.Email JWT claim'inden, preference açılınca
    // veya update edilince sync edilir. Cross-service HTTP call alternatifi
    // yerine bu cache yaklaşımı: tek query, network-free.
    public string? Email { get; set; }
}