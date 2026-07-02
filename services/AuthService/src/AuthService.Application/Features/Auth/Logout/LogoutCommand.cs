namespace AuthService.Application.Features.Auth.Logout;

using MediatR;

public record LogoutCommand(string RefreshToken) : IRequest<Unit>;
