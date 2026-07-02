using AutoMapper;
using MediatR;
using NotificationService.Application.DTOs.Common;
using NotificationService.Application.DTOs.Notification;
using NotificationService.Application.Interfaces;
using NotificationService.Application.Interfaces.Repositories;
using NotificationService.Application.Interfaces.Services;

namespace NotificationService.Application.Features.Notifications.GetNotifications;

public sealed class GetNotificationsQueryHandler(
    INotificationRepository notificationRepository,
    ICurrentUserService currentUserService,
    IMapper mapper)
    : IRequestHandler<GetNotificationsQuery, PagedResult<NotificationDto>>
{
    public async Task<PagedResult<NotificationDto>> Handle(
        GetNotificationsQuery request,
        CancellationToken cancellationToken)
    {
        var userId = currentUserService.UserId;

        var pagedResult = await notificationRepository.GetPagedAsync(
            userId,
            request.IsRead,
            request.Page,
            request.PageSize,
            cancellationToken);

        var dtos = mapper.Map<IReadOnlyList<NotificationDto>>(pagedResult.Items);

        return new PagedResult<NotificationDto>(
            dtos,
            pagedResult.TotalCount,
            pagedResult.Page,
            pagedResult.PageSize);
    }
}
