using MediatR;
using Microsoft.Extensions.Logging;
using NotificationService.Application.Interfaces;
using NotificationService.Application.Interfaces.Repositories;
using NotificationService.Application.Interfaces.Services;
using NotificationService.Domain.Entities;
using NotificationService.Domain.Enums;

namespace NotificationService.Application.Features.Notifications.ProcessAnalysisCompleted;

public sealed class ProcessAnalysisCompletedCommandHandler(
    INotificationRepository notificationRepository,
    INotificationPreferenceRepository preferenceRepository,
    INotificationTemplateService templateService,
    IUnitOfWork unitOfWork,
    ILogger<ProcessAnalysisCompletedCommandHandler> logger)
    : IRequestHandler<ProcessAnalysisCompletedCommand>
{
    public async Task Handle(ProcessAnalysisCompletedCommand request, CancellationToken cancellationToken)
    {
        if (!request.IsAnomaly)
        {
            logger.LogInformation(
                "analysis.completed received: txn={TransactionId}, user={UserId}, isAnomaly=false — skipped",
                request.TransactionId, request.UserId);
            return;
        }

        var preference = await GetOrCreatePreferenceAsync(request.UserId, cancellationToken);

        // In-app davranışı (Option B / industry-standard): InAppEnabled
        // notification kaydını engellemiyor — kullanıcı her zaman /notifications
        // sayfasında geçmişi görebiliyor. Toggle sadece toast popup'ını
        // baskılar (frontend tarafında preference.inAppEnabled fetch edilip
        // gate edilir). Eski A davranışı (off → hiçbir şey kaydetme) inbox'ı
        // anlamsız kılıyordu.

        var alreadyExists = await notificationRepository.ExistsByRelatedIdAndTypeAsync(
            request.UserId,
            request.TransactionId,
            NotificationType.AnomalyAlert,
            NotificationChannel.InApp,
            cancellationToken);

        if (alreadyExists)
        {
            logger.LogWarning(
                "Duplicate notification blocked: relatedId={TransactionId}, type=AnomalyAlert",
                request.TransactionId);
            return;
        }

        var notification = new Notification
        {
            UserId = request.UserId,
            Type = NotificationType.AnomalyAlert,
            Channel = NotificationChannel.InApp,
            // Severity-aware title (anomaly score bandına göre) + context-enriched
            // message (categoryName/amount/date varsa human-readable). Context
            // alanları nullable; template eski format'a graceful fallback.
            Title = templateService.GenerateAnomalyAlertTitle(request.AnomalyScore),
            Message = templateService.GenerateAnomalyAlertMessage(
                request.TransactionId,
                request.AnomalyScore,
                request.RiskScore,
                request.CategoryName,
                request.Amount,
                request.Description,
                request.TransactionDate),
            RelatedId = request.TransactionId,
            IsRead = false
        };

        await notificationRepository.AddAsync(notification, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Notification created: {NotificationId}, type=AnomalyAlert, user={UserId}",
            notification.Id, request.UserId);
    }

    private async Task<NotificationPreference> GetOrCreatePreferenceAsync(
        Guid userId, CancellationToken ct)
    {
        var preference = await preferenceRepository.GetByUserIdAsync(userId, ct);

        if (preference is not null)
            return preference;

        preference = new NotificationPreference { UserId = userId };
        await preferenceRepository.AddAsync(preference, ct);
        await unitOfWork.SaveChangesAsync(ct);

        return preference;
    }
}