using System.Reflection;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using NotificationService.Application.Behaviors;

namespace NotificationService.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        var assembly = Assembly.GetExecutingAssembly();

        services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(assembly));

        services.AddAutoMapper(cfg => cfg.AddMaps(assembly));

        // Register all validators from this assembly manually
        var validatorType = typeof(IValidator<>);
        var validators = assembly.GetTypes()
            .Where(t => t is { IsAbstract: false, IsInterface: false }
                     && t.GetInterfaces().Any(i =>
                         i.IsGenericType && i.GetGenericTypeDefinition() == validatorType));

        foreach (var validator in validators)
        {
            var implemented = validator.GetInterfaces()
                .First(i => i.IsGenericType && i.GetGenericTypeDefinition() == validatorType);
            services.AddTransient(implemented, validator);
        }

        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));

        return services;
    }
}