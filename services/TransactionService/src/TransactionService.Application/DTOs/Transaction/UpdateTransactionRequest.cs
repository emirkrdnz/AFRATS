namespace TransactionService.Application.DTOs.Transaction;

public record UpdateTransactionRequest(
    decimal Amount,
    string Type,
    Guid CategoryId,
    DateTime TransactionDate,
    string? Description);
