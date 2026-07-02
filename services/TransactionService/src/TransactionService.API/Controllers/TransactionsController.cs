namespace TransactionService.API.Controllers;

using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TransactionService.API.Extensions;
using TransactionService.Application.DTOs.Transaction;
using TransactionService.Application.Features.Transactions.Create;
using TransactionService.Application.Features.Transactions.Delete;
using TransactionService.Application.Features.Transactions.GetAll;
using TransactionService.Application.Features.Transactions.GetById;
using TransactionService.Application.Features.Transactions.GetSummary;
using TransactionService.Application.Features.Transactions.Import;
using TransactionService.Application.Features.Transactions.Update;

[ApiController]
[Route("api/transactions")]
[Authorize]
public class TransactionsController(IMediator mediator) : ControllerBase
{
    /// <summary>POST /api/transactions — FR-T01: Create new transaction</summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTransactionRequest request, CancellationToken cancellationToken)
    {
        var command = new CreateTransactionCommand(
            Amount: request.Amount,
            Type: request.Type,
            CategoryId: request.CategoryId,
            TransactionDate: request.TransactionDate,
            Description: request.Description,
            UserId: User.GetUserId());

        var result = await mediator.Send(command, cancellationToken);

        return CreatedAtAction(nameof(GetById), new { id = result.Id }, new
        {
            success = true,
            data = result
        });
    }

    /// <summary>GET /api/transactions — FR-T03: List transactions (paged + filtered)</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null,
        [FromQuery] Guid? categoryId = null,
        [FromQuery] string? type = null,
        [FromQuery] string? search = null,
        [FromQuery] decimal? minAmount = null,
        [FromQuery] decimal? maxAmount = null,
        CancellationToken cancellationToken = default)
    {
        var query = new GetTransactionsQuery(
            UserId: User.GetUserId(),
            Page: page,
            PageSize: pageSize,
            StartDate: startDate,
            EndDate: endDate,
            CategoryId: categoryId,
            Type: type,
            Search: search,
            MinAmount: minAmount,
            MaxAmount: maxAmount);

        var result = await mediator.Send(query, cancellationToken);

        return Ok(new { success = true, data = result });
    }

    /// <summary>GET /api/transactions/{id} — FR-T03: Single transaction detail</summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken)
    {
        var query = new GetTransactionByIdQuery(Id: id, UserId: User.GetUserId());
        var result = await mediator.Send(query, cancellationToken);

        return Ok(new { success = true, data = result });
    }

    /// <summary>PUT /api/transactions/{id} — FR-T04: Update transaction</summary>
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTransactionRequest request, CancellationToken cancellationToken)
    {
        var command = new UpdateTransactionCommand(
            Id: id,
            Amount: request.Amount,
            Type: request.Type,
            CategoryId: request.CategoryId,
            TransactionDate: request.TransactionDate,
            Description: request.Description,
            UserId: User.GetUserId());

        var result = await mediator.Send(command, cancellationToken);

        return Ok(new { success = true, data = result });
    }

    /// <summary>DELETE /api/transactions/{id} — FR-T04: Soft delete transaction</summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var command = new DeleteTransactionCommand(Id: id, UserId: User.GetUserId());
        await mediator.Send(command, cancellationToken);

        return NoContent();
    }

    /// <summary>POST /api/transactions/import — FR-T06: CSV bulk import</summary>
    [HttpPost("import")]
    public async Task<IActionResult> Import(IFormFile file, CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { success = false, message = "No file uploaded." });

        if (file.Length > 5 * 1024 * 1024) // 5MB
            return BadRequest(new { success = false, message = "File size exceeds 5MB limit." });

        if (!Path.GetExtension(file.FileName).Equals(".csv", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { success = false, message = "Only .csv files are allowed." });

        using var stream = file.OpenReadStream();
        var command = new ImportTransactionsCommand(FileStream: stream, UserId: User.GetUserId());
        var result = await mediator.Send(command, cancellationToken);

        return Ok(new { success = true, data = result });
    }

    /// <summary>GET /api/transactions/summary — FR-T09: Monthly dashboard summary</summary>
    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary(
        [FromQuery] int? month = null,
        [FromQuery] int? year = null,
        CancellationToken cancellationToken = default)
    {
        var query = new GetMonthlySummaryQuery(
            UserId: User.GetUserId(),
            Month: month,
            Year: year);

        var result = await mediator.Send(query, cancellationToken);

        return Ok(new { success = true, data = result });
    }
}
