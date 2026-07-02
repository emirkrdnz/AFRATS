using System.Text;
using System.Text.Json;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NotificationService.Application.DTOs.Events;
using NotificationService.Application.Features.Notifications.ProcessHighRiskDetected;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace NotificationService.Infrastructure.EventConsumers;

public class HighRiskDetectedConsumer(
    IServiceScopeFactory scopeFactory,
    IOptions<RabbitMqSettings> rabbitOptions,
    ILogger<HighRiskDetectedConsumer> logger)
    : BackgroundService
{
    private const string ExchangeName = "afrats.ml";
    private const string QueueName = "notif.high.risk.detected";
    private const string RoutingKey = "high.risk.detected";

    private readonly RabbitMqSettings _settings = rabbitOptions.Value;
    private IConnection? _connection;
    private IChannel? _channel;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await InitializeRabbitMqAsync(stoppingToken);

        await Task.Delay(Timeout.Infinite, stoppingToken).ContinueWith(_ => { });

        logger.LogInformation("HighRiskDetectedConsumer stopping.");
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
                    "HighRiskDetectedConsumer started on attempt {Attempt}. Listening on queue: {Queue}",
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
                    "HighRiskDetectedConsumer RabbitMQ connect attempt {Attempt} failed: {Reason}. Retrying in {Delay}s.",
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
            "high.risk.detected received. DeliveryTag={Tag}", ea.DeliveryTag);

        try
        {
            var @event = JsonSerializer.Deserialize<HighRiskDetectedEvent>(body,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (@event is null)
            {
                logger.LogWarning("high.risk.detected payload could not be deserialized. Body={Body}", body);
                await _channel!.BasicNackAsync(ea.DeliveryTag, multiple: false, requeue: false);
                return;
            }

            using var scope = scopeFactory.CreateScope();
            var mediatorSender = scope.ServiceProvider.GetRequiredService<ISender>();

            var command = new ProcessHighRiskDetectedCommand(
                @event.UserId,
                @event.RiskScore,
                @event.RiskLevel,
                @event.TransactionId,
                @event.PreviousScore,
                @event.TriggeredAt,
                @event.UserEmail,
                @event.CategoryName,
                @event.Amount,
                @event.Description,
                @event.TransactionDate);

            await mediatorSender.Send(command);
            await _channel!.BasicAckAsync(ea.DeliveryTag, multiple: false);
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "Event processing failed: high.risk.detected, DeliveryTag={Tag}", ea.DeliveryTag);
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
