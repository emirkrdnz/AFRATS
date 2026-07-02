namespace AuthService.Application.Features.Auth.ConfirmEmail;

using MediatR;

public record ConfirmEmailCommand(string Token) : IRequest<string>;
