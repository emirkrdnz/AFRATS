namespace TransactionService.API;

using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;
using Serilog;
using System.Text;
using TransactionService.API.Middleware;
using TransactionService.Application;
using TransactionService.Infrastructure;
using TransactionService.Infrastructure.Persistence;
using TransactionService.Infrastructure.Persistence.Seed;
using System.Text.Json;
using System.Text.Json.Serialization;

public class Program
{
    public static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        // --- Serilog ---
        builder.Host.UseSerilog((context, config) =>
        {
            config
                .ReadFrom.Configuration(context.Configuration)
                .WriteTo.Console()
                .WriteTo.File("Logs/transaction-service-.log",
                    rollingInterval: RollingInterval.Day,
                    retainedFileCountLimit: 30);
        });

        // --- Application & Infrastructure DI ---
        builder.Services.AddApplication();
        builder.Services.AddInfrastructure(builder.Configuration);

        // --- JWT Authentication ---
        var jwtSecret = builder.Configuration["Jwt:Secret"];

        // Fail-fast: refuse to start without a real signing secret (consistency with AuthService).
        // HS256 requires >=256-bit key per OWASP; 32 ASCII chars ≈ 256 bits.
        if (string.IsNullOrWhiteSpace(jwtSecret) || jwtSecret.Length < 32)
            throw new InvalidOperationException(
                "Jwt:Secret must be configured to a non-empty value of at least 32 characters. " +
                "Set the Jwt__Secret environment variable.");

        builder.Services.AddAuthentication(options =>
        {
            options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
            options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
        })
        .AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = builder.Configuration["Jwt:Issuer"],
                ValidateAudience = true,
                ValidAudience = builder.Configuration["Jwt:Audience"],
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(
                    Encoding.UTF8.GetBytes(jwtSecret)),
                ValidateLifetime = true,
                ClockSkew = TimeSpan.Zero
            };
        });

        builder.Services.AddAuthorization();
        builder.Services.AddControllers()
            .AddJsonOptions(options =>
            {
                // Always serialize DateTime as UTC with 'Z' suffix.
                // Backend stores DateTime.UtcNow -> ensures clients parse it as UTC, not local.
                options.JsonSerializerOptions.Converters.Add(new UtcDateTimeConverter());
            });

        // --- CORS ---
        builder.Services.AddCors(options =>
        {
            options.AddPolicy("AllowAll", policy =>
            {
                policy
                    .AllowAnyOrigin()
                    .AllowAnyMethod()
                    .AllowAnyHeader();
            });
        });

        // --- OpenAPI (.NET 10 native) ---
        builder.Services.AddOpenApi();

        var app = builder.Build();

        // --- Middleware Pipeline ---
        app.UseMiddleware<ExceptionHandlingMiddleware>();
        app.UseSerilogRequestLogging();

        if (app.Environment.IsDevelopment())
        {
            app.MapOpenApi();
            app.MapScalarApiReference(options =>
            {
                options
                    .WithTitle("AFRATS Transaction Service")
                    .WithDefaultHttpClient(ScalarTarget.CSharp, ScalarClient.HttpClient);
            });
        }

        app.UseCors("AllowAll");
        app.UseAuthentication();
        app.UseAuthorization();

        // --- Health Check ---
        app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "transaction" }));

        app.MapControllers();

        // --- Database Migration ---
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TransactionDbContext>();
            await db.Database.MigrateAsync();
        }

        // --- Database Seed ---
        await CategorySeeder.SeedAsync(app.Services);

        await app.RunAsync();
    }

    public class UtcDateTimeConverter : JsonConverter<DateTime>
    {
        public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            => reader.GetDateTime();

        public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
        {
            // Force UTC kind, then write with 'Z' suffix (ISO-8601 round-trip)
            var utc = value.Kind switch
            {
                DateTimeKind.Utc => value,
                DateTimeKind.Local => value.ToUniversalTime(),
                // Unspecified is treated as UTC (EF Core SQL Server DateTime materialization)
                _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
            };

            writer.WriteStringValue(utc.ToString("yyyy-MM-ddTHH:mm:ss.fffffffZ"));
        }
    }
}