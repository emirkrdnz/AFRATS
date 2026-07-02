namespace AuthService.Application;

using System.Reflection;
using AuthService.Application.Behaviors;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.DependencyInjection;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        var assembly = Assembly.GetExecutingAssembly();

        // MediatR — scans all Command/Query handlers in this assembly
        services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(assembly));

        // FluentValidation — scans all validators in this assembly
        services.AddValidatorsFromAssembly(assembly);

        // MediatR pipeline — validation runs before every handler
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));

        // AutoMapper — scans all profiles in this assembly
        services.AddAutoMapper(cfg => cfg.AddMaps(assembly));

        return services;
    }
}