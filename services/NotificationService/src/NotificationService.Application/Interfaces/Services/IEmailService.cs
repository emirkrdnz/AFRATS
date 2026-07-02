namespace NotificationService.Application.Interfaces.Services;

public interface IEmailService
{
    Task SendHighRiskAlertAsync(
        string toEmail,
        string subject,
        string htmlBody,
        CancellationToken ct = default);
}
