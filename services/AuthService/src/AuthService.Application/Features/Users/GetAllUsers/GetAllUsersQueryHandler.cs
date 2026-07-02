namespace AuthService.Application.Features.Users.GetAllUsers;

using AuthService.Application.DTOs.Common;
using AuthService.Application.DTOs.User;
using AuthService.Application.Interfaces.Repositories;
using AutoMapper;
using MediatR;

public class GetAllUsersQueryHandler(
    IUserRepository userRepository,
    IMapper mapper) : IRequestHandler<GetAllUsersQuery, PagedResult<UserDto>>
{
    public async Task<PagedResult<UserDto>> Handle(GetAllUsersQuery request, CancellationToken cancellationToken)
    {
        // Clamp paging to guard against accidental self-DoS (e.g. ?pageSize=1000000).
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 100);

        var (users, totalCount) = await userRepository.GetAllAsync(
            page,
            pageSize,
            request.IsActive,
            request.Role,
            request.SearchTerm,
            cancellationToken);

        var userDtos = mapper.Map<IReadOnlyList<UserDto>>(users);

        return new PagedResult<UserDto>(userDtos, totalCount, page, pageSize);
    }
}
