namespace AuthService.Application.Features.Users.DeleteUser;

using AuthService.Application.Interfaces;
using AuthService.Application.Interfaces.Repositories;
using AuthService.Application.Interfaces.Services;
using AuthService.Domain.Exceptions;
using MediatR;
using Microsoft.Extensions.Logging;

public class DeleteUserCommandHandler(
    IUserRepository userRepository,
    IRefreshTokenRepository refreshTokenRepository,
    ICurrentUserService currentUserService,
    IUnitOfWork unitOfWork,
    ILogger<DeleteUserCommandHandler> logger) : IRequestHandler<DeleteUserCommand, string>
{
    public async Task<string> Handle(DeleteUserCommand request, CancellationToken cancellationToken)
    {
        // Admin cannot delete their own account
        if (request.UserId == currentUserService.UserId)
            throw new BadRequestException("You cannot delete your own account.");

        var user = await userRepository.GetByIdAsync(request.UserId, cancellationToken)
            ?? throw new NotFoundException($"User with ID '{request.UserId}' not found.");

        // Soft delete: mark and deactivate so global query filter hides the row.
        user.IsDeleted = true;
        user.IsActive  = false;
        user.UpdatedAt = DateTime.UtcNow;
        userRepository.Update(user);

        // Revoke refresh tokens — deleted user must not have active sessions.
        await refreshTokenRepository.RevokeAllByUserIdAsync(user.Id, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Admin {AdminId} soft-deleted user {TargetId}",
            currentUserService.UserId, user.Id);

        return "User has been deleted successfully.";
    }
}
