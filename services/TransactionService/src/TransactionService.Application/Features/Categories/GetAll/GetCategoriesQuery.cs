namespace TransactionService.Application.Features.Categories.GetAll;

using MediatR;
using TransactionService.Application.DTOs.Category;

public record GetCategoriesQuery(
    Guid UserId,
    string? Type = null) : IRequest<List<CategoryDto>>;
