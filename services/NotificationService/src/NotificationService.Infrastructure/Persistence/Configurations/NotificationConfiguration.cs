using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using NotificationService.Domain.Entities;
using NotificationService.Domain.Enums;

namespace NotificationService.Infrastructure.Persistence.Configurations;

public class NotificationConfiguration : IEntityTypeConfiguration<Notification>
{
    public void Configure(EntityTypeBuilder<Notification> builder)
    {
        builder.ToTable("Notifications");

        builder.HasKey(n => n.Id);

        builder.Property(n => n.Id)
            .HasDefaultValueSql("NEWSEQUENTIALID()");

        builder.Property(n => n.UserId)
            .IsRequired();

        builder.Property(n => n.Type)
            .IsRequired()
            .HasMaxLength(50)
            .HasConversion<string>();

        builder.Property(n => n.Title)
            .IsRequired()
            .HasMaxLength(255);

        builder.Property(n => n.Message)
            .IsRequired()
            .HasMaxLength(1000);

        builder.Property(n => n.IsRead)
            .IsRequired()
            .HasDefaultValue(false);

        builder.Property(n => n.Channel)
            .IsRequired()
            .HasMaxLength(50)
            .HasConversion<string>();

        builder.Property(n => n.RelatedId)
            .IsRequired(false);

        builder.Property(n => n.CreatedAt)
            .IsRequired();

        builder.Property(n => n.ReadAt)
            .IsRequired(false);

        builder.Property(n => n.IsDeleted)
            .IsRequired()
            .HasDefaultValue(false);

        // Dedup key — same-signal-within-window suppression. Nullable çünkü
        // tüm notification tipleri dedup gerektirmez (AnomalyAlert her tx
        // benzersiz). Format "{signal}:{discriminator}" (ör. "risk:High").
        builder.Property(n => n.DedupKey)
            .IsRequired(false)
            .HasMaxLength(64);

        // Global query filter: soft delete
        builder.HasQueryFilter(n => !n.IsDeleted);

        // Indexes
        builder.HasIndex(n => new { n.UserId, n.IsRead, n.CreatedAt })
            .HasDatabaseName("IX_Notifications_UserId_IsRead_CreatedAt");

        builder.HasIndex(n => new { n.UserId, n.Channel, n.CreatedAt })
            .HasDatabaseName("IX_Notifications_UserId_Channel_CreatedAt");

        builder.HasIndex(n => new { n.UserId, n.Type })
            .HasDatabaseName("IX_Notifications_UserId_Type");

        builder.HasIndex(n => n.RelatedId)
            .HasDatabaseName("IX_Notifications_RelatedId");

        // Dedup lookup index — "son 60 dakikada UserId+DedupKey var mı"
        // sorgusu en sık çalışacak yer (handler her HighRisk event'te kontrol).
        builder.HasIndex(n => new { n.UserId, n.DedupKey, n.CreatedAt })
            .HasDatabaseName("IX_Notifications_UserId_DedupKey_CreatedAt");
    }
}
