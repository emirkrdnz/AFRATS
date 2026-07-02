using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NotificationService.Infrastructure.Persistence;

namespace NotificationService.API.Controllers;

[ApiController]
[Route("api/notifications")]
public class HealthController(NotificationDbContext dbContext) : ControllerBase
{
    /// <summary>
    /// Health check — no auth required. Verifies DB connectivity.
    /// </summary>
    [HttpGet("health")]
    public async Task<IActionResult> Health(CancellationToken ct = default)
    {
        try
        {
            await dbContext.Database.CanConnectAsync(ct);
            return Ok(new
            {
                success = true,
                service = "NotificationService",
                status = "Healthy",
                timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new
            {
                success = false,
                service = "NotificationService",
                status = "Unhealthy",
                error = ex.Message,
                timestamp = DateTime.UtcNow
            });
        }
    }
}
