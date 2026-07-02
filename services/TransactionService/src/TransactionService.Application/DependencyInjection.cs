namespace TransactionService.Application;

using FluentValidation;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using TransactionService.Application.Behaviors;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        var assembly = typeof(DependencyInjection).Assembly;

        // MediatR — all Commands, Queries, Handlers
        services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(assembly));

        // AutoMapper — TransactionMappingProfile
        services.AddAutoMapper(cfg => cfg.AddMaps(assembly));

        // FluentValidation — all Validators
        services.AddValidatorsFromAssembly(assembly);

        // MediatR Pipeline — ValidationBehavior
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));

        return services;
    }
}
