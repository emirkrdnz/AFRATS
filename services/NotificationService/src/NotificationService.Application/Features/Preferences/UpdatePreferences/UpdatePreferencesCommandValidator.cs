using FluentValidation;

namespace NotificationService.Application.Features.Preferences.UpdatePreferences;

public class UpdatePreferencesCommandValidator : AbstractValidator<UpdatePreferencesCommand>
{
    public UpdatePreferencesCommandValidator()
    {
        RuleFor(x => x.FcmDeviceToken)
            .MaximumLength(512).WithMessage("FCM device token cannot exceed 512 characters.")
            .When(x => x.FcmDeviceToken is not null);
    }
}
