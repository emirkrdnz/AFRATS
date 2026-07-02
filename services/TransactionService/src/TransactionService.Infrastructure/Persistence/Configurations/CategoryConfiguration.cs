namespace TransactionService.Infrastructure.Persistence.Configurations;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TransactionService.Domain.Entities;
using TransactionService.Domain.Enums;

public class CategoryConfiguration : IEntityTypeConfiguration<Category>
{
    public void Configure(EntityTypeBuilder<Category> builder)
    {
        builder.ToTable("Categories");

        // Primary Key
        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id)
            .HasDefaultValueSql("NEWSEQUENTIALID()");

        // UserId — NULL = system category
        builder.Property(c => c.UserId);

        // Name — NVARCHAR(100), required
        builder.Property(c => c.Name)
            .HasMaxLength(100)
            .IsRequired();

        // Type — NVARCHAR(20), stored as string
        builder.Property(c => c.Type)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();

        // IconCode — NVARCHAR(50), optional
        builder.Property(c => c.IconCode)
            .HasMaxLength(50);

        // IsSystem — BIT, default false
        builder.Property(c => c.IsSystem)
            .IsRequired()
            .HasDefaultValue(false);

        // IsDeleted — BIT, default false
        builder.Property(c => c.IsDeleted)
            .IsRequired()
            .HasDefaultValue(false);

        // CreatedAt — DATETIME2, required
        builder.Property(c => c.CreatedAt)
            .HasColumnType("datetime2")
            .IsRequired();

        // Global Query Filter — soft delete
        builder.HasQueryFilter(c => !c.IsDeleted);

        // === Indexes (Section 4.3) ===

        // Kategori listeleme (sistem + kullanıcı)
        builder.HasIndex(c => new { c.UserId, c.Type, c.IsDeleted })
            .HasDatabaseName("IX_Categories_UserId_Type_IsDeleted");

        // Sistem kategorisi filtreleme
        builder.HasIndex(c => c.IsSystem)
            .HasDatabaseName("IX_Categories_IsSystem");
    }
}
