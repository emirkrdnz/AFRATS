using AutoMapper;
using NotificationService.Application.DTOs.Notification;
using NotificationService.Application.DTOs.Preference;
using NotificationService.Domain.Entities;

namespace NotificationService.Application.Mappings;

public class NotificationMappingProfile : Profile
{
    public NotificationMappingProfile()
    {
        CreateMap<Notification, NotificationDto>()
            .ForCtorParam("Type", opt => opt.MapFrom(src => src.Type.ToString()))
            .ForCtorParam("Channel", opt => opt.MapFrom(src => src.Channel.ToString()));

        CreateMap<NotificationPreference, NotificationPreferenceDto>();
    }
}
