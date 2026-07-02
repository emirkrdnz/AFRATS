namespace TransactionService.Application.Features.Transactions.Update;

using AutoMapper;
using MediatR;
using TransactionService.Application.DTOs.Transaction;
using TransactionService.Application.Interfaces;
using TransactionService.Application.Interfaces.Repositories;
using TransactionService.Domain.Enums;
using TransactionService.Domain.Exceptions;

public class UpdateTransactionCommandHandler(
    ITransactionRepository transactionRepository,
    ICategoryRepository categoryRepository,
    IUnitOfWork unitOfWork,
    IMapper mapper) : IRequestHandler<UpdateTransactionCommand, TransactionDto>
{
    public async Task<TransactionDto> Handle(UpdateTransactionCommand request, CancellationToken cancellationToken)
    {
        var transaction = await transactionRepository.GetByIdAsync(request.Id, request.UserId, cancellationToken)
            ?? throw new NotFoundException($"Transaction with ID '{request.Id}' not found.");

        var categoryExists = await categoryRepository.ExistsForUserAsync(request.CategoryId, request.UserId, cancellationToken);
        if (!categoryExists)
            throw new NotFoundException($"Category with ID '{request.CategoryId}' not found.");

        if (!Enum.TryParse<TransactionType>(request.Type, true, out var transactionType))
            throw new BadRequestException($"Invalid transaction type: '{request.Type}'. Must be 'Income' or 'Expense'.");

        transaction.Amount = request.Amount;
        transaction.Type = transactionType;
        transaction.CategoryId = request.CategoryId;
        transaction.TransactionDate = request.TransactionDate;
        transaction.Description = request.Description?.Trim();
        transaction.UpdatedAt = DateTime.UtcNow;

        // IK-05: No transaction.created event on update
        await unitOfWork.SaveChangesAsync(cancellationToken);

        var updated = await transactionRepository.GetByIdWithCategoryAsync(transaction.Id, request.UserId, cancellationToken);
        return mapper.Map<TransactionDto>(updated!);
    }
}
