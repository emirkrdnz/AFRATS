using System.Text;
using System.Text.Json;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NotificationService.Application.DTOs.Events;
using NotificationService.Application.Features.Notifications.ProcessAnalysisCompleted;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace NotificationService.Infrastructure.EventConsumers;

public class AnalysisCompletedConsumer(
    IServiceScopeFactory scopeFactory,
    IOptions<RabbitMqSettings> rabbitOptions,
    ILogger<AnalysisCompletedConsumer> logger)
    : BackgroundService
{
    private const string ExchangeName = "afrats.ml";
    private const string QueueName = "notif.analysis.completed";
    private const string RoutingKey = "analysis.completed";

    private readonly RabbitMqSettings _settings = rabbitOptions.Value;
    private IConnection? _connection;
    private IChannel? _channel;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await InitializeRabbitMqAsync(stoppingToken);

        // Keep the service alive until cancellation
        await Task.Delay(Timeout.Infinite, stoppingToken).ContinueWith(_ => { });

        logger.LogInformation("AnalysisCompletedConsumer stopping.");
    }

    private async Task InitializeRabbitMqAsync(CancellationToken ct)
    {
        var attempt = 0;
        var delay = TimeSpan.FromSeconds(2);
        var maxDelay = TimeSpan.FromSeconds(30);

        while (!ct.IsCancellationRequested)
        {
            attempt++;
            try
            {
                var factory = new ConnectionFactory
                {
                    HostName = _settings.HostName,
                    Port = _settings.Port,
                    UserName = _settings.UserName,
                    Password = _settings.Password,
                    AutomaticRecoveryEnabled = true,
                    NetworkRecoveryInterval = TimeSpan.FromSeconds(10),
                    TopologyRecoveryEnabled = true
                };

                _connection = await factory.CreateConnectionAsync(ct);
                _channel = await _connection.CreateChannelAsync(cancellationToken: ct);

                await _channel.ExchangeDeclareAsync(
                    exchange: ExchangeName,
                    type: "topic",
                    durable: true,
                    cancellationToken: ct);

                await _channel.QueueDeclareAsync(
                    queue: QueueName,
                    durable: true,
                    exclusive: false,
                    autoDelete: false,
                    cancellationToken: ct);

                await _channel.QueueBindAsync(
                    queue: QueueName,
                    exchange: ExchangeName,
                    routingKey: RoutingKey,
                    cancellationToken: ct);

                await _channel.BasicQosAsync(prefetchSize: 0, prefetchCount: 10, global: false, cancellationToken: ct);

                var consumer = new AsyncEventingBasicConsumer(_channel);
                consumer.ReceivedAsync += HandleMessageAsync;

                await _channel.BasicConsumeAsync(
                    queue: QueueName,
                    autoAck: false,
                    consumer: consumer,
                    cancellationToken: ct);

                logger.LogInformation(
                    "AnalysisCompletedConsumer started on attempt {Attempt}. Listening on queue: {Queue}",
                    attempt, QueueName);
                return;
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                try { _channel?.Dispose(); } catch { }
                try { _connection?.Dispose(); } catch { }
                _channel = null;
                _connection = null;

                logger.LogWarning(
                    "AnalysisCompletedConsumer RabbitMQ connect attempt {Attempt} failed: {Reason}. Retrying in {Delay}s.",
                    attempt, ex.Message, delay.TotalSeconds);

                await Task.Delay(delay, ct);
                delay = TimeSpan.FromSeconds(Math.Min(maxDelay.TotalSeconds, delay.TotalSeconds * 2));
            }
        }
    }

    private async Task HandleMessageAsync(object sender, BasicDeliverEventArgs ea)
    {
        var body = Encoding.UTF8.GetString(ea.Body.ToArray());
        logger.LogInformation(
            "analysis.completed received. DeliveryTag={Tag}", ea.DeliveryTag);

        try
        {
            var @event = JsonSerializer.Deserialize<AnalysisCompletedEvent>(body,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (@event is null)
            {
                logger.LogWarning("analysis.completed payload could not be deserialized. Body={Body}", body);
                await _channel!.BasicNackAsync(ea.DeliveryTag, multiple: false, requeue: false);
                return;
            }

            using var scope = scopeFactory.CreateScope();
            var sender2 = scope.ServiceProvider.GetRequiredService<ISender>();

            var command = new ProcessAnalysisCompletedCommand(
                @event.TransactionId,
                @event.UserId,
                @event.IsAnomaly,
                @event.AnomalyScore,
                @event.RiskScore,
                @event.RiskLevel,
                @event.Explanation,
                @event.CategoryName,
                @event.Amount,
                @event.Description,
                @event.TransactionDate);

            await sender2.Send(command);
            await _channel!.BasicAckAsync(ea.DeliveryTag, multiple: false);
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "Event processing failed: analysis.completed, DeliveryTag={Tag}", ea.DeliveryTag);
            await _channel!.BasicNackAsync(ea.DeliveryTag, multiple: false, requeue: false);
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await base.StopAsync(cancellationToken);

        if (_channel is not null)
        {
            await _channel.CloseAsync(cancellationToken);
            _channel.Dispose();
        }

        if (_connection is not null)
        {
            await _connection.CloseAsync(cancellationToken);
            _connection.Dispose();
        }
    }
}
