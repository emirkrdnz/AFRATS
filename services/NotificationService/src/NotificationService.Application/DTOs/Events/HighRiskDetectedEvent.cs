using System.Text.Json;

namespace NotificationService.Application.DTOs.Events;

// Factors dict heterogeneous değerler içerebilir (double + nested object —
// spending_trend_months metadata gibi). Dictionary<string, double> deserialize
// "Cannot get value of token type StartObject as number" hatası verirdi;
// JsonElement tip-agnostic, her şeyi accept eder. NotificationService bu alanı
// zaten okumuyor — sadece pass-through pre-existing contract.
public record HighRiskDetectedEvent(
    Guid UserId,
    double RiskScore,
    string RiskLevel,
    Guid TransactionId,
    double PreviousScore,
    DateTime TriggeredAt,
    string? UserEmail,
    Dictionary<string, JsonElement> Factors,
    // Action context — email HTML template'inde TRANSACTION_ID UUID yerine
    // "Grocery — TRY 25,000 on 12 May 2026" formatı için. Nullable, eski
    // event'ler ya da context'siz path'lerde graceful fallback yapılır.
    string? CategoryName = null,
    decimal? Amount = null,
    string? Description = null,
    DateTime? TransactionDate = null);
