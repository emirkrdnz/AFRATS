namespace TransactionService.Application.Features.Transactions.Delete;

using MediatR;
using TransactionService.Application.Interfaces;
using TransactionService.Application.Interfaces.Repositories;
using TransactionService.Domain.Exceptions;

public class DeleteTransactionCommandHandler(
    ITransactionRepository transactionRepository,
    IUnitOfWork unitOfWork) : IRequestHandler<DeleteTransactionCommand, Unit>
{
    public async Task<Unit> Handle(DeleteTransactionCommand request, CancellationToken cancellationToken)
    {
        var transaction = await transactionRepository.GetByIdAsync(request.Id, request.UserId, cancellationToken)
            ?? throw new NotFoundException($"Transaction with ID '{request.Id}' not found.");

        transaction.IsDeleted = true;
        transaction.UpdatedAt = DateTime.UtcNow;

        await unitOfWork.SaveChangesAsync(cancellationToken);

        return Unit.Value;
    }
}
