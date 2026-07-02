namespace AuthService.Application.Features.Auth.ChangePassword;

using MediatR;

public record ChangePasswordCommand(
    string CurrentPassword,
    string NewPassword) : IRequest<string>;