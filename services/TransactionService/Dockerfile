# ============================================
# AFRATS Transaction Service - Dockerfile
# Konum: AFRATS/services/TransactionService/Dockerfile
# Build context: AFRATS/services/TransactionService/
# ============================================

# --- Stage 1: Base runtime ---
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 8080
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# --- Stage 2: Build ---
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY src/ src/

# Windows obj kalintilerini temizle
RUN find /src -name "obj" -type d -exec rm -rf {} + 2>/dev/null; true

RUN dotnet restore src/TransactionService.API/TransactionService.API.csproj
WORKDIR /src/src/TransactionService.API
RUN dotnet build -c Release -o /app/build --no-restore

# --- Stage 3: Publish ---
FROM build AS publish
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false --no-restore

# --- Stage 4: Final ---
FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "TransactionService.API.dll"]
