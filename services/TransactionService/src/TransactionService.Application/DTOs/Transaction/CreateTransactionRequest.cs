namespace TransactionService.Application.DTOs.Transaction;

public record CreateTransactionRequest(
    decimal Amount,
    string Type,
    Guid CategoryId,
    DateTime TransactionDate,
    string? Description);
