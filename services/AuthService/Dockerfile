# ============================================
# AFRATS Auth Service - Dockerfile
# Konum: AFRATS/services/AuthService/Dockerfile
# Build context: AFRATS/services/AuthService/
# ============================================

# --- Stage 1: Base runtime ---
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 8080
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# --- Stage 2: Build ---
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Tum kaynak kodu kopyala
COPY src/ src/

# Windows obj kalintilerini temizle
RUN find /src -name "obj" -type d -exec rm -rf {} + 2>/dev/null; true

# Restore + Build
RUN dotnet restore src/AuthService.API/AuthService.API.csproj
WORKDIR /src/src/AuthService.API
RUN dotnet build -c Release -o /app/build --no-restore

# --- Stage 3: Publish ---
FROM build AS publish
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false --no-restore

# --- Stage 4: Final ---
FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "AuthService.API.dll"]