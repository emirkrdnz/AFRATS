namespace TransactionService.Infrastructure.EventConsumers;

using System.Text;
using System.Text.Json;
using MediatR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using TransactionService.Application.DTOs.Events;
using TransactionService.Application.Features.Transactions.UpdateAnomalyStatus;

public class AnalysisCompletedConsumer : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AnalysisCompletedConsumer> _logger;
    private readonly IConfiguration _configuration;
    private IConnection? _connection;
    private IChannel? _channel;

    private const string ExchangeName = "afrats.ml";
    private const string QueueName = "txn.analysis.completed";
    private const string RoutingKey = "analysis.completed";

    public AnalysisCompletedConsumer(
        IServiceScopeFactory scopeFactory,
        ILogger<AnalysisCompletedConsumer> logger,
        IConfiguration configuration)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _configuration = configuration;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Retry-with-backoff: RabbitMQ container may not be ready at startup
        // (race condition during compose-up). Previously this method returned
        // permanently on first failure, silently disabling anomaly status
        // propagation — Dashboard showed 0 anomalies forever. Now it retries
        // every 5s until cancelled, so the consumer self-heals.
        var attempt = 0;
        while (!stoppingToken.IsCancellationRequested && _channel is null)
        {
            try
            {
                attempt++;
                await InitializeRabbitMqAsync();
                break;
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                _logger.LogWarning(
                    ex,
                    "RabbitMQ consumer connection attempt {Attempt} failed. Retrying in 5s…",
                    attempt);
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }

        if (_channel is null) return;  // cancelled before connecting

        var consumer = new AsyncEventingBasicConsumer(_channel);

        consumer.ReceivedAsync += async (_, ea) =>
        {
            try
            {
                var body = ea.Body.ToArray();
                var json = Encoding.UTF8.GetString(body);

                var @event = JsonSerializer.Deserialize<AnalysisCompletedEvent>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                if (@event is null)
                {
                    _logger.LogWarning("Received null analysis.completed event. Acknowledging and skipping.");
                    await _channel.BasicAckAsync(ea.DeliveryTag, false);
                    return;
                }

                // Create a new scope for each message (scoped DbContext)
                using var scope = _scopeFactory.CreateScope();
                var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();

                var command = new UpdateAnomalyStatusCommand(
                    TransactionId: @event.TransactionId,
                    UserId: @event.UserId,
                    IsAnomaly: @event.IsAnomaly,
                    AnomalyScore: @event.AnomalyScore);

                await mediator.Send(command, stoppingToken);

                // Acknowledge after successful processing
                await _channel.BasicAckAsync(ea.DeliveryTag, false);

                _logger.LogInformation(
                    "Processed analysis.completed event for Transaction {TransactionId}.",
                    @event.TransactionId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing analysis.completed event. Negative acknowledging.");

                // Nack with requeue=false to avoid infinite loop; message goes to dead-letter if configured
                await _channel.BasicNackAsync(ea.DeliveryTag, false, false);
            }
        };

        await _channel.BasicConsumeAsync(
            queue: QueueName,
            autoAck: false,
            consumer: consumer,
            cancellationToken: stoppingToken);

        _logger.LogInformation("Started consuming analysis.completed events from queue {Queue}.", QueueName);

        // Keep the background service alive
        await Task.Delay(Timeout.Infinite, stoppingToken);
    }

    private async Task InitializeRabbitMqAsync()
    {
        var factory = new ConnectionFactory
        {
            HostName = _configuration["RabbitMQ:HostName"] ?? "localhost",
            Port = int.Parse(_configuration["RabbitMQ:Port"] ?? "5672"),
            UserName = _configuration["RabbitMQ:UserName"] ?? "guest",
            Password = _configuration["RabbitMQ:Password"] ?? "guest"
        };

        _connection = await factory.CreateConnectionAsync();
        _channel = await _connection.CreateChannelAsync();

        // Declare exchange (idempotent)
        await _channel.ExchangeDeclareAsync(
            exchange: ExchangeName,
            type: ExchangeType.Topic,
            durable: true);

        // Declare queue
        await _channel.QueueDeclareAsync(
            queue: QueueName,
            durable: true,
            exclusive: false,
            autoDelete: false);

        // Bind queue to exchange
        await _channel.QueueBindAsync(
            queue: QueueName,
            exchange: ExchangeName,
            routingKey: RoutingKey);

        // Prefetch 1 — process one message at a time
        await _channel.BasicQosAsync(prefetchSize: 0, prefetchCount: 1, global: false);
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        if (_channel is not null) await _channel.CloseAsync();
        if (_connection is not null) await _connection.CloseAsync();

        _logger.LogInformation("RabbitMQ consumer stopped.");
        await base.StopAsync(cancellationToken);
    }
}
