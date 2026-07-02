namespace TransactionService.Application.DTOs.Category;

public record CreateCategoryRequest(
    string Name,
    string Type,
    string? IconCode);
