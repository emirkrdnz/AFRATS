namespace TransactionService.Application.Features.Transactions.GetById;

using MediatR;
using TransactionService.Application.DTOs.Transaction;

public record GetTransactionByIdQuery(Guid Id, Guid UserId) : IRequest<TransactionDto>;
