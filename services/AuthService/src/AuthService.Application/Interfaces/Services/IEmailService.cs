namespace AuthService.Application.Interfaces.Services;

public interface IEmailService
{
    Task SendEmailConfirmationAsync(string toEmail, string token, CancellationToken cancellationToken = default);
    Task SendPasswordResetAsync(string toEmail, string token, CancellationToken cancellationToken = default);
}
