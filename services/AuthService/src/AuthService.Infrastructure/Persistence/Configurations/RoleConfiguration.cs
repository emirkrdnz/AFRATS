namespace AuthService.Infrastructure.Persistence.Configurations;

using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence.Seed;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public class RoleConfiguration : IEntityTypeConfiguration<Role>
{
    public void Configure(EntityTypeBuilder<Role> builder)
    {
        builder.ToTable("Roles");

        // Primary Key
        builder.HasKey(r => r.Id);
        builder.Property(r => r.Id)
            .HasDefaultValueSql("NEWSEQUENTIALID()");

        // Properties
        builder.Property(r => r.Name)
            .IsRequired()
            .HasMaxLength(50);

        builder.Property(r => r.Description)
            .HasMaxLength(255);

        builder.Property(r => r.CreatedAt)
            .IsRequired();

        // Indexes
        builder.HasIndex(r => r.Name).IsUnique();

        // Seed Data
        builder.HasData(
            new Role
            {
                Id = SeedConstants.UserRoleId,
                Name = "User",
                Description = "Standard user role",
                CreatedAt = SeedConstants.SeedDate
            },
            new Role
            {
                Id = SeedConstants.AdminRoleId,
                Name = "Admin",
                Description = "System administrator role",
                CreatedAt = SeedConstants.SeedDate
            });
    }
}
