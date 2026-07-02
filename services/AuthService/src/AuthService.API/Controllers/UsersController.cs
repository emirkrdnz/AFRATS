namespace AuthService.API.Controllers;

using AuthService.Application.Features.Users.DeleteUser;
using AuthService.Application.Features.Users.GetAllUsers;
using AuthService.Application.Features.Users.GetUserById;
using AuthService.Application.Features.Users.UpdateUserStatus;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/auth/admin/users")]
[Authorize(Roles = "Admin")]
public class UsersController(ISender sender) : ControllerBase
{
    /// <summary>
    /// List all users with pagination and filters (FR-A06)
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] bool? isActive = null,
        [FromQuery] string? role = null,
        [FromQuery] string? searchTerm = null,
        CancellationToken cancellationToken = default)
    {
        var query = new GetAllUsersQuery(page, pageSize, isActive, role, searchTerm);
        var result = await sender.Send(query, cancellationToken);
        return Ok(new { success = true, data = result });
    }

    /// <summary>
    /// Activate or deactivate a user account (FR-A06)
    /// </summary>
    [HttpPut("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(
        Guid id,
        [FromBody] UpdateUserStatusRequest request,
        CancellationToken cancellationToken)
    {
        var command = new UpdateUserStatusCommand(id, request.IsActive);
        var result = await sender.Send(command, cancellationToken);
        return Ok(new { success = true, message = result });
    }

    /// <summary>
    /// Get a specific user by ID — includes soft-deleted users (FR-A06)
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken)
    {
        var result = await sender.Send(new GetUserByIdQuery(id), cancellationToken);
        return Ok(new { success = true, data = result });
    }

    /// <summary>
    /// Soft-delete a user account (Sprint AB3).
    /// Sets IsDeleted=true + IsActive=false; global query filter hides the row
    /// from listings. Hard delete intentionally not exposed (audit trail).
    /// </summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var result = await sender.Send(new DeleteUserCommand(id), cancellationToken);
        return Ok(new { success = true, message = result });
    }
}

public record UpdateUserStatusRequest(bool IsActive);
