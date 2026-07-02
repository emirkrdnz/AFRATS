namespace TransactionService.Application.Interfaces.Services;

using TransactionService.Application.DTOs.Events;

public interface IEventPublisher
{
    Task PublishTransactionCreatedAsync(TransactionCreatedEvent @event, CancellationToken cancellationToken = default);
}
