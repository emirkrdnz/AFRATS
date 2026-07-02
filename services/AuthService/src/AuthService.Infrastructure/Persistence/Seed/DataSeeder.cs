namespace AuthService.Infrastructure.Persistence.Seed;

using AuthService.Application.Interfaces.Services;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

public static class DataSeeder
{
    public static async Task SeedAsync(IServiceProvider serviceProvider)
    {
        using var scope = serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<AuthDbContext>();
        var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<AuthDbContext>>();

        try
        {
            await context.Database.MigrateAsync();

            if (!await context.Users.AnyAsync(u => u.Email == "admin@afrats.com"))
            {
                var adminPassword = Environment.GetEnvironmentVariable("ADMIN_DEFAULT_PASSWORD");
                if (string.IsNullOrWhiteSpace(adminPassword) || adminPassword.Length < 8)
                    throw new InvalidOperationException(
                        "ADMIN_DEFAULT_PASSWORD must be set to a value of at least 8 characters " +
                        "before the default admin account can be seeded.");

                var adminUser = new User
                {
                    Id = SeedConstants.AdminUserId,
                    Email = "admin@afrats.com",
                    PasswordHash = passwordHasher.HashPassword(adminPassword),
                    FirstName = "System",
                    LastName = "Admin",
                    RoleId = SeedConstants.AdminRoleId,
                    IsActive = true,
                    EmailConfirmed = true,
                    IsDeleted = false,
                    CreatedAt = SeedConstants.SeedDate
                };

                await context.Users.AddAsync(adminUser);
                await context.SaveChangesAsync();

                logger.LogInformation("Default admin user seeded: admin@afrats.com");
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "An error occurred while seeding the database");
            throw;
        }
    }
}
