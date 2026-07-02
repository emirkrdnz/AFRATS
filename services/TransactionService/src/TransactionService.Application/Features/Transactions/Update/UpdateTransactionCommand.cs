namespace TransactionService.Application.Features.Transactions.Update;

using MediatR;
using TransactionService.Application.DTOs.Transaction;

public record UpdateTransactionCommand(
    Guid Id,
    decimal Amount,
    string Type,
    Guid CategoryId,
    DateTime TransactionDate,
    string? Description,
    Guid UserId) : IRequest<TransactionDto>;
