namespace TransactionService.Application.DTOs.Transaction;

public record TransactionFilterRequest(
    int Page = 1,
    int PageSize = 20,
    DateTime? StartDate = null,
    DateTime? EndDate = null,
    Guid? CategoryId = null,
    string? Type = null);
