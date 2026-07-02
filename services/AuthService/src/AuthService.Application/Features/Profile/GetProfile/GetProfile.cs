namespace AuthService.Application.Features.Profile.GetProfile;

using AuthService.Application.DTOs.Profile;
using MediatR;

public record GetProfileQuery : IRequest<ProfileResponse>;