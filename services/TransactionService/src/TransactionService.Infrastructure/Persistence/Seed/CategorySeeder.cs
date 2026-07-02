namespace TransactionService.Infrastructure.Persistence.Seed;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using TransactionService.Domain.Entities;
using TransactionService.Domain.Enums;

public static class CategorySeeder
{
    public static async Task SeedAsync(IServiceProvider serviceProvider)
    {
        using var scope = serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TransactionDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<TransactionDbContext>>();

        try
        {
            // Check if system categories already exist to avoid duplicates
            if (await context.Categories.AnyAsync(c => c.IsSystem))
            {
                logger.LogInformation("System categories already exist. Skipping seed.");
                return;
            }

            var categories = new List<Category>
            {
                // Income Categories
                CreateSystemCategory("Salary", TransactionType.Income, "salary"),
                CreateSystemCategory("Freelance", TransactionType.Income, "freelance"),
                CreateSystemCategory("Investment", TransactionType.Income, "investment"),
                CreateSystemCategory("Other Income", TransactionType.Income, "other-income"),

                // Expense Categories
                CreateSystemCategory("Grocery", TransactionType.Expense, "grocery"),
                CreateSystemCategory("Rent", TransactionType.Expense, "rent"),
                CreateSystemCategory("Bills", TransactionType.Expense, "bills"),
                CreateSystemCategory("Transportation", TransactionType.Expense, "transport"),
                CreateSystemCategory("Health", TransactionType.Expense, "health"),
                CreateSystemCategory("Education", TransactionType.Expense, "education"),
                CreateSystemCategory("Entertainment", TransactionType.Expense, "entertainment"),
                CreateSystemCategory("Clothing", TransactionType.Expense, "clothing"),
                CreateSystemCategory("Other Expense", TransactionType.Expense, "other-expense")
            };

            await context.Categories.AddRangeAsync(categories);
            await context.SaveChangesAsync();

            logger.LogInformation("Seeded {Count} system categories successfully.", categories.Count);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "An error occurred while seeding the database.");
        }
    }

    private static Category CreateSystemCategory(string name, TransactionType type, string iconCode)
    {
        return new Category
        {
            Id = Guid.NewGuid(),
            UserId = null, // System categories don't belong to a specific user
            Name = name,
            Type = type,
            IconCode = iconCode,
            IsSystem = true,
            IsDeleted = false,
            CreatedAt = DateTime.UtcNow
        };
    }
}