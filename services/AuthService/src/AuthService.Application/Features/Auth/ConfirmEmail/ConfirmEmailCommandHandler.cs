namespace AuthService.Application.Features.Auth.ConfirmEmail;

using AuthService.Application.Interfaces;
using AuthService.Application.Interfaces.Repositories;
using AuthService.Application.Interfaces.Services;
using AuthService.Domain.Exceptions;
using MediatR;
using Microsoft.Extensions.Logging;

public class ConfirmEmailCommandHandler(
    IUserRepository userRepository,
    ITokenService tokenService,
    IUnitOfWork unitOfWork,
    ILogger<ConfirmEmailCommandHandler> logger) : IRequestHandler<ConfirmEmailCommand, string>
{
    public async Task<string> Handle(ConfirmEmailCommand request, CancellationToken cancellationToken)
    {
        // IK-01 & IK-02: Validate token and extract userId
        var userId = tokenService.ValidateEmailConfirmationToken(request.Token)
            ?? throw new BadRequestException("Invalid or expired email confirmation token.");

        var user = await userRepository.GetByIdAsync(userId, cancellationToken)
            ?? throw new NotFoundException("User not found.");

        // IK-05: Idempotent — already confirmed is still success
        if (user.EmailConfirmed)
            return "Email already confirmed.";

        // IK-03: Confirm email
        user.EmailConfirmed = true;
        user.UpdatedAt = DateTime.UtcNow;
        userRepository.Update(user);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Email confirmed: {UserId}", user.Id);

        return "Email confirmed successfully.";
    }
}
