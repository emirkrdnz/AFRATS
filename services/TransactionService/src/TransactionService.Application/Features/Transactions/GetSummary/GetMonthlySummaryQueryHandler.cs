namespace TransactionService.Application.Features.Transactions.GetSummary;

using MediatR;
using TransactionService.Application.DTOs.Transaction;
using TransactionService.Application.Interfaces.Repositories;
using TransactionService.Domain.Enums;

public class GetMonthlySummaryQueryHandler(
    ITransactionRepository transactionRepository) : IRequestHandler<GetMonthlySummaryQuery, MonthlySummaryDto>
{
    public async Task<MonthlySummaryDto> Handle(GetMonthlySummaryQuery request, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var month = request.Month ?? now.Month;
        var year = request.Year ?? now.Year;

        // Current period — full aggregate including category breakdown
        var current = await BuildAggregateAsync(
            request.UserId, month, year, includeBreakdown: true, cancellationToken);

        // Previous period — for trend deltas. Handle Jan → previous year Dec.
        var (prevMonth, prevYear) = month == 1 ? (12, year - 1) : (month - 1, year);
        var previous = await BuildAggregateAsync(
            request.UserId, prevMonth, prevYear, includeBreakdown: false, cancellationToken);

        // Distinct YYYY-MM listesi — frontend ay navigation'u için.
        var availableMonths = await transactionRepository.GetDistinctMonthsAsync(
            request.UserId, cancellationToken);

        return new MonthlySummaryDto(
            Month: month,
            Year: year,
            TotalIncome: current.TotalIncome,
            TotalExpense: current.TotalExpense,
            NetBalance: current.TotalIncome - current.TotalExpense,
            TransactionCount: current.TransactionCount,
            AnomalyCount: current.AnomalyCount,
            CategoryBreakdown: current.CategoryBreakdown ?? [],
            // null → frontend trend kartlarında "—" gösterecek (ilk ayda veri yok demektir)
            PreviousPeriod: previous.TransactionCount == 0
                ? null
                : new PreviousPeriodDto(
                    TotalIncome: previous.TotalIncome,
                    TotalExpense: previous.TotalExpense,
                    NetBalance: previous.TotalIncome - previous.TotalExpense,
                    TransactionCount: previous.TransactionCount,
                    AnomalyCount: previous.AnomalyCount),
            AvailableMonths: availableMonths);
    }

    private async Task<PeriodAggregate> BuildAggregateAsync(
        Guid userId, int month, int year, bool includeBreakdown, CancellationToken cancellationToken)
    {
        var startDate = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
        var endDate = startDate.AddMonths(1).AddTicks(-1);

        var transactions = await transactionRepository.GetByUserAndDateRangeAsync(
            userId, startDate, endDate, cancellationToken);

        var totalIncome = transactions
            .Where(t => t.Type == TransactionType.Income)
            .Sum(t => t.Amount);

        var totalExpense = transactions
            .Where(t => t.Type == TransactionType.Expense)
            .Sum(t => t.Amount);

        var anomalyCount = transactions.Count(t => t.IsAnomalous);

        List<CategorySummaryDto>? categoryBreakdown = null;

        if (includeBreakdown)
        {
            // BUG FIX: Breakdown sadece Expense üzerinden — "Spending by Category" semantiği.
            // Eski kod Income kategorilerini de dahil ediyor, yüzdeyi totalExpense'a böldüğü için
            // Salary % 250 gibi saçma değerler çıkıyordu.
            categoryBreakdown = transactions
                .Where(t => t.Type == TransactionType.Expense)
                .GroupBy(t => new { t.CategoryId, CategoryName = t.Category.Name })
                .Select(g =>
                {
                    var total = g.Sum(t => t.Amount);
                    return new CategorySummaryDto(
                        CategoryId: g.Key.CategoryId,
                        CategoryName: g.Key.CategoryName,
                        TotalAmount: total,
                        TransactionCount: g.Count(),
                        Percentage: totalExpense > 0
                            ? Math.Round(total / totalExpense * 100, 2)
                            : 0);
                })
                .OrderByDescending(c => c.TotalAmount)
                .ToList();
        }

        return new PeriodAggregate(
            TotalIncome: totalIncome,
            TotalExpense: totalExpense,
            TransactionCount: transactions.Count,
            AnomalyCount: anomalyCount,
            CategoryBreakdown: categoryBreakdown);
    }

    private sealed record PeriodAggregate(
        decimal TotalIncome,
        decimal TotalExpense,
        int TransactionCount,
        int AnomalyCount,
        List<CategorySummaryDto>? CategoryBreakdown);
}