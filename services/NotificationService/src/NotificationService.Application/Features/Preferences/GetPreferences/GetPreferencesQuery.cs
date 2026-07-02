using MediatR;
using NotificationService.Application.DTOs.Preference;

namespace NotificationService.Application.Features.Preferences.GetPreferences;

public record GetPreferencesQuery : IRequest<NotificationPreferenceDto>;
