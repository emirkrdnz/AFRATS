namespace TransactionService.API.Controllers;

using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TransactionService.API.Extensions;
using TransactionService.Application.DTOs.Category;
using TransactionService.Application.Features.Categories.Create;
using TransactionService.Application.Features.Categories.GetAll;

[ApiController]
[Route("api/transactions/categories")]
[Authorize]
public class CategoriesController(IMediator mediator) : ControllerBase
{
    /// <summary>GET /api/transactions/categories — FR-T07: List categories (system + user)</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? type = null, CancellationToken cancellationToken = default)
    {
        var query = new GetCategoriesQuery(UserId: User.GetUserId(), Type: type);
        var result = await mediator.Send(query, cancellationToken);

        return Ok(new { success = true, data = result });
    }

    /// <summary>POST /api/transactions/categories — FR-T07: Create user-defined category</summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCategoryRequest request, CancellationToken cancellationToken)
    {
        var command = new CreateCategoryCommand(
            Name: request.Name,
            Type: request.Type,
            IconCode: request.IconCode,
            UserId: User.GetUserId());

        var result = await mediator.Send(command, cancellationToken);

        return CreatedAtAction(nameof(GetAll), null, new { success = true, data = result });
    }
}
