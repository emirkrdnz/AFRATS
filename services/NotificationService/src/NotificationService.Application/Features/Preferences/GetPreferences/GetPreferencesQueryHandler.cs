using AutoMapper;
using MediatR;
using NotificationService.Application.DTOs.Preference;
using NotificationService.Application.Interfaces;
using NotificationService.Application.Interfaces.Repositories;
using NotificationService.Application.Interfaces.Services;
using NotificationService.Domain.Entities;

namespace NotificationService.Application.Features.Preferences.GetPreferences;

public sealed class GetPreferencesQueryHandler(
    INotificationPreferenceRepository preferenceRepository,
    IUnitOfWork unitOfWork,
    ICurrentUserService currentUserService,
    IMapper mapper)
    : IRequestHandler<GetPreferencesQuery, NotificationPreferenceDto>
{
    public async Task<NotificationPreferenceDto> Handle(
        GetPreferencesQuery request,
        CancellationToken cancellationToken)
    {
        var userId = currentUserService.UserId;

        var preference = await preferenceRepository.GetByUserIdAsync(userId, cancellationToken);

        // Lazy initialization: create defaults on first access
        if (preference is null)
        {
            preference = new NotificationPreference
            {
                UserId = userId,
                Email = currentUserService.Email,  // JWT'den cache'le
            };
            await preferenceRepository.AddAsync(preference, cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }
        else if (string.IsNullOrWhiteSpace(preference.Email)
                 && !string.IsNullOrWhiteSpace(currentUserService.Email))
        {
            // Eski preference kayıtları Email kolonu olmadan oluşturulmuştu;
            // ilk Get çağrısında back-fill et — kullanıcı email'i değiştirmediği
            // sürece bir kez yazılır.
            preference.Email = currentUserService.Email;
            await preferenceRepository.UpdateAsync(preference, cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return mapper.Map<NotificationPreferenceDto>(preference);
    }
}
