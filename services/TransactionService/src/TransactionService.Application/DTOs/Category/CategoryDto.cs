namespace TransactionService.Application.DTOs.Category;

public record CategoryDto(
    Guid Id,
    string Name,
    string Type,
    string? IconCode,
    bool IsSystem);
