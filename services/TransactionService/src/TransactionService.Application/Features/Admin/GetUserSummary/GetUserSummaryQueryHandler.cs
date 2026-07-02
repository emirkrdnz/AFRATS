namespace TransactionService.Application.Features.Admin.GetUserSummary;

using MediatR;
using TransactionService.Application.DTOs.Admin;
using TransactionService.Application.Interfaces.Repositories;

public class GetUserSummaryQueryHandler(
    ITransactionRepository transactionRepository
) : IRequestHandler<GetUserSummaryQuery, AdminUserSummaryDto>
{
    public async Task<AdminUserSummaryDto> Handle(
        GetUserSummaryQuery request,
        CancellationToken cancellationToken)
    {
        return await transactionRepository.GetUserSummaryAsync(
            request.TargetUserId, cancellationToken);
    }
}
