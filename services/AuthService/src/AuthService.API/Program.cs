namespace AuthService.API;

using AuthService.API.Middleware;
using AuthService.Application;
using AuthService.Infrastructure;
using AuthService.Infrastructure.Persistence.Seed;
using AuthService.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;
using Serilog;
using System.IdentityModel.Tokens.Jwt;
using System.Text;
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
                .WriteTo.File("Logs/auth-service-.log",
                    rollingInterval: RollingInterval.Day,
                    retainedFileCountLimit: 30);
        });

        // --- Application & Infrastructure DI ---
        builder.Services.AddApplication();
        builder.Services.AddInfrastructure(builder.Configuration);

        // --- JWT Authentication ---
        var jwtSettings = builder.Configuration
            .GetSection(JwtSettings.SectionName)
            .Get<JwtSettings>()!;

        // Fail-fast: refuse to start without a real signing secret.
        // HS256 requires >=256-bit key per OWASP; 32 ASCII chars ≈ 256 bits.
        if (string.IsNullOrWhiteSpace(jwtSettings.Secret) || jwtSettings.Secret.Length < 32)
            throw new InvalidOperationException(
                "JwtSettings:Secret must be configured to a non-empty value of at least 32 characters. " +
                "Set the JwtSettings__Secret environment variable.");

        JwtSecurityTokenHandler.DefaultInboundClaimTypeMap.Clear();

        builder.Services.AddAuthentication(options =>
        {
            options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
            options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
        })
        .AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                RoleClaimType = "http://schemas.microsoft.com/ws/2008/06/identity/claims/role",
                ValidateIssuer = true,
                ValidIssuer = jwtSettings.Issuer,
                ValidateAudience = true,
                ValidAudience = jwtSettings.Audience,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(
                    Encoding.UTF8.GetBytes(jwtSettings.Secret)),
                ValidateLifetime = true,
                ClockSkew = TimeSpan.Zero
            };
        });

        builder.Services.AddAuthorization();

        // --- Controllers ---
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

        // --- Middleware Pipeline (order matters) ---
        app.UseMiddleware<ExceptionHandlingMiddleware>();

        app.UseSerilogRequestLogging();

        if (app.Environment.IsDevelopment())
        {
            // OpenAPI JSON: /openapi/v1.json
            app.MapOpenApi();

            // Scalar UI: /scalar/v1
            app.MapScalarApiReference(options =>
            {
                options
                    .WithTitle("AFRATS Auth Service")
                    .WithDefaultHttpClient(ScalarTarget.CSharp, ScalarClient.HttpClient);
            });
        }

        app.UseCors("AllowAll");
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapControllers();

        // --- Database Seed ---
        await DataSeeder.SeedAsync(app.Services);

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