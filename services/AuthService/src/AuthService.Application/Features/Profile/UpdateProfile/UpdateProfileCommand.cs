namespace AuthService.Application.Features.Profile.UpdateProfile;

using AuthService.Application.DTOs.Profile;
using MediatR;

public record UpdateProfileCommand(
    string FirstName,
    string LastName,
    string? PhoneNumber) : IRequest<ProfileResponse>;