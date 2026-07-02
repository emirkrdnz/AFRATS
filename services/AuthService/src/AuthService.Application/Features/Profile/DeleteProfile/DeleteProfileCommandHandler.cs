namespace AuthService.Application.Features.Profile.DeleteProfile;

using AuthService.Application.Interfaces;
using AuthService.Application.Interfaces.Repositories;
using AuthService.Application.Interfaces.Services;
using AuthService.Domain.Exceptions;
using MediatR;
using Microsoft.Extensions.Logging;

public class DeleteProfileCommandHandler(
    IUserRepository userRepository,
    IRefreshTokenRepository refreshTokenRepository,
    ICurrentUserService currentUserService,
    IUnitOfWork unitOfWork,
    ILogger<DeleteProfileCommandHandler> logger) : IRequestHandler<DeleteProfileCommand, Unit>
{
    public async Task<Unit> Handle(DeleteProfileCommand request, CancellationToken cancellationToken)
    {
        var user = await userRepository.GetByIdAsync(currentUserService.UserId, cancellationToken)
            ?? throw new NotFoundException("User not found.");

        // Admin self-delete is blocked at the API layer. The UI hides Danger
        // Zone for admins, but a hand-rolled DELETE /auth/profile would still
        // soft-delete the only admin account and lock everyone out of the
        // admin surface. Role is required to be loaded by GetByIdAsync.
        if (string.Equals(user.Role?.Name, "Admin", StringComparison.Ordinal))
        {
            throw new ForbiddenException("Admin accounts cannot be deleted via self-service.");
        }

        user.IsDeleted = true;
        user.IsActive = false;
        user.UpdatedAt = DateTime.UtcNow;
        userRepository.Update(user);

        await refreshTokenRepository.RevokeAllByUserIdAsync(user.Id, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);

        logger.LogInformation("User soft-deleted, all tokens revoked: {UserId}", user.Id);

        return Unit.Value;
    }
}