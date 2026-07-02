namespace AuthService.Application.Features.Profile.GetProfile;

using AuthService.Application.DTOs.Profile;
using AuthService.Application.Interfaces.Repositories;
using AuthService.Application.Interfaces.Services;
using AuthService.Domain.Exceptions;
using MediatR;

public class GetProfileQueryHandler(
    IUserRepository userRepository,
    ICurrentUserService currentUserService) : IRequestHandler<GetProfileQuery, ProfileResponse>
{
    public async Task<ProfileResponse> Handle(GetProfileQuery request, CancellationToken cancellationToken)
    {
        var user = await userRepository.GetByIdAsync(currentUserService.UserId, cancellationToken)
            ?? throw new NotFoundException("User not found.");

        return new ProfileResponse(
            user.Id,
            user.Email,
            user.FirstName,
            user.LastName,
            user.PhoneNumber,
            user.Role?.Name ?? "User",
            user.IsActive,
            user.EmailConfirmed,
            user.CreatedAt,
            user.UpdatedAt);
    }
}