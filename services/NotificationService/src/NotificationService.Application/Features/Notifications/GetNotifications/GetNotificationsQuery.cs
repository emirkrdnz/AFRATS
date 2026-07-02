using MediatR;
using NotificationService.Application.DTOs.Common;
using NotificationService.Application.DTOs.Notification;

namespace NotificationService.Application.Features.Notifications.GetNotifications;

public record GetNotificationsQuery(
    int Page,
    int PageSize,
    bool? IsRead) : IRequest<PagedResult<NotificationDto>>;
