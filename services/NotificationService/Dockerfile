# ============================================
# AFRATS Notification Service - Dockerfile
# Konum: AFRATS/services/NotificationService/Dockerfile
# Build context: AFRATS/services/NotificationService/
# ============================================

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 8080
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY src/ src/

RUN find /src -name "obj" -type d -exec rm -rf {} + 2>/dev/null; true

RUN dotnet restore src/NotificationService.API/NotificationService.API.csproj
WORKDIR /src/src/NotificationService.API
RUN dotnet build -c Release -o /app/build --no-restore

FROM build AS publish
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false --no-restore

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "NotificationService.API.dll"]
