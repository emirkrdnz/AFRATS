namespace TransactionService.Application.DTOs.Events;

public record AnalysisCompletedEvent(
    Guid TransactionId,
    Guid UserId,
    bool IsAnomaly,
    double AnomalyScore,
    decimal RiskScore,
    string RiskLevel);
