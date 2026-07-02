namespace TransactionService.Application.Features.Transactions.GetAll;

using AutoMapper;
using MediatR;
using TransactionService.Application.DTOs.Common;
using TransactionService.Application.DTOs.Transaction;
using TransactionService.Application.Interfaces.Repositories;

public class GetTransactionsQueryHandler(
    ITransactionRepository transactionRepository,
    IMapper mapper) : IRequestHandler<GetTransactionsQuery, PagedResult<TransactionDto>>
{
    public async Task<PagedResult<TransactionDto>> Handle(GetTransactionsQuery request, CancellationToken cancellationToken)
    {
        var pageSize = Math.Clamp(request.PageSize, 1, 100);
        var page = Math.Max(request.Page, 1);

        var (items, totalCount) = await transactionRepository.GetPagedAsync(
            request.UserId,
            request.StartDate,
            request.EndDate,
            request.CategoryId,
            request.Type,
            request.Search,
            request.MinAmount,
            request.MaxAmount,
            page,
            pageSize,
            cancellationToken);

        var dtos = mapper.Map<List<TransactionDto>>(items);

        return new PagedResult<TransactionDto>(dtos, page, pageSize, totalCount);
    }
}