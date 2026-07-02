namespace TransactionService.Application.Features.Admin.GetUserTransactions;

using MediatR;
using TransactionService.Application.DTOs.Common;
using TransactionService.Application.DTOs.Transaction;

public record GetAdminUserTransactionsQuery(
    Guid TargetUserId,
    int Page = 1,
    int PageSize = 20,
    DateTime? StartDate = null,
    DateTime? EndDate = null,
    Guid? CategoryId = null,
    string? Type = null) : IRequest<PagedResult<TransactionDto>>;
