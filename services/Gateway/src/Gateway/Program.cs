using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Serilog;

namespace Gateway;

public class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        // 1. Serilog
        builder.Host.UseSerilog((ctx, cfg) =>
            cfg.ReadFrom.Configuration(ctx.Configuration));

        // 2. YARP
        builder.Services
            .AddReverseProxy()
            .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

        // 3. JWT Authentication
        var jwtSettings = builder.Configuration.GetSection("JwtSettings");
        var secret = jwtSettings["Secret"];

        // Fail-fast: refuse to start without a real signing secret (consistency with AuthService).
        // HS256 requires >=256-bit key per OWASP; 32 ASCII chars ≈ 256 bits.
        if (string.IsNullOrWhiteSpace(secret) || secret.Length < 32)
            throw new InvalidOperationException(
                "JwtSettings:Secret must be configured to a non-empty value of at least 32 characters. " +
                "Set the JwtSettings__Secret environment variable.");

        var secretKey = Encoding.UTF8.GetBytes(secret);

        builder.Services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = jwtSettings["Issuer"],
                    ValidateAudience = true,
                    ValidAudience = jwtSettings["Audience"],
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(secretKey),
                    ClockSkew = TimeSpan.Zero
                };
            });

        // 4. Authorization — FallbackPolicy: tüm endpoint'ler varsayılan JWT gerektirir
        builder.Services.AddAuthorization(options =>
        {
            options.FallbackPolicy = new Microsoft.AspNetCore.Authorization
                .AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser()
                .Build();
        });

        // 5. CORS
        var allowedOrigins = builder.Configuration
            .GetSection("CorsSettings:AllowedOrigins")
            .Get<string[]>() ?? [];

        builder.Services.AddCors(options =>
        {
            options.AddPolicy("AfratsCors", policy =>
            {
                policy
                    .WithOrigins(allowedOrigins)
                    .WithMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                    .WithHeaders("Authorization", "Content-Type", "Accept", "X-Correlation-Id")
                    .AllowCredentials()
                    .WithExposedHeaders("X-Pagination", "X-Correlation-Id")
                    .SetPreflightMaxAge(TimeSpan.FromHours(24));
            });
        });

        var app = builder.Build();

        // ===== Middleware Pipeline (SIRA KRİTİK) =====

        app.UseSerilogRequestLogging();

        app.UseRouting();

        app.UseCors("AfratsCors");

        app.UseAuthentication();

        app.UseAuthorization();

        // Health Check
        app.MapGet("/health", () => Results.Ok(new
        {
            status = "healthy",
            service = "gateway"
        })).AllowAnonymous();

        // YARP
        app.MapReverseProxy();

        app.Run();
    }
}