namespace AuthService.Infrastructure.Persistence.Configurations;

using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.ToTable("RefreshTokens");

        // Primary Key
        builder.HasKey(rt => rt.Id);
        builder.Property(rt => rt.Id)
            .HasDefaultValueSql("NEWSEQUENTIALID()");

        // Properties
        builder.Property(rt => rt.Token)
            .IsRequired()
            .HasMaxLength(512);

        builder.Property(rt => rt.ExpiresAt)
            .IsRequired();

        builder.Property(rt => rt.IsRevoked)
            .IsRequired()
            .HasDefaultValue(false);

        builder.Property(rt => rt.CreatedAt)
            .IsRequired();

        // Ignore computed properties — not DB columns
        builder.Ignore(rt => rt.IsExpired);
        builder.Ignore(rt => rt.IsActive);

        // Indexes
        builder.HasIndex(rt => new { rt.UserId, rt.IsRevoked });
        builder.HasIndex(rt => rt.Token).IsUnique();

        // Matching query filter — soft-deleted user's tokens are excluded
        builder.HasQueryFilter(rt => !rt.User.IsDeleted);
    }
}