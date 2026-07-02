namespace TransactionService.Application.DTOs.Transaction;

public record TransactionDto(
    Guid Id,
    decimal Amount,
    string Type,
    Guid CategoryId,
    string CategoryName,
    DateTime TransactionDate,
    string? Description,
    bool IsAnomalous,
    double? AnomalyScore,
    DateTime CreatedAt);
