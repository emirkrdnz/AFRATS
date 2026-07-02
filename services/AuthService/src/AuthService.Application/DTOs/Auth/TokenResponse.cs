namespace AuthService.Application.DTOs.Auth;

public record TokenResponse(
    string AccessToken,
    string RefreshToken,
    DateTime ExpiresAt);
