namespace AuthService.Application.DTOs.Auth;

public record LoginResponse(
    string AccessToken,
    string RefreshToken,
    DateTime ExpiresAt,
    LoginUserInfo User);

public record LoginUserInfo(
    Guid Id,
    string Email,
    string FirstName,
    string LastName,
    string Role);
