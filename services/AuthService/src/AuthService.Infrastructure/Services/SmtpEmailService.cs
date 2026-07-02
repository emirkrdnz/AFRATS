namespace AuthService.Infrastructure.Services;

using AuthService.Application.Interfaces.Services;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;

public class SmtpEmailService(
    IOptions<SmtpSettings> smtpOptions,
    ILogger<SmtpEmailService> logger) : IEmailService
{
    private readonly SmtpSettings _smtp = smtpOptions.Value;

    public async Task SendEmailConfirmationAsync(
        string toEmail, string token, CancellationToken cancellationToken = default)
    {
        var confirmUrl = $"{_smtp.EmailConfirmationUrl}?token={Uri.EscapeDataString(token)}";

        var body = $"""
            <h2>AFRATS - Email Confirmation</h2>
            <p>Please click the link below to confirm your email address:</p>
            <p><a href="{confirmUrl}">Confirm Email</a></p>
            <p>This link will expire in 24 hours.</p>
            """;

        await SendAsync(toEmail, "AFRATS - Confirm Your Email", body, cancellationToken);
    }

    public async Task SendPasswordResetAsync(
        string toEmail, string token, CancellationToken cancellationToken = default)
    {
        var resetUrl = $"{_smtp.PasswordResetUrl}?token={Uri.EscapeDataString(token)}";

        var body = $"""
            <h2>AFRATS - Password Reset</h2>
            <p>You requested a password reset. Click the link below:</p>
            <p><a href="{resetUrl}">Reset Password</a></p>
            <p>This link will expire in 1 hour. If you did not request this, please ignore this email.</p>
            """;

        await SendAsync(toEmail, "AFRATS - Reset Your Password", body, cancellationToken);
    }

    private async Task SendAsync(
        string toEmail, string subject, string htmlBody, CancellationToken cancellationToken)
    {
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(_smtp.FromName, _smtp.FromEmail));
        message.To.Add(MailboxAddress.Parse(toEmail));
        message.Subject = subject;

        message.Body = new TextPart("html") { Text = htmlBody };

        using var client = new SmtpClient();

        await client.ConnectAsync(_smtp.Host, _smtp.Port, SecureSocketOptions.StartTls, cancellationToken);
        await client.AuthenticateAsync(_smtp.Username, _smtp.Password, cancellationToken);
        await client.SendAsync(message, cancellationToken);
        await client.DisconnectAsync(true, cancellationToken);

        logger.LogInformation("Email sent to {Email}: {Subject}", toEmail, subject);
    }
}
