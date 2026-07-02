namespace AuthService.Application.Features.Auth.ForgotPassword;

using AuthService.Application.Interfaces.Repositories;
using AuthService.Application.Interfaces.Services;
using MediatR;
using Microsoft.Extensions.Logging;

public class ForgotPasswordCommandHandler(
    IUserRepository userRepository,
    ITokenService tokenService,
    IEmailService emailService,
    ILogger<ForgotPasswordCommandHandler> logger) : IRequestHandler<ForgotPasswordCommand, Unit>
{
    public async Task<Unit> Handle(ForgotPasswordCommand request, CancellationToken cancellationToken)
    {
        // IK-03: Always return 200 OK regardless of email existence (prevents email discovery)
        var user = await userRepository.GetByEmailAsync(request.Email.Trim().ToLowerInvariant(), cancellationToken);

        if (user is null)
            return Unit.Value;

        try
        {
            // IK-02 & IK-04: Generate reset token (1 hour validity)
            var resetToken = tokenService.GeneratePasswordResetToken(user.Id);
            await emailService.SendPasswordResetAsync(user.Email, resetToken, cancellationToken);

            logger.LogInformation("Password reset email sent: {UserId}", user.Id);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to send password reset email to {Email}", user.Email);
        }

        return Unit.Value;
    }
}
