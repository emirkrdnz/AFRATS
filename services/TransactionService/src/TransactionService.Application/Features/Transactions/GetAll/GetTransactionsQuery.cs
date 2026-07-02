namespace TransactionService.Application.Features.Transactions.GetAll;

using MediatR;
using TransactionService.Application.DTOs.Common;
using TransactionService.Application.DTOs.Transaction;

public record GetTransactionsQuery(
    Guid UserId,
    int Page,
    int PageSize,
    DateTime? StartDate,
    DateTime? EndDate,
    Guid? CategoryId,
    string? Type,
    string? Search,
    decimal? MinAmount,
    decimal? MaxAmount) : IRequest<PagedResult<TransactionDto>>;