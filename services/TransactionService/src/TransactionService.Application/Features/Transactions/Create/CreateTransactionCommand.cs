namespace TransactionService.Application.Features.Transactions.Create;

using MediatR;
using TransactionService.Application.DTOs.Transaction;

public record CreateTransactionCommand(
    decimal Amount,
    string Type,
    Guid CategoryId,
    DateTime TransactionDate,
    string? Description,
    Guid UserId) : IRequest<TransactionDto>;
