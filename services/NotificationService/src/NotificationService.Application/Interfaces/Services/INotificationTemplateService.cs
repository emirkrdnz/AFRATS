namespace NotificationService.Application.Interfaces.Services;

// Tone/copy + action context — alert mesajları severity bantlarına göre
// farklılaşır (mild / notable / critical). categoryName/amount/date nullable;
// eski event'ler bunları taşımıyorsa template eski generic format'a düşer.
public interface INotificationTemplateService
{
    // Anomaly templates — severity'ye göre title differentiation (anomaly score
    // bandı). Human-readable context (category, amount, date) inject edilir.
    string GenerateAnomalyAlertTitle(double anomalyScore);
    string GenerateAnomalyAlertMessage(
        Guid transactionId,
        double anomalyScore,
        double riskScore,
        string? categoryName,
        decimal? amount,
        string? description,
        DateTime? transactionDate);

    // High risk templates — severity bantları (70-80, 80-90, 90+) → tone shift.
    string GenerateHighRiskTitle(double riskScore);
    string GenerateHighRiskMessage(double riskScore, string riskLevel, double previousScore);
    string GenerateHighRiskEmailSubject(double riskScore);
    string GenerateHighRiskEmailBody(
        Guid userId,
        double riskScore,
        string riskLevel,
        Guid transactionId,
        double previousScore,
        // Action context — varsa UUID yerine "Grocery — TRY 25,000 on 12 May 2026"
        string? categoryName = null,
        decimal? amount = null,
        string? description = null,
        DateTime? transactionDate = null);
}
