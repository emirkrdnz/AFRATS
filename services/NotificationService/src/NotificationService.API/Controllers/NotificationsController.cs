using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NotificationService.Application.Features.Notifications.GetNotifications;
using NotificationService.Application.Features.Notifications.GetUnreadCount;
using NotificationService.Application.Features.Notifications.MarkAllAsRead;
using NotificationService.Application.Features.Notifications.MarkAsRead;
using NotificationService.Application.Features.Preferences.GetPreferences;
using NotificationService.Application.Features.Preferences.UpdatePreferences;

namespace NotificationService.API.Controllers;

[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationsController(ISender sender) : ControllerBase
{
    /// <summary>
    /// Lists the current user's in-app notifications (paged).
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetNotifications(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] bool? isRead = null,
        CancellationToken ct = default)
    {
        var result = await sender.Send(new GetNotificationsQuery(page, pageSize, isRead), ct);
        return Ok(new { success = true, data = result });
    }

    /// <summary>
    /// Returns the unread in-app notification count (for dashboard badge).
    /// </summary>
    [HttpGet("unread-count")]
    public async Task<IActionResult> GetUnreadCount(CancellationToken ct = default)
    {
        var count = await sender.Send(new GetUnreadCountQuery(), ct);
        return Ok(new { success = true, data = new { unreadCount = count } });
    }

    /// <summary>
    /// Marks a single notification as read.
    /// </summary>
    [HttpPut("{id:guid}/read")]
    public async Task<IActionResult> MarkAsRead(Guid id, CancellationToken ct = default)
    {
        await sender.Send(new MarkAsReadCommand(id), ct);
        return Ok(new { success = true, message = "Notification marked as read." });
    }

    /// <summary>
    /// Marks all unread notifications as read.
    /// </summary>
    [HttpPut("read-all")]
    public async Task<IActionResult> MarkAllAsRead(CancellationToken ct = default)
    {
        var updatedCount = await sender.Send(new MarkAllAsReadCommand(), ct);
        return Ok(new { success = true, data = new { updatedCount } });
    }

    /// <summary>
    /// Returns the current user's notification preferences.
    /// Creates default preferences if none exist (lazy init).
    /// </summary>
    [HttpGet("preferences")]
    public async Task<IActionResult> GetPreferences(CancellationToken ct = default)
    {
        var result = await sender.Send(new GetPreferencesQuery(), ct);
        return Ok(new { success = true, data = result });
    }

    /// <summary>
    /// Updates notification preferences. All fields are optional (partial update).
    /// </summary>
    [HttpPut("preferences")]
    public async Task<IActionResult> UpdatePreferences(
        [FromBody] UpdatePreferencesCommand command,
        CancellationToken ct = default)
    {
        var result = await sender.Send(command, ct);
        return Ok(new { success = true, data = result });
    }
}
