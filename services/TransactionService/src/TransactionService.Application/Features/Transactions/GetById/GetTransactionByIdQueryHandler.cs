namespace TransactionService.Application.Features.Transactions.GetById;

using AutoMapper;
using MediatR;
using TransactionService.Application.DTOs.Transaction;
using TransactionService.Application.Interfaces.Repositories;
using TransactionService.Domain.Exceptions;

public class GetTransactionByIdQueryHandler(
    ITransactionRepository transactionRepository,
    IMapper mapper) : IRequestHandler<GetTransactionByIdQuery, TransactionDto>
{
    public async Task<TransactionDto> Handle(GetTransactionByIdQuery request, CancellationToken cancellationToken)
    {
        var transaction = await transactionRepository.GetByIdWithCategoryAsync(request.Id, request.UserId, cancellationToken)
            ?? throw new NotFoundException($"Transaction with ID '{request.Id}' not found.");

        return mapper.Map<TransactionDto>(transaction);
    }
}
