namespace TransactionService.Application.Features.Admin.GetUserTransactions;

using AutoMapper;
using MediatR;
using TransactionService.Application.DTOs.Common;
using TransactionService.Application.DTOs.Transaction;
using TransactionService.Application.Interfaces.Repositories;

public class GetAdminUserTransactionsQueryHandler(
    ITransactionRepository transactionRepository,
    IMapper mapper) : IRequestHandler<GetAdminUserTransactionsQuery, PagedResult<TransactionDto>>
{
    public async Task<PagedResult<TransactionDto>> Handle(GetAdminUserTransactionsQuery request, CancellationToken cancellationToken)
    {
        var pageSize = Math.Clamp(request.PageSize, 1, 100);
        var page = Math.Max(request.Page, 1);

        // IK-03: Invalid userId returns empty list, not 404 (hides user existence)
        var (items, totalCount) = await transactionRepository.GetPagedForAdminAsync(
            request.TargetUserId,
            request.StartDate,
            request.EndDate,
            request.CategoryId,
            request.Type,
            page,
            pageSize,
            cancellationToken);

        var dtos = mapper.Map<List<TransactionDto>>(items);

        return new PagedResult<TransactionDto>(dtos, page, pageSize, totalCount);
    }
}
