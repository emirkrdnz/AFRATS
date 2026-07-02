using MediatR;

namespace NotificationService.Application.Features.Notifications.MarkAllAsRead;

public record MarkAllAsReadCommand : IRequest<int>;
