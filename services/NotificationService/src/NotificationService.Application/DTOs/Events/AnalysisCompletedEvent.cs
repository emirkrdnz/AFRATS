namespace NotificationService.Application.DTOs.Events;

// Action context alanları (CategoryName, Amount, Description, TransactionDate)
// downstream NotificationTemplateService'in human-readable alert mesajı için.
// MLService publisher tarafından TransactionCreatedEvent'ten enrich edilir.
// Nullable çünkü eski queue'da bekleyen event'lerde (rolling deploy sırası)
// bu alanlar olmayabilir; template service null'ları kontrol edip eski format'a
// graceful fallback yapar.
public record AnalysisCompletedEvent(
    Guid TransactionId,
    Guid UserId,
    bool IsAnomaly,
    double AnomalyScore,
    double RiskScore,
    string RiskLevel,
    string Explanation,
    string ModelVersion,
    string? CategoryName = null,
    decimal? Amount = null,
    string? Description = null,
    DateTime? TransactionDate = null);
