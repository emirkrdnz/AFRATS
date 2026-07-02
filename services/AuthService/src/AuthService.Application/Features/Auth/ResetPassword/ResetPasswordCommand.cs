namespace AuthService.Application.Features.Auth.ResetPassword;

using MediatR;

public record ResetPasswordCommand(
    string Token,
    string NewPassword,
    string ConfirmNewPassword) : IRequest<string>;
