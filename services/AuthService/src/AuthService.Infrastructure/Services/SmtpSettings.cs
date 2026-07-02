namespace AuthService.Infrastructure.Services;

public class SmtpSettings
{
    public const string SectionName = "SmtpSettings";

    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 587;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string FromEmail { get; set; } = "noreply@afrats.com";
    public string FromName { get; set; } = "AFRATS";

    // Confirm-email URL is a backend route (token is consumed by AuthService).
    public string EmailConfirmationUrl { get; set; } = "http://localhost:5000/api/auth/confirm-email";

    // Password-reset URL is a frontend route (user enters new password in the SPA).
    public string PasswordResetUrl { get; set; } = "http://localhost:3000/reset-password";
}
