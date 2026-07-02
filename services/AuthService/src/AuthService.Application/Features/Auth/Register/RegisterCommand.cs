namespace AuthService.Application.Features.Auth.Register;

using AuthService.Application.DTOs.Auth;
using MediatR;

public record RegisterCommand(
    string Email,
    string Password,
    string ConfirmPassword,
    string FirstName,
    string LastName,
    string? PhoneNumber) : IRequest<RegisterResponse>;
