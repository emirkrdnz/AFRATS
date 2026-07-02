namespace AuthService.Application.Features.Users.GetAllUsers;

using AuthService.Application.DTOs.Common;
using AuthService.Application.DTOs.User;
using MediatR;

public record GetAllUsersQuery(
    int Page = 1,
    int PageSize = 10,
    bool? IsActive = null,
    string? Role = null,
    string? SearchTerm = null) : IRequest<PagedResult<UserDto>>;
