namespace TransactionService.Infrastructure;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using TransactionService.Application.Interfaces;
using TransactionService.Application.Interfaces.Repositories;
using TransactionService.Application.Interfaces.Services;
using TransactionService.Infrastructure.EventConsumers;
using TransactionService.Infrastructure.Persistence;
using TransactionService.Infrastructure.Persistence.Repositories;
using TransactionService.Infrastructure.Services;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        // EF Core — SQL Server with afrats_txn schema
        services.AddDbContext<TransactionDbContext>(options =>
            options.UseSqlServer(
                configuration.GetConnectionString("DefaultConnection"),
                sql => sql.MigrationsHistoryTable("__EFMigrationsHistory", "afrats_txn")));

        // Repositories
        services.AddScoped<ITransactionRepository, TransactionRepository>();
        services.AddScoped<ICategoryRepository, CategoryRepository>();

        // Unit of Work
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        // Services
        services.AddSingleton<IEventPublisher, RabbitMqEventPublisher>();
        services.AddScoped<ICsvParserService, CsvTransactionParser>();

        // RabbitMQ Consumer — Background Hosted Service
        services.AddHostedService<AnalysisCompletedConsumer>();

        return services;
    }
}
