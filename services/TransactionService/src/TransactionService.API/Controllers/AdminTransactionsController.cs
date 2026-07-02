namespace TransactionService.API.Controllers;

using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TransactionService.Application.Features.Admin.GetCategorySpending;
using TransactionService.Application.Features.Admin.GetStats;
using TransactionService.Application.Features.Admin.GetTimeseries;
using TransactionService.Application.Features.Admin.GetUserSummary;
using TransactionService.Application.Features.Admin.GetUserTransactions;

[ApiController]
[Route("api/transactions/admin")]
[Authorize(Roles = "Admin")]
public class AdminTransactionsController(IMediator mediator) : ControllerBase
{
    /// <summary>GET /api/transactions/admin/stats — FR-T10: System-wide transaction statistics</summary>
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats(
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null,
        CancellationToken cancellationToken = default)
    {
        var query = new GetAdminStatsQuery(StartDate: startDate, EndDate: endDate);
        var result = await mediator.Send(query, cancellationToken);

        return Ok(new { success = true, data = result });
    }

    /// <summary>
    /// GET /api/transactions/admin/timeseries?days=30
    /// Günlük gruplanmış istatistik dizisi — Dashboard trend chart için.
    /// </summary>
    [HttpGet("timeseries")]
    public async Task<IActionResult> GetTimeseries(
        [FromQuery] int days = 30,
        CancellationToken cancellationToken = default)
    {
        var query  = new GetAdminTimeseriesQuery(Days: days);
        var result = await mediator.Send(query, cancellationToken);
        return Ok(new { success = true, data = result });
    }

    /// <summary>
    /// GET /api/transactions/admin/by-category?days=30&amp;type=Expense
    /// Kategori bazlı toplam — Analytics donut chart için.
    /// </summary>
    [HttpGet("by-category")]
    public async Task<IActionResult> GetCategorySpending(
        [FromQuery] int days = 30,
        [FromQuery] string? type = "Expense",
        CancellationToken cancellationToken = default)
    {
        var query  = new GetAdminCategorySpendingQuery(Days: days, Type: type);
        var result = await mediator.Send(query, cancellationToken);
        return Ok(new { success = true, data = result });
    }

    /// <summary>
    /// GET /api/transactions/admin/{userId}/summary
    /// Admin user drawer için lifetime özet — count + income/expense + first/last activity.
    /// </summary>
    [HttpGet("{userId:guid}/summary")]
    public async Task<IActionResult> GetUserSummary(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var result = await mediator.Send(new GetUserSummaryQuery(userId), cancellationToken);
        return Ok(new { success = true, data = result });
    }

    /// <summary>GET /api/transactions/admin/{userId} — FR-T10: Specific user's transaction history</summary>
    [HttpGet("{userId:guid}")]
    public async Task<IActionResult> GetUserTransactions(
        Guid userId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null,
        [FromQuery] Guid? categoryId = null,
        [FromQuery] string? type = null,
        CancellationToken cancellationToken = default)
    {
        var query = new GetAdminUserTransactionsQuery(
            TargetUserId: userId,
            Page: page,
            PageSize: pageSize,
            StartDate: startDate,
            EndDate: endDate,
            CategoryId: categoryId,
            Type: type);

        var result = await mediator.Send(query, cancellationToken);

        return Ok(new { success = true, data = result });
    }
}
