namespace TransactionService.Application.Features.Admin.GetStats;

using MediatR;
using TransactionService.Application.DTOs.Admin;
using TransactionService.Application.Interfaces.Repositories;

public class GetAdminStatsQueryHandler(
    ITransactionRepository transactionRepository) : IRequestHandler<GetAdminStatsQuery, AdminStatsDto>
{
    public async Task<AdminStatsDto> Handle(GetAdminStatsQuery request, CancellationToken cancellationToken)
    {
        var totalCount = await transactionRepository.GetTotalCountAsync(
            request.StartDate, request.EndDate, cancellationToken);

        var totalIncome = await transactionRepository.GetTotalAmountByTypeAsync(
            "Income", request.StartDate, request.EndDate, cancellationToken);

        var totalExpense = await transactionRepository.GetTotalAmountByTypeAsync(
            "Expense", request.StartDate, request.EndDate, cancellationToken);

        var anomalyCount = await transactionRepository.GetAnomalyCountAsync(
            request.StartDate, request.EndDate, cancellationToken);

        return new AdminStatsDto(totalCount, totalIncome, totalExpense, anomalyCount);
    }
}
