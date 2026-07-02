using MediatR;

namespace NotificationService.Application.Features.Notifications.GetUnreadCount;

public record GetUnreadCountQuery : IRequest<int>;
