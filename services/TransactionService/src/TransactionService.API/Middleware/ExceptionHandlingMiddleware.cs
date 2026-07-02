namespace TransactionService.API.Middleware;

using System.Text.Json;
using FluentValidation;
using TransactionService.Domain.Exceptions;

public class ExceptionHandlingMiddleware(
    RequestDelegate next,
    ILogger<ExceptionHandlingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        var (statusCode, message, errors) = exception switch
        {
            ValidationException validationEx => (
                StatusCodes.Status400BadRequest,
                "Validation failed.",
                validationEx.Errors.Select(e => new { field = e.PropertyName, message = e.ErrorMessage })),

            BadRequestException badRequestEx => (
                StatusCodes.Status400BadRequest,
                badRequestEx.Message,
                (object?)null),

            NotFoundException notFoundEx => (
                StatusCodes.Status404NotFound,
                notFoundEx.Message,
                (object?)null),

            ConflictException conflictEx => (
                StatusCodes.Status409Conflict,
                conflictEx.Message,
                (object?)null),

            UnauthorizedException unauthorizedEx => (
                StatusCodes.Status401Unauthorized,
                unauthorizedEx.Message,
                (object?)null),

            ForbiddenException forbiddenEx => (
                StatusCodes.Status403Forbidden,
                forbiddenEx.Message,
                (object?)null),

            UnauthorizedAccessException => (
                StatusCodes.Status401Unauthorized,
                "Unauthorized.",
                (object?)null),

            _ => (
                StatusCodes.Status500InternalServerError,
                "An unexpected error occurred.",
                (object?)null)
        };

        // Log only 500s as errors, others as warnings
        if (statusCode == StatusCodes.Status500InternalServerError)
            logger.LogError(exception, "Unhandled exception: {Message}", exception.Message);
        else
            logger.LogWarning("Handled exception: {Type} — {Message}", exception.GetType().Name, exception.Message);

        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "application/json";

        var response = new
        {
            success = false,
            message,
            errors,
            traceId = context.TraceIdentifier
        };

        var json = JsonSerializer.Serialize(response, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
        });

        await context.Response.WriteAsync(json);
    }
}
