namespace TransactionService.Application.Features.Categories.Create;

using MediatR;
using TransactionService.Application.DTOs.Category;

public record CreateCategoryCommand(
    string Name,
    string Type,
    string? IconCode,
    Guid UserId) : IRequest<CategoryDto>;
