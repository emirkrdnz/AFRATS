using AutoMapper;
using MediatR;
using NotificationService.Application.DTOs.Preference;
using NotificationService.Application.Interfaces;
using NotificationService.Application.Interfaces.Repositories;
using NotificationService.Application.Interfaces.Services;
using NotificationService.Domain.Entities;

namespace NotificationService.Application.Features.Preferences.UpdatePreferences;

public sealed class UpdatePreferencesCommandHandler(
    INotificationPreferenceRepository preferenceRepository,
    IUnitOfWork unitOfWork,
    ICurrentUserService currentUserService,
    IMapper mapper)
    : IRequestHandler<UpdatePreferencesCommand, NotificationPreferenceDto>
{
    public async Task<NotificationPreferenceDto> Handle(
        UpdatePreferencesCommand request,
        CancellationToken cancellationToken)
    {
        var userId = currentUserService.UserId;

        var preference = await preferenceRepository.GetByUserIdAsync(userId, cancellationToken);

        // Lazy initialization
        if (preference is null)
        {
            preference = new NotificationPreference
            {
                UserId = userId,
                Email = currentUserService.Email,  // JWT'den cache
            };
            await preferenceRepository.AddAsync(preference, cancellationToken);
        }
        else if (string.IsNullOrWhiteSpace(preference.Email)
                 && !string.IsNullOrWhiteSpace(currentUserService.Email))
        {
            // Back-fill (eski kayıtlar için)
            preference.Email = currentUserService.Email;
        }

        // Partial update: only update fields that were provided
        if (request.EmailEnabled.HasValue)
            preference.EmailEnabled = request.EmailEnabled.Value;

        if (request.PushEnabled.HasValue)
            preference.PushEnabled = request.PushEnabled.Value;

        if (request.InAppEnabled.HasValue)
            preference.InAppEnabled = request.InAppEnabled.Value;

        if (request.HighRiskEmailOnly.HasValue)
            preference.HighRiskEmailOnly = request.HighRiskEmailOnly.Value;

        if (request.FcmDeviceToken is not null)
            preference.FcmDeviceToken = request.FcmDeviceToken;

        preference.UpdatedAt = DateTime.UtcNow;

        await preferenceRepository.UpdateAsync(preference, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return mapper.Map<NotificationPreferenceDto>(preference);
    }
}
