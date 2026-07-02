namespace TransactionService.Application.Features.Transactions.UpdateAnomalyStatus;

using MediatR;

public record UpdateAnomalyStatusCommand(
    Guid TransactionId,
    Guid UserId,
    bool IsAnomaly,
    double AnomalyScore) : IRequest<Unit>;
