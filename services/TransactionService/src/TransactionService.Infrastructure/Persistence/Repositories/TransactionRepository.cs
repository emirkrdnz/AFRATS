namespace TransactionService.Infrastructure.Persistence.Repositories;

using Microsoft.EntityFrameworkCore;
using TransactionService.Application.DTOs.Admin;
using TransactionService.Application.Interfaces.Repositories;
using TransactionService.Domain.Entities;
using TransactionService.Domain.Enums;

public class TransactionRepository(TransactionDbContext context) : ITransactionRepository
{
    public async Task<Transaction?> GetByIdAsync(Guid id, Guid userId, CancellationToken cancellationToken)
    {
        return await context.Transactions
            .FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId, cancellationToken);
    }

    public async Task<Transaction?> GetByIdWithCategoryAsync(Guid id, Guid userId, CancellationToken cancellationToken)
    {
        return await context.Transactions
            .Include(t => t.Category)
            .FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId, cancellationToken);
    }

    public async Task<(List<Transaction> Items, int TotalCount)> GetPagedAsync(
     Guid userId, DateTime? startDate, DateTime? endDate,
     Guid? categoryId, string? type,
     string? search, decimal? minAmount, decimal? maxAmount,
     int page, int pageSize,
     CancellationToken cancellationToken)
    {

        var query = context.Transactions
            .Include(t => t.Category)
            .Where(t => t.UserId == userId);

        query = ApplyFilters(query, startDate, endDate, categoryId, type);

        // ... geri kalan aynı

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(t => t.Description != null && t.Description.Contains(search));

        if (minAmount.HasValue)
            query = query.Where(t => t.Amount >= minAmount.Value);

        if (maxAmount.HasValue)
            query = query.Where(t => t.Amount <= maxAmount.Value);

        var totalCount = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(t => t.TransactionDate)
            .ThenByDescending(t => t.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }

    public async Task<(List<Transaction> Items, int TotalCount)> GetPagedForAdminAsync(
        Guid userId, DateTime? startDate, DateTime? endDate,
        Guid? categoryId, string? type, int page, int pageSize,
        CancellationToken cancellationToken)
    {
        // Admin can view any user's transactions — no ownership check
        var query = context.Transactions
            .Include(t => t.Category)
            .Where(t => t.UserId == userId);

        query = ApplyFilters(query, startDate, endDate, categoryId, type);

        var totalCount = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(t => t.TransactionDate)
            .ThenByDescending(t => t.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }

    public async Task<List<Transaction>> GetByUserAndDateRangeAsync(
        Guid userId, DateTime startDate, DateTime endDate,
        CancellationToken cancellationToken)
    {
        return await context.Transactions
            .Include(t => t.Category)
            .Where(t => t.UserId == userId
                     && t.TransactionDate >= startDate
                     && t.TransactionDate <= endDate)
            .OrderByDescending(t => t.TransactionDate)
            .ToListAsync(cancellationToken);
    }

    public async Task<List<Transaction>> GetUserHistoryAsync(Guid userId, int days, CancellationToken cancellationToken)
    {
        var cutoff = DateTime.UtcNow.AddDays(-days);

        return await context.Transactions
            .Where(t => t.UserId == userId && t.TransactionDate >= cutoff)
            .OrderByDescending(t => t.TransactionDate)
            .ToListAsync(cancellationToken);
    }

    public async Task AddAsync(Transaction transaction, CancellationToken cancellationToken)
    {
        await context.Transactions.AddAsync(transaction, cancellationToken);
    }

    public async Task AddRangeAsync(IEnumerable<Transaction> transactions, CancellationToken cancellationToken)
    {
        await context.Transactions.AddRangeAsync(transactions, cancellationToken);
    }

    // Admin stats methods
    public async Task<int> GetTotalCountAsync(DateTime? startDate, DateTime? endDate, CancellationToken cancellationToken)
    {
        var query = context.Transactions.AsQueryable();
        query = ApplyDateFilter(query, startDate, endDate);
        return await query.CountAsync(cancellationToken);
    }

    public async Task<decimal> GetTotalAmountByTypeAsync(string type, DateTime? startDate, DateTime? endDate, CancellationToken cancellationToken)
    {
        var transactionType = Enum.Parse<TransactionType>(type, true);
        var query = context.Transactions.Where(t => t.Type == transactionType);
        query = ApplyDateFilter(query, startDate, endDate);
        return await query.SumAsync(t => t.Amount, cancellationToken);
    }

    public async Task<int> GetAnomalyCountAsync(DateTime? startDate, DateTime? endDate, CancellationToken cancellationToken)
    {
        var query = context.Transactions.Where(t => t.IsAnomalous);
        query = ApplyDateFilter(query, startDate, endDate);
        return await query.CountAsync(cancellationToken);
    }

    public async Task<List<AdminCategorySpendingDto>> GetCategorySpendingAsync(
        DateTime startDate,
        DateTime endDate,
        string? type,
        CancellationToken cancellationToken)
    {
        // Type filter opsiyonel — null ise her iki yön (Income + Expense) sayılır.
        TransactionType? typeFilter = null;
        if (!string.IsNullOrWhiteSpace(type)
            && Enum.TryParse<TransactionType>(type, true, out var parsed))
        {
            typeFilter = parsed;
        }

        var query = context.Transactions
            .Where(t => t.TransactionDate >= startDate && t.TransactionDate < endDate);
        if (typeFilter.HasValue)
            query = query.Where(t => t.Type == typeFilter.Value);

        // SQL Server GROUP BY + COUNT + SUM tek round-trip'te çalışır.
        // Category.Name için navigation'ı çekiyoruz; aslında join optimizasyonu
        // EF tarafından yapılır. Anomaly count conditional count — server'da
        // çevrilir çünkü Sum gibi compleks değil, basit count predicate.
        var grouped = await query
            .GroupBy(t => new { t.CategoryId, CategoryName = t.Category.Name })
            .Select(g => new AdminCategorySpendingDto(
                g.Key.CategoryId,
                g.Key.CategoryName,
                g.Count(),
                g.Sum(t => t.Amount),
                g.Count(t => t.IsAnomalous)
            ))
            .ToListAsync(cancellationToken);

        return grouped;
    }

    public async Task<List<string>> GetDistinctMonthsAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        // SQL Server tarafında YEAR + MONTH üzerinden DISTINCT al — index-friendly.
        // Format YYYY-MM (örn. "2026-06") frontend'de dayjs(s + '-01') ile parse edilir.
        var rows = await context.Transactions
            .Where(t => t.UserId == userId)
            .Select(t => new { t.TransactionDate.Year, t.TransactionDate.Month })
            .Distinct()
            .OrderByDescending(x => x.Year).ThenByDescending(x => x.Month)
            .ToListAsync(cancellationToken);

        return rows
            .Select(r => $"{r.Year:D4}-{r.Month:D2}")
            .ToList();
    }

    public async Task<AdminUserSummaryDto> GetUserSummaryAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        // Tek round-trip için minimal projection — SUM(CASE WHEN ...) server'da
        // çalışsın diye income/expense'i raw amount kolonu + type filter ile çekip
        // memory'de toplamayı tercih ettim (Sum overload'larında CASE-WHEN için
        // EF bazen subquery üretiyor). Per-user listede satır sayısı düşük.
        var rows = await context.Transactions
            .Where(t => t.UserId == userId)
            .Select(t => new { t.Amount, t.Type, t.TransactionDate })
            .ToListAsync(cancellationToken);

        if (rows.Count == 0)
        {
            return new AdminUserSummaryDto(0, 0m, 0m, null, null);
        }

        var income  = rows.Where(t => t.Type == TransactionType.Income).Sum(t => t.Amount);
        var expense = rows.Where(t => t.Type == TransactionType.Expense).Sum(t => t.Amount);

        return new AdminUserSummaryDto(
            rows.Count,
            income,
            expense,
            rows.Min(t => t.TransactionDate),
            rows.Max(t => t.TransactionDate));
    }

    public async Task<List<AdminTimeseriesPointDto>> GetTimeseriesAsync(
        DateTime startDate,
        DateTime endDate,
        CancellationToken cancellationToken)
    {
        // EF Core, conditional Sum'ları (Where(...).Sum(...)) GROUP BY içinde
        // SQL Server'a çeviremiyor (provider sınırlaması). 30 günlük pencere
        // ortalama birkaç bin satır → server'a sadece kolonları çekip
        // LINQ-to-Objects ile group + agg ediyoruz. Tek round-trip, indeksli
        // tarama, memory ihmal edilebilir.
        var rows = await context.Transactions
            .Where(t => t.TransactionDate >= startDate && t.TransactionDate < endDate)
            .Select(t => new { t.TransactionDate, t.IsAnomalous, t.Type, t.Amount })
            .ToListAsync(cancellationToken);

        return rows
            .GroupBy(t => t.TransactionDate.Date)
            .Select(g => new AdminTimeseriesPointDto(
                g.Key,
                g.Count(),
                g.Count(t => t.IsAnomalous),
                g.Where(t => t.Type == TransactionType.Income).Sum(t => t.Amount),
                g.Where(t => t.Type == TransactionType.Expense).Sum(t => t.Amount)
            ))
            .OrderBy(p => p.Date)
            .ToList();
    }

    // Private helpers
    private static IQueryable<Transaction> ApplyFilters(
        IQueryable<Transaction> query, DateTime? startDate, DateTime? endDate,
        Guid? categoryId, string? type)
    {
        query = ApplyDateFilter(query, startDate, endDate);

        if (categoryId.HasValue)
            query = query.Where(t => t.CategoryId == categoryId.Value);

        if (!string.IsNullOrWhiteSpace(type) && Enum.TryParse<TransactionType>(type, true, out var transactionType))
            query = query.Where(t => t.Type == transactionType);

        return query;
    }

    private static IQueryable<Transaction> ApplyDateFilter(
        IQueryable<Transaction> query, DateTime? startDate, DateTime? endDate)
    {
        if (startDate.HasValue)
            query = query.Where(t => t.TransactionDate >= startDate.Value);

        if (endDate.HasValue)
            query = query.Where(t => t.TransactionDate <= endDate.Value);

        return query;
    }
}
