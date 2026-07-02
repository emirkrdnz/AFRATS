namespace TransactionService.Application.DTOs.Admin;

public record AdminStatsDto(
    int TotalTransactionCount,
    decimal TotalIncome,
    decimal TotalExpense,
    int AnomalyCount);
