namespace TransactionService.API.Controllers;

using Microsoft.AspNetCore.Mvc;
using TransactionService.Infrastructure.Persistence;

[ApiController]
[Route("api/transactions/health")]
public class HealthController(TransactionDbContext context) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        try
        {
            await context.Database.CanConnectAsync();
            return Ok(new
            {
                success = true,
                data = new
                {
                    status = "Healthy",
                    service = "TransactionService",
                    timestamp = DateTime.UtcNow
                }
            });
        }
        catch
        {
            return StatusCode(503, new
            {
                success = false,
                message = "Service Unavailable",
                data = new
                {
                    status = "Unhealthy",
                    service = "TransactionService",
                    timestamp = DateTime.UtcNow
                }
            });
        }
    }
}