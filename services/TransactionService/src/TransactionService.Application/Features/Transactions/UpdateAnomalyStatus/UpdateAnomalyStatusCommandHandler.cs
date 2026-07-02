namespace TransactionService.Application.Features.Transactions.UpdateAnomalyStatus;

using MediatR;
using Microsoft.Extensions.Logging;
using TransactionService.Application.Interfaces;
using TransactionService.Application.Interfaces.Repositories;

public class UpdateAnomalyStatusCommandHandler(
    ITransactionRepository transactionRepository,
    IUnitOfWork unitOfWork,
    ILogger<UpdateAnomalyStatusCommandHandler> logger) : IRequestHandler<UpdateAnomalyStatusCommand, Unit>
{
    public async Task<Unit> Handle(UpdateAnomalyStatusCommand request, CancellationToken cancellationToken)
    {
        // IK-05: If transaction not found (deleted or invalid ID), log and acknowledge
        var transaction = await transactionRepository.GetByIdAsync(request.TransactionId, request.UserId, cancellationToken);

        if (transaction is null)
        {
            logger.LogWarning(
                "Transaction {TransactionId} not found for anomaly update. Event acknowledged and skipped.",
                request.TransactionId);
            return Unit.Value;
        }

        // IK-06: Idempotent — same event processed multiple times produces same result
        transaction.IsAnomalous = request.IsAnomaly;
        transaction.AnomalyScore = request.AnomalyScore;
        transaction.UpdatedAt = DateTime.UtcNow;

        await unitOfWork.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Transaction {TransactionId} anomaly status updated. IsAnomalous: {IsAnomaly}, Score: {Score}",
            request.TransactionId, request.IsAnomaly, request.AnomalyScore);

        return Unit.Value;
    }
}
