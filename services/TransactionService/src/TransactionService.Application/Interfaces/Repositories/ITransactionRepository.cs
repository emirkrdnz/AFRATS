namespace TransactionService.Application.Interfaces.Repositories;

using TransactionService.Application.DTOs.Admin;
using TransactionService.Domain.Entities;

public interface ITransactionRepository
{
    Task<Transaction?> GetByIdAsync(Guid id, Guid userId, CancellationToken cancellationToken = default);
    Task<Transaction?> GetByIdWithCategoryAsync(Guid id, Guid userId, CancellationToken cancellationToken = default);
    Task<(List<Transaction> Items, int TotalCount)> GetPagedAsync(
        Guid userId,
        DateTime? startDate,
        DateTime? endDate,
        Guid? categoryId,
        string? type,
        string? search,
        decimal? minAmount,
        decimal? maxAmount,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);
    Task<(List<Transaction> Items, int TotalCount)> GetPagedForAdminAsync(
        Guid userId,
        DateTime? startDate,
        DateTime? endDate,
        Guid? categoryId,
        string? type,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);
    Task<List<Transaction>> GetByUserAndDateRangeAsync(
        Guid userId,
        DateTime startDate,
        DateTime endDate,
        CancellationToken cancellationToken = default);
    Task<List<Transaction>> GetUserHistoryAsync(Guid userId, int days = 90, CancellationToken cancellationToken = default);
    Task AddAsync(Transaction transaction, CancellationToken cancellationToken = default);
    Task AddRangeAsync(IEnumerable<Transaction> transactions, CancellationToken cancellationToken = default);

    // Admin stats
    Task<int> GetTotalCountAsync(DateTime? startDate, DateTime? endDate, CancellationToken cancellationToken = default);
    Task<decimal> GetTotalAmountByTypeAsync(string type, DateTime? startDate, DateTime? endDate, CancellationToken cancellationToken = default);
    Task<int> GetAnomalyCountAsync(DateTime? startDate, DateTime? endDate, CancellationToken cancellationToken = default);

    /// <summary>
    /// Günlük gruplanmış admin istatistikleri — Dashboard trend chart için.
    /// Sadece var olan günleri döner; handler eksik günleri 0-pad eder.
    /// </summary>
    Task<List<AdminTimeseriesPointDto>> GetTimeseriesAsync(
        DateTime startDate,
        DateTime endDate,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Kategori bazlı toplam — Analytics donut chart için.
    /// type null ise Income + Expense birlikte, "Income"/"Expense" ise filtreli.
    /// </summary>
    Task<List<AdminCategorySpendingDto>> GetCategorySpendingAsync(
        DateTime startDate,
        DateTime endDate,
        string? type,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Tek kullanıcının lifetime özeti — admin user drawer için.
    /// Sıfır tx olan kullanıcıda count=0, income=0, expense=0, dates=null döner.
    /// </summary>
    Task<AdminUserSummaryDto> GetUserSummaryAsync(
        Guid userId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Kullanıcının transaction'ı OLAN distinct YYYY-MM listesini döner (DESC sıralı).
    /// User Dashboard ay navigation'u için — boş aylar atlanır, ilk işlemden öncesine gidemez.
    /// </summary>
    Task<List<string>> GetDistinctMonthsAsync(
        Guid userId,
        CancellationToken cancellationToken = default);
}
