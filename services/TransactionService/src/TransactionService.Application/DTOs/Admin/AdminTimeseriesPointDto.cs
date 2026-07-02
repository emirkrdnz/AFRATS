namespace TransactionService.Application.DTOs.Admin;

/// <summary>
/// Günlük gruplanmış admin istatistiği — Dashboard'daki trend chart'lar
/// (anomaly trend + income/expense bar) için.
///
/// Date her zaman UTC midnight (gün başlangıcı).
/// </summary>
public record AdminTimeseriesPointDto(
    DateTime Date,
    int TotalTx,
    int Anomalies,
    decimal Income,
    decimal Expense);
