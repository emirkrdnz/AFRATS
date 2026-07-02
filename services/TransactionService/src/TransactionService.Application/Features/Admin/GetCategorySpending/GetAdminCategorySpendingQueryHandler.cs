namespace TransactionService.Application.Features.Admin.GetCategorySpending;

using MediatR;
using TransactionService.Application.DTOs.Admin;
using TransactionService.Application.Interfaces.Repositories;

public class GetAdminCategorySpendingQueryHandler(
    ITransactionRepository transactionRepository
) : IRequestHandler<GetAdminCategorySpendingQuery, List<AdminCategorySpendingDto>>
{
    public async Task<List<AdminCategorySpendingDto>> Handle(
        GetAdminCategorySpendingQuery request,
        CancellationToken cancellationToken)
    {
        var days = Math.Clamp(request.Days, 1, 365);
        var endDate   = DateTime.UtcNow.Date.AddDays(1);
        var startDate = endDate.AddDays(-days);

        var rows = await transactionRepository.GetCategorySpendingAsync(
            startDate, endDate, request.Type, cancellationToken);

        // En yüksek toplama göre sırala — donut chart için top N'i frontend seçer.
        return rows
            .OrderByDescending(r => r.TotalAmount)
            .ToList();
    }
}
