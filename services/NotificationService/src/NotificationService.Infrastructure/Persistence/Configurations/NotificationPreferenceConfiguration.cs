using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using NotificationService.Domain.Entities;

namespace NotificationService.Infrastructure.Persistence.Configurations;

public class NotificationPreferenceConfiguration : IEntityTypeConfiguration<NotificationPreference>
{
    public void Configure(EntityTypeBuilder<NotificationPreference> builder)
    {
        builder.ToTable("NotificationPreferences");

        builder.HasKey(p => p.Id);

        builder.Property(p => p.Id)
            .HasDefaultValueSql("NEWSEQUENTIALID()");

        builder.Property(p => p.UserId)
            .IsRequired();

        builder.Property(p => p.EmailEnabled)
            .IsRequired()
            .HasDefaultValue(true);

        builder.Property(p => p.PushEnabled)
            .IsRequired()
            .HasDefaultValue(true);

        builder.Property(p => p.InAppEnabled)
            .IsRequired()
            .HasDefaultValue(true);

        builder.Property(p => p.HighRiskEmailOnly)
            .IsRequired()
            .HasDefaultValue(false);

        builder.Property(p => p.FcmDeviceToken)
            .HasMaxLength(512)
            .IsRequired(false);

        builder.Property(p => p.Email)
            .HasMaxLength(256)
            .IsRequired(false);

        builder.Property(p => p.CreatedAt)
            .IsRequired();

        builder.Property(p => p.UpdatedAt)
            .IsRequired(false);

        builder.Property(p => p.IsDeleted)
            .IsRequired()
            .HasDefaultValue(false);

        // Global query filter: soft delete
        builder.HasQueryFilter(p => !p.IsDeleted);

        // One preference record per user
        builder.HasIndex(p => p.UserId)
            .IsUnique()
            .HasDatabaseName("UX_NotificationPreferences_UserId");
    }
}
