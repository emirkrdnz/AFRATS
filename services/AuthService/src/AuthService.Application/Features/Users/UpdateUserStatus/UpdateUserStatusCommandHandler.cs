namespace AuthService.Application.Features.Users.UpdateUserStatus;

using AuthService.Application.Interfaces;
using AuthService.Application.Interfaces.Repositories;
using AuthService.Application.Interfaces.Services;
using AuthService.Domain.Exceptions;
using MediatR;
using Microsoft.Extensions.Logging;

public class UpdateUserStatusCommandHandler(
    IUserRepository userRepository,
    IRefreshTokenRepository refreshTokenRepository,
    ICurrentUserService currentUserService,
    IUnitOfWork unitOfWork,
    ILogger<UpdateUserStatusCommandHandler> logger) : IRequestHandler<UpdateUserStatusCommand, string>
{
    public async Task<string> Handle(UpdateUserStatusCommand request, CancellationToken cancellationToken)
    {
        // IK-02: Admin cannot deactivate their own account
        if (request.UserId == currentUserService.UserId && !request.IsActive)
            throw new BadRequestException("You cannot deactivate your own account.");

        var user = await userRepository.GetByIdAsync(request.UserId, cancellationToken)
            ?? throw new NotFoundException($"User with ID '{request.UserId}' not found.");

        user.IsActive = request.IsActive;
        user.UpdatedAt = DateTime.UtcNow;
        userRepository.Update(user);

        // IK-03: Revoke all refresh tokens when deactivating
        if (!request.IsActive)
            await refreshTokenRepository.RevokeAllByUserIdAsync(user.Id, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);

        var status = request.IsActive ? "activated" : "deactivated";
        logger.LogInformation(
            "Admin {AdminId} changed user {TargetId} status to {NewStatus}",
            currentUserService.UserId, user.Id, status);

        return $"User has been {status} successfully.";
    }
}
