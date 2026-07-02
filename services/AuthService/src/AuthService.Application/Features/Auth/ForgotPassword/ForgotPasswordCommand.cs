namespace AuthService.Application.Features.Auth.ForgotPassword;

using MediatR;

public record ForgotPasswordCommand(string Email) : IRequest<Unit>;
