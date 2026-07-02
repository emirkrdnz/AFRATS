using System.Text.Json;
using NotificationService.Application.Exceptions;
using NotificationService.Domain.Exceptions;

namespace NotificationService.API.Middleware;

public class ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unhandled exception: {Message}", ex.Message);
            await HandleExceptionAsync(context, ex);
        }
    }

    private static async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        var (statusCode, message, errors) = exception switch
        {
            ValidationException ve => (
                StatusCodes.Status400BadRequest,
                "Validation failed.",
                (object)ve.Errors),

            BadRequestException ex => (
                StatusCodes.Status400BadRequest,
                ex.Message,
                (object?)null),

            UnauthorizedException ex => (
                StatusCodes.Status401Unauthorized,
                ex.Message,
                (object?)null),

            ForbiddenException ex => (
                StatusCodes.Status403Forbidden,
                ex.Message,
                (object?)null),

            NotFoundException ex => (
                StatusCodes.Status404NotFound,
                ex.Message,
                (object?)null),

            ConflictException ex => (
                StatusCodes.Status409Conflict,
                ex.Message,
                (object?)null),

            _ => (
                StatusCodes.Status500InternalServerError,
                "An unexpected error occurred.",
                (object?)null)
        };

        context.Response.ContentType = "application/json";
        context.Response.StatusCode = statusCode;

        var response = new
        {
            success = false,
            message,
            errors,
            traceId = context.TraceIdentifier
        };

        var json = JsonSerializer.Serialize(response, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });

        await context.Response.WriteAsync(json);
    }
}
