namespace AuthService.Application.DTOs.User;

public record UserDto(
    Guid Id,
    string Email,
    string FirstName,
    string LastName,
    string Role,
    bool IsActive,
    bool EmailConfirmed,
    DateTime CreatedAt);
