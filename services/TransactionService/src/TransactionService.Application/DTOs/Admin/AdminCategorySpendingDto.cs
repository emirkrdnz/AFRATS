namespace TransactionService.Application.DTOs.Admin;

/// <summary>
/// Kategori bazlı harcama özeti — Analytics sayfasındaki "Spending by Category"
/// donut chart için. Income veya Expense ayrı sorgulanır.
/// </summary>
public record AdminCategorySpendingDto(
    Guid CategoryId,
    string CategoryName,
    int TransactionCount,
    decimal TotalAmount,
    int AnomalyCount);
