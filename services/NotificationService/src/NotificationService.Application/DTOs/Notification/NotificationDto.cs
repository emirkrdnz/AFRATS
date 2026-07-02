namespace NotificationService.Application.DTOs.Notification;

public record NotificationDto(
    Guid Id,
    string Type,
    string Title,
    string Message,
    bool IsRead,
    string Channel,
    Guid? RelatedId,
    DateTime CreatedAt,
    DateTime? ReadAt);
