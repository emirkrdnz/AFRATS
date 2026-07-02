namespace TransactionService.Application.Features.Transactions.GetSummary;

using MediatR;
using TransactionService.Application.DTOs.Transaction;

public record GetMonthlySummaryQuery(
    Guid UserId,
    int? Month = null,
    int? Year = null) : IRequest<MonthlySummaryDto>;
