namespace AuthService.Application.Features.Auth.Login;

using AuthService.Application.DTOs.Auth;
using MediatR;

public record LoginCommand(
    string Email,
    string Password) : IRequest<LoginResponse>;
