namespace TransactionService.Application.Features.Transactions.Create;

using AutoMapper;
using MediatR;
using TransactionService.Application.DTOs.Events;
using TransactionService.Application.DTOs.Transaction;
using TransactionService.Application.Interfaces;
using TransactionService.Application.Interfaces.Repositories;
using TransactionService.Application.Interfaces.Services;
using TransactionService.Domain.Entities;
using TransactionService.Domain.Enums;
using TransactionService.Domain.Exceptions;

public class CreateTransactionCommandHandler(
    ITransactionRepository transactionRepository,
    ICategoryRepository categoryRepository,
    IEventPublisher eventPublisher,
    IUnitOfWork unitOfWork,
    IMapper mapper) : IRequestHandler<CreateTransactionCommand, TransactionDto>
{
    public async Task<TransactionDto> Handle(CreateTransactionCommand request, CancellationToken cancellationToken)
    {
        // Validate category exists and is accessible by user
        var categoryExists = await categoryRepository.ExistsForUserAsync(request.CategoryId, request.UserId, cancellationToken);
        if (!categoryExists)
            throw new NotFoundException($"Category with ID '{request.CategoryId}' not found.");

        // Parse transaction type
        if (!Enum.TryParse<TransactionType>(request.Type, true, out var transactionType))
            throw new BadRequestException($"Invalid transaction type: '{request.Type}'. Must be 'Income' or 'Expense'.");

        // Create entity
        var transaction = new Transaction
        {
            Id = Guid.NewGuid(),
            UserId = request.UserId,
            CategoryId = request.CategoryId,
            Amount = request.Amount,
            Type = transactionType,
            Description = request.Description?.Trim(),
            TransactionDate = request.TransactionDate,
            IsAnomalous = false,
            AnomalyScore = null,
            CreatedAt = DateTime.UtcNow
        };

        await transactionRepository.AddAsync(transaction, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        // Publish event (fire-and-forget, don't rollback transaction on failure)
        try
        {
            var userHistory = await transactionRepository.GetUserHistoryAsync(request.UserId, 90, cancellationToken);

            // Category lookup — name'i event payload'una koymak için. Existence
            // check yukarıda yapılmıştı; bu cache'lenmiş row'u getirir, ekstra
            // round-trip ama notification message'ının human-readable olması
            // için kritik. Null fallback (race condition) → "Unknown category".
            var category = await categoryRepository.GetByIdAsync(transaction.CategoryId, cancellationToken);
            var categoryName = category?.Name ?? "Unknown";

            var @event = new TransactionCreatedEvent(
                TransactionId: transaction.Id,
                UserId: transaction.UserId,
                Amount: transaction.Amount,
                Type: transaction.Type.ToString(),
                CategoryId: transaction.CategoryId,
                CategoryName: categoryName,
                Description: transaction.Description,
                TransactionDate: transaction.TransactionDate,
                UserHistory: userHistory.Select(t => new TransactionHistoryItem(
                    Amount: t.Amount,
                    Type: t.Type.ToString(),
                    CategoryId: t.CategoryId,
                    TransactionDate: t.TransactionDate)).ToList());

            await eventPublisher.PublishTransactionCreatedAsync(@event, cancellationToken);
        }
        catch (Exception)
        {
            // IK-09: Event failure does not rollback the transaction. Log and continue.
            // Logging will be handled by the infrastructure layer's publisher implementation.
        }

        // Reload with category for response
        var saved = await transactionRepository.GetByIdWithCategoryAsync(transaction.Id, request.UserId, cancellationToken);
        return mapper.Map<TransactionDto>(saved!);
    }
}
