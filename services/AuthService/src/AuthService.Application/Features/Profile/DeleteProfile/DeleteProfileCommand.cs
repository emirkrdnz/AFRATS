namespace AuthService.Application.Features.Profile.DeleteProfile;

using MediatR;

public record DeleteProfileCommand : IRequest<Unit>;