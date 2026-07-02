namespace AuthService.Application.DTOs.Profile;

public record ProfileResponse(
    Guid Id,
    string Email,
    string FirstName,
    string LastName,
    string? PhoneNumber,
    string Role,
    bool IsActive,
    bool EmailConfirmed,
    DateTime CreatedAt,
    DateTime? UpdatedAt);