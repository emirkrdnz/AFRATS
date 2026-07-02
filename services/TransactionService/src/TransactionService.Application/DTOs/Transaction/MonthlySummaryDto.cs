namespace TransactionService.Application.DTOs.Transaction;

public record MonthlySummaryDto(
    int Month,
    int Year,
    decimal TotalIncome,
    decimal TotalExpense,
    decimal NetBalance,
    int TransactionCount,
    int AnomalyCount,
    List<CategorySummaryDto> CategoryBreakdown,
    PreviousPeriodDto? PreviousPeriod,
    // YYYY-MM string listesi, DESC sıralı (en yeni ilk). Frontend ay navigation
    // bu listeyi kullanır: boş aylar atlanır, ilk transaction'dan öncesine gidemez.
    List<string> AvailableMonths);

public record CategorySummaryDto(
    Guid CategoryId,
    string CategoryName,
    decimal TotalAmount,
    int TransactionCount,
    decimal Percentage);

public record PreviousPeriodDto(
    decimal TotalIncome,
    decimal TotalExpense,
    decimal NetBalance,
    int TransactionCount,
    int AnomalyCount);