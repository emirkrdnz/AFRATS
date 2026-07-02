namespace AuthService.Application.Mappings;

using AuthService.Application.DTOs.User;
using AuthService.Domain.Entities;
using AutoMapper;

public class AuthMappingProfile : Profile
{
    public AuthMappingProfile()
    {
        CreateMap<User, UserDto>()
            .ForCtorParam("Role", opt => opt.MapFrom(src => src.Role.Name));
    }
}