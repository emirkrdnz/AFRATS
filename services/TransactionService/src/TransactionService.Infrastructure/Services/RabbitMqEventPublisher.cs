namespace TransactionService.Infrastructure.Services;

using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using RabbitMQ.Client;
using TransactionService.Application.DTOs.Events;
using TransactionService.Application.Interfaces.Services;

public class RabbitMqEventPublisher : IEventPublisher, IAsyncDisposable
{
    private readonly ILogger<RabbitMqEventPublisher> _logger;
    private readonly IConnection? _connection;
    private readonly IChannel? _channel;
    private readonly bool _isConnected;

    private const string ExchangeName = "afrats.transactions";
    private const string RoutingKey = "transaction.created";

    public RabbitMqEventPublisher(IConfiguration configuration, ILogger<RabbitMqEventPublisher> logger)
    {
        _logger = logger;

        try
        {
            var factory = new ConnectionFactory
            {
                HostName = configuration["RabbitMQ:HostName"] ?? "localhost",
                Port = int.Parse(configuration["RabbitMQ:Port"] ?? "5672"),
                UserName = configuration["RabbitMQ:UserName"] ?? "guest",
                Password = configuration["RabbitMQ:Password"] ?? "guest"
            };

            _connection = factory.CreateConnectionAsync().GetAwaiter().GetResult();
            _channel = _connection.CreateChannelAsync().GetAwaiter().GetResult();

            // Declare exchange (idempotent)
            _channel.ExchangeDeclareAsync(
                exchange: ExchangeName,
                type: ExchangeType.Topic,
                durable: true).GetAwaiter().GetResult();

            _isConnected = true;
            _logger.LogInformation("RabbitMQ connection established. Exchange: {Exchange}", ExchangeName);
        }
        catch (Exception ex)
        {
            _isConnected = false;
            _logger.LogWarning(ex, "RabbitMQ connection failed. Events will not be published.");
        }
    }

    public async Task PublishTransactionCreatedAsync(TransactionCreatedEvent @event, CancellationToken cancellationToken)
    {
        if (!_isConnected || _channel is null)
        {
            _logger.LogWarning(
                "RabbitMQ not connected. Skipping event publish for Transaction {TransactionId}.",
                @event.TransactionId);
            return;
        }

        try
        {
            var json = JsonSerializer.Serialize(@event, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });

            var body = Encoding.UTF8.GetBytes(json);

            var properties = new BasicProperties
            {
                ContentType = "application/json",
                DeliveryMode = DeliveryModes.Persistent,
                MessageId = Guid.NewGuid().ToString(),
                Timestamp = new AmqpTimestamp(DateTimeOffset.UtcNow.ToUnixTimeSeconds())
            };

            await _channel.BasicPublishAsync(
                exchange: ExchangeName,
                routingKey: RoutingKey,
                mandatory: false,
                basicProperties: properties,
                body: body,
                cancellationToken: cancellationToken);

            _logger.LogInformation(
                "Published transaction.created event for Transaction {TransactionId}.",
                @event.TransactionId);
        }
        catch (Exception ex)
        {
            // IK-09: Fire-and-forget — log failure but don't throw
            _logger.LogError(ex,
                "Failed to publish transaction.created event for Transaction {TransactionId}.",
                @event.TransactionId);
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_channel is not null)
            await _channel.CloseAsync();

        if (_connection is not null)
            await _connection.CloseAsync();
    }
}
