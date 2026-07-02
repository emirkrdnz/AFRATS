namespace TransactionService.Application.DTOs.Events;

// CategoryName + Description downstream NotificationService'in human-readable
// alert mesajı üretmesi için (eski sürümde sadece UUID gönderiliyordu, kullanıcı
// "Transaction abc-def..." UUID'sini görüp ne işlem olduğunu anlamıyordu).
// Producer category lookup yapıp eklemeli — alternatif olarak NotificationService
// her notification için TransactionService'e cross-service API call yapardı, bu
// daha kuplajlı ve yavaş olurdu.
// CategoryName non-nullable (publish-time fetch garanti); Description nullable
// (kullanıcı boş geçebilir).
public record TransactionCreatedEvent(
    Guid TransactionId,
    Guid UserId,
    decimal Amount,
    string Type,
    Guid CategoryId,
    string CategoryName,
    string? Description,
    DateTime TransactionDate,
    List<TransactionHistoryItem> UserHistory);

public record TransactionHistoryItem(
    decimal Amount,
    string Type,
    Guid CategoryId,
    DateTime TransactionDate);
