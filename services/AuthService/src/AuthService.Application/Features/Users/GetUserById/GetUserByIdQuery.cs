namespace AuthService.Application.Features.Users.GetUserById;

using AuthService.Application.DTOs.User;
using MediatR;

public record GetUserByIdQuery(Guid Id) : IRequest<UserDto>;