namespace AuthService.Application.Features.Auth.RefreshToken;

using AuthService.Application.DTOs.Auth;
using MediatR;

public record RefreshTokenCommand(string RefreshToken) : IRequest<TokenResponse>;
