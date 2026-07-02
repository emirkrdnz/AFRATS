using MediatR;

namespace NotificationService.Application.Features.Notifications.ProcessAnalysisCompleted;

// Action context — event'ten forward edilir, template service'in human-readable
// mesaj üretmesi için. Eski event'lerde olmayabilir → nullable.
public record ProcessAnalysisCompletedCommand(
    Guid TransactionId,
    Guid UserId,
    bool IsAnomaly,
    double AnomalyScore,
    double RiskScore,
    string RiskLevel,
    string Explanation,
    string? CategoryName = null,
    decimal? Amount = null,
    string? Description = null,
    DateTime? TransactionDate = null) : IRequest;
