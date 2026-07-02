namespace TransactionService.Application.DTOs.Admin;

/// <summary>
/// Tek bir kullanıcının lifetime özet metrikleri — Admin User Details drawer'ında
/// "Transactions" ve aktivite bilgisi olarak gösterilir.
/// </summary>
public record AdminUserSummaryDto(
    int TransactionCount,
    decimal TotalIncome,
    decimal TotalExpense,
    DateTime? FirstTransactionAt,
    DateTime? LastTransactionAt);
