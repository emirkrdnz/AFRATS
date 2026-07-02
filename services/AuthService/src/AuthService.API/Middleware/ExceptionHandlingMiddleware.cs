namespace AuthService.API.Middleware;

using System.Net;
using System.Text.Json;
using AuthService.Domain.Exceptions;
using ValidationException = AuthService.Application.Exceptions.ValidationException;

public class ExceptionHandlingMiddleware(
    RequestDelegate next,
    ILogger<ExceptionHandlingMiddleware> logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

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
        var traceId = context.TraceIdentifier;

        var (statusCode, title, type, errors) = exception switch
        {
            ValidationException validationEx => (
                HttpStatusCode.BadRequest,
                "One or more validation errors occurred.",
                "https://tools.ietf.org/html/rfc9110#section-15.5.1",
                (IReadOnlyDictionary<string, string[]>?)validationEx.Errors),

            BadRequestException badRequestEx => (
                HttpStatusCode.BadRequest,
                badRequestEx.Message,
                "https://tools.ietf.org/html/rfc9110#section-15.5.1",
                null),

            UnauthorizedException unauthorizedEx => (
                HttpStatusCode.Unauthorized,
                unauthorizedEx.Message,
                "https://tools.ietf.org/html/rfc9110#section-15.5.2",
                null),

            ForbiddenException forbiddenEx => (
                HttpStatusCode.Forbidden,
                forbiddenEx.Message,
                "https://tools.ietf.org/html/rfc9110#section-15.5.4",
                null),

            NotFoundException notFoundEx => (
                HttpStatusCode.NotFound,
                notFoundEx.Message,
                "https://tools.ietf.org/html/rfc9110#section-15.5.5",
                null),

            ConflictException conflictEx => (
                HttpStatusCode.Conflict,
                conflictEx.Message,
                "https://tools.ietf.org/html/rfc9110#section-15.5.10",
                null),

            _ => (
                HttpStatusCode.InternalServerError,
                "An unexpected error occurred.",
                "https://tools.ietf.org/html/rfc9110#section-15.6.1",
                null)
        };

        if (statusCode == HttpStatusCode.InternalServerError)
            logger.LogError(exception, "Unhandled exception | TraceId: {TraceId}", traceId);
        else
            logger.LogWarning("Handled exception: {ExceptionType} | TraceId: {TraceId} | Message: {Message}",
                exception.GetType().Name, traceId, exception.Message);

        context.Response.ContentType = "application/problem+json";
        context.Response.StatusCode = (int)statusCode;

        var problem = new
        {
            type,
            title,
            status = (int)statusCode,
            errors,
            traceId
        };

        await context.Response.WriteAsync(JsonSerializer.Serialize(problem, JsonOptions));
    }
}
