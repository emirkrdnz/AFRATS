namespace AuthService.Application.DTOs.Auth;

public record RegisterResponse(
    Guid Id,
    string Email,
    string FirstName,
    string LastName,
    string Message);
