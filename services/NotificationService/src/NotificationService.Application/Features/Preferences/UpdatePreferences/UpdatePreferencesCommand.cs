using MediatR;
using NotificationService.Application.DTOs.Preference;

namespace NotificationService.Application.Features.Preferences.UpdatePreferences;

public record UpdatePreferencesCommand(
    bool? EmailEnabled,
    bool? PushEnabled,
    bool? InAppEnabled,
    bool? HighRiskEmailOnly,
    string? FcmDeviceToken) : IRequest<NotificationPreferenceDto>;
