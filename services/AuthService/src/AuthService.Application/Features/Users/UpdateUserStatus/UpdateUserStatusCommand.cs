namespace AuthService.Application.Features.Users.UpdateUserStatus;

using MediatR;

public record UpdateUserStatusCommand(Guid UserId, bool IsActive) : IRequest<string>;
