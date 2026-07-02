using MediatR;

namespace NotificationService.Application.Features.Notifications.MarkAsRead;

public record MarkAsReadCommand(Guid NotificationId) : IRequest;
