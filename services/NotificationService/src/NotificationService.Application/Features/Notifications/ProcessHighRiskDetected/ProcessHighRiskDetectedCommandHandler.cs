using MediatR;
using Microsoft.Extensions.Logging;
using NotificationService.Application.Interfaces;
using NotificationService.Application.Interfaces.Repositories;
using NotificationService.Application.Interfaces.Services;
using NotificationService.Domain.Entities;
using NotificationService.Domain.Enums;

namespace NotificationService.Application.Features.Notifications.ProcessHighRiskDetected;

public sealed class ProcessHighRiskDetectedCommandHandler(
    INotificationRepository notificationRepository,
    INotificationPreferenceRepository preferenceRepository,
    INotificationTemplateService templateService,
    IEmailService emailService,
    IUnitOfWork unitOfWork,
    ILogger<ProcessHighRiskDetectedCommandHandler> logger)
    : IRequestHandler<ProcessHighRiskDetectedCommand>
{
    // Smart dedup window — same risk level within this period → no new alert.
    // User'ın hesabı High band'a girdiyse 1 saat içinde her tx için tekrar
    // alert spammelenmemeli (eski davranış: 5 tx High → 5 notification).
    // Per-tx relatedId check (alttaki ExistsByRelatedIdAndType) sadece "aynı
    // tx 2 kez işlenirse" durumunu blokluyordu, asıl problem değildi.
    private static readonly TimeSpan HighRiskDedupWindow = TimeSpan.FromHours(1);

    public async Task Handle(ProcessHighRiskDetectedCommand request, CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "high.risk.detected received: user={UserId}, score={RiskScore}",
            request.UserId, request.RiskScore);

        var preference = await GetOrCreatePreferenceAsync(request.UserId, cancellationToken);

        // Severity-aware copy — title risk band'ına göre değişir (≥90 Critical,
        // 80-90 High, 70-80 Elevated). Message delta + tonal shift.
        var title = templateService.GenerateHighRiskTitle(request.RiskScore);
        var message = templateService.GenerateHighRiskMessage(
            request.RiskScore, request.RiskLevel, request.PreviousScore);

        // Dedup key — risk LEVEL'a göre, score'a değil. Aynı High band'a 5 tx
        // ardarda gelse de tek alert; Medium→High geçişi (farklı level)
        // sıfırdan alert üretir.
        var dedupKey = $"risk:{request.RiskLevel}";

        // Step 1: In-app notification — HER ZAMAN kaydet (Option B / industry
        // standard). InAppEnabled toggle artık inbox kaydını engellemiyor;
        // sadece frontend toast popup'ı baskılanıyor (MainLayout preference
        // fetch eder + gate eder). Inbox geçmişi her zaman dolu kalır.
        {
            // Önce smart dedup — son 1 saat içinde aynı level alert var mı?
            var dedupHit = await notificationRepository.ExistsRecentByDedupKeyAsync(
                request.UserId, dedupKey, HighRiskDedupWindow, cancellationToken);

            // Eski per-tx check (fallback için kalır — aynı tx 2 kez işlenirse).
            var sameTxExists = await notificationRepository.ExistsByRelatedIdAndTypeAsync(
                request.UserId,
                request.TransactionId,
                NotificationType.HighRisk,
                NotificationChannel.InApp,
                cancellationToken);

            if (!dedupHit && !sameTxExists)
            {
                var inAppNotification = new Notification
                {
                    UserId = request.UserId,
                    Type = NotificationType.HighRisk,
                    Channel = NotificationChannel.InApp,
                    Title = title,
                    Message = message,
                    RelatedId = request.TransactionId,
                    DedupKey = dedupKey,
                    IsRead = false
                };

                await notificationRepository.AddAsync(inAppNotification, cancellationToken);
                logger.LogInformation(
                    "Notification created: {NotificationId}, type=HighRisk, channel=InApp, user={UserId}, dedupKey={Key}",
                    inAppNotification.Id, request.UserId, dedupKey);
            }
            else if (dedupHit)
            {
                logger.LogInformation(
                    "Dedup hit: user={UserId}, key={Key}, window={Window}h — notification suppressed",
                    request.UserId, dedupKey, HighRiskDedupWindow.TotalHours);
            }
            else
            {
                logger.LogWarning(
                    "Duplicate notification blocked: relatedId={TransactionId}, type=HighRisk, channel=InApp",
                    request.TransactionId);
            }
        }

        // Step 2: Email notification — email adresi NotificationPreference'tan
        // okunur (request.UserEmail null çünkü MLService event payload'ında
        // taşımıyor). Preference.Email kullanıcı /settings sayfasını ilk
        // açtığında JWT email claim'inden cache'lendi.
        var emailToUse = preference.Email ?? request.UserEmail;
        if (preference.EmailEnabled && !string.IsNullOrWhiteSpace(emailToUse))
        {
            // Email dedup — InApp ile aynı dedupKey/window. Eğer InApp az önce
            // dedup'tan dolayı atlandıysa, email de spam'lenmemeli. NOT: InApp
            // bu çağrıda yeni oluşturulduysa SaveChanges'ten önce in-memory
            // change tracker'da var, repository check yine "any" döner (EF
            // tracking). Yine de explicit check ettim ki email branch
            // InApp-disabled durumlarda da güvenli olsun.
            var emailDedupHit = await notificationRepository.ExistsRecentByDedupKeyAsync(
                request.UserId, dedupKey, HighRiskDedupWindow, cancellationToken);

            if (emailDedupHit)
            {
                logger.LogInformation(
                    "Email dedup hit: user={UserId}, key={Key} — email suppressed",
                    request.UserId, dedupKey);
            }
            else
            {
                try
                {
                    var subject = templateService.GenerateHighRiskEmailSubject(request.RiskScore);
                    var body = templateService.GenerateHighRiskEmailBody(
                        request.UserId,
                        request.RiskScore,
                        request.RiskLevel,
                        request.TransactionId,
                        request.PreviousScore,
                        // Action context — UUID yerine "Grocery — TRY 60.000,00 on 05 Jun 2026"
                        request.CategoryName,
                        request.Amount,
                        request.Description,
                        request.TransactionDate);

                    await emailService.SendHighRiskAlertAsync(
                        emailToUse, subject, body, cancellationToken);

                    var emailNotification = new Notification
                    {
                        UserId = request.UserId,
                        Type = NotificationType.HighRisk,
                        Channel = NotificationChannel.Email,
                        Title = subject,
                        Message = message,
                        RelatedId = request.TransactionId,
                        DedupKey = dedupKey,
                        IsRead = true // Email notifications are auto-read
                    };

                    await notificationRepository.AddAsync(emailNotification, cancellationToken);

                    logger.LogInformation(
                        "Email sent: user={UserId}, to={Email}", request.UserId, emailToUse);
                }
                catch (Exception ex)
                {
                    // IK-07: Email failure must NOT affect other channels
                    logger.LogError(ex,
                        "Email could not be sent: user={UserId}, error={Error}",
                        request.UserId, ex.Message);
                }
            }
        }
        else if (!preference.EmailEnabled)
        {
            logger.LogInformation(
                "Channel skipped: user={UserId}, channel=Email, enabled=false", request.UserId);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private async Task<Domain.Entities.NotificationPreference> GetOrCreatePreferenceAsync(
        Guid userId, CancellationToken ct)
    {
        var preference = await preferenceRepository.GetByUserIdAsync(userId, ct);

        if (preference is not null)
            return preference;

        preference = new Domain.Entities.NotificationPreference { UserId = userId };
        await preferenceRepository.AddAsync(preference, ct);
        await unitOfWork.SaveChangesAsync(ct);

        return preference;
    }
}
