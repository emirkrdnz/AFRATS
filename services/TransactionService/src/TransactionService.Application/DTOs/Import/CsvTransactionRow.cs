namespace TransactionService.Application.DTOs.Import;

public record CsvTransactionRow(
    decimal Amount,
    string Type,
    string CategoryName,
    DateTime TransactionDate,
    string? Description);
