using MediatR;
using NotificationService.Application.Interfaces.Repositories;
using NotificationService.Application.Interfaces.Services;

namespace NotificationService.Application.Features.Notifications.MarkAllAsRead;

public sealed class MarkAllAsReadCommandHandler(
    INotificationRepository notificationRepository,
    ICurrentUserService currentUserService)
    : IRequestHandler<MarkAllAsReadCommand, int>
{
    public async Task<int> Handle(MarkAllAsReadCommand request, CancellationToken cancellationToken)
    {
        var userId = currentUserService.UserId;
        return await notificationRepository.MarkAllAsReadAsync(userId, cancellationToken);
    }
}
