namespace TransactionService.Infrastructure.Persistence.Configurations;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TransactionService.Domain.Entities;
using TransactionService.Domain.Enums;

public class TransactionConfiguration : IEntityTypeConfiguration<Transaction>
{
    public void Configure(EntityTypeBuilder<Transaction> builder)
    {
        builder.ToTable("Transactions");

        // Primary Key — GUID with NEWSEQUENTIALID()
        builder.HasKey(t => t.Id);
        builder.Property(t => t.Id)
            .HasDefaultValueSql("NEWSEQUENTIALID()");

        // UserId — NOT NULL, no FK to auth schema
        builder.Property(t => t.UserId)
            .IsRequired();

        // Amount — DECIMAL(18,2), must be positive
        builder.Property(t => t.Amount)
            .HasColumnType("decimal(18,2)")
            .IsRequired();

        // Type — NVARCHAR(20), stored as string, CHECK constraint
        builder.Property(t => t.Type)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();

        // Description — NVARCHAR(500), optional
        builder.Property(t => t.Description)
            .HasMaxLength(500);

        // TransactionDate — DATETIME2, required
        builder.Property(t => t.TransactionDate)
            .HasColumnType("datetime2")
            .IsRequired();

        // IsAnomalous — BIT, default false
        builder.Property(t => t.IsAnomalous)
            .IsRequired()
            .HasDefaultValue(false);

        // AnomalyScore — FLOAT, nullable
        builder.Property(t => t.AnomalyScore)
            .HasColumnType("float");

        // IsDeleted — BIT, default false
        builder.Property(t => t.IsDeleted)
            .IsRequired()
            .HasDefaultValue(false);

        // CreatedAt — DATETIME2, required
        builder.Property(t => t.CreatedAt)
            .HasColumnType("datetime2")
            .IsRequired();

        // UpdatedAt — DATETIME2, nullable
        builder.Property(t => t.UpdatedAt)
            .HasColumnType("datetime2");

        // Navigation: Transaction -> Category
        builder.HasOne(t => t.Category)
            .WithMany(c => c.Transactions)
            .HasForeignKey(t => t.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);

        // Global Query Filter — soft delete
        builder.HasQueryFilter(t => !t.IsDeleted);

        // === Indexes (Section 4.3) ===

        // Kullanıcının kronolojik işlem listesi (FR-T03)
        builder.HasIndex(t => new { t.UserId, t.TransactionDate })
            .IsDescending(false, true)
            .HasDatabaseName("IX_Transactions_UserId_TransactionDate");

        // Kategori bazlı filtreleme ve dashboard gruplama
        builder.HasIndex(t => new { t.UserId, t.CategoryId })
            .HasDatabaseName("IX_Transactions_UserId_CategoryId");

        // Dashboard anomali widget sorgusu
        builder.HasIndex(t => new { t.IsAnomalous, t.UserId })
            .HasDatabaseName("IX_Transactions_IsAnomalous_UserId");

        // Aylık gelir/gider özeti (FR-T09)
        builder.HasIndex(t => new { t.UserId, t.Type, t.TransactionDate })
            .HasDatabaseName("IX_Transactions_UserId_Type_TransactionDate");
    }
}
