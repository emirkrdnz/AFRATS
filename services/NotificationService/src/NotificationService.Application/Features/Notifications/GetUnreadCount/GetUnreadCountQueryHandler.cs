using MediatR;
using NotificationService.Application.Interfaces.Repositories;
using NotificationService.Application.Interfaces.Services;

namespace NotificationService.Application.Features.Notifications.GetUnreadCount;

public sealed class GetUnreadCountQueryHandler(
    INotificationRepository notificationRepository,
    ICurrentUserService currentUserService)
    : IRequestHandler<GetUnreadCountQuery, int>
{
    public async Task<int> Handle(GetUnreadCountQuery request, CancellationToken cancellationToken)
    {
        var userId = currentUserService.UserId;
        return await notificationRepository.GetUnreadCountAsync(userId, cancellationToken);
    }
}
