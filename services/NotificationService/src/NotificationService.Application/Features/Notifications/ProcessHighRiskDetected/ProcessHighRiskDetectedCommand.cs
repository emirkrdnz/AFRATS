using MediatR;

namespace NotificationService.Application.Features.Notifications.ProcessHighRiskDetected;

public record ProcessHighRiskDetectedCommand(
    Guid UserId,
    double RiskScore,
    string RiskLevel,
    Guid TransactionId,
    double PreviousScore,
    DateTime TriggeredAt,
    string? UserEmail,
    string? CategoryName = null,
    decimal? Amount = null,
    string? Description = null,
    DateTime? TransactionDate = null) : IRequest;
