namespace TransactionService.Application.Features.Transactions.Delete;

using MediatR;

public record DeleteTransactionCommand(Guid Id, Guid UserId) : IRequest<Unit>;
