namespace NotificationService.Application.DTOs.Preference;

public record NotificationPreferenceDto(
    bool EmailEnabled,
    bool PushEnabled,
    bool InAppEnabled,
    bool HighRiskEmailOnly,
    string? FcmDeviceToken);
