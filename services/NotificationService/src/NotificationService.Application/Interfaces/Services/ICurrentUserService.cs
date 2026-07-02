namespace NotificationService.Application.Interfaces.Services;

public interface ICurrentUserService
{
    Guid UserId { get; }
    string Role { get; }
    // JWT'den okunan email — preference cache'lemek için. HighRisk handler
    // email gönderirken NotificationPreference.Email'i okur; o değer ilk
    // preference touch'unda buradan sync edilir.
    string Email { get; }
    bool IsAuthenticated { get; }
}
