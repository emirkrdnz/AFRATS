namespace AuthService.Application.Features.Users.GetUserById;

using AuthService.Application.DTOs.User;
using AuthService.Application.Interfaces.Repositories;
using AuthService.Domain.Exceptions;
using AutoMapper;
using MediatR;

public class GetUserByIdQueryHandler(
    IUserRepository userRepository,
    IMapper mapper) : IRequestHandler<GetUserByIdQuery, UserDto>
{
    public async Task<UserDto> Handle(GetUserByIdQuery request, CancellationToken cancellationToken)
    {
        var user = await userRepository.GetByIdIncludingDeletedAsync(request.Id, cancellationToken)
            ?? throw new NotFoundException($"User with ID '{request.Id}' not found.");

        return mapper.Map<UserDto>(user);
    }
}