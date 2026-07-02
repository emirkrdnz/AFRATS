namespace AuthService.Application.Features.Users.DeleteUser;

using MediatR;

/// <summary>
/// Soft delete a user account (sets IsDeleted=true + IsActive=false).
/// Hard delete is intentionally NOT supported — audit trail preserved.
/// </summary>
public record DeleteUserCommand(Guid UserId) : IRequest<string>;
