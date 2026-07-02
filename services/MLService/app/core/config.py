from pydantic import Field, field_validator
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "AFRATS ML Service"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # CORS — explicit origin allowlist (wildcard yasak; credentials uyumlu).
    # .env'de comma-separated yazılabilir:
    #   CORS_ORIGINS=https://afrats.example.com,https://admin.afrats.example.com
    # Default değerler local dev için: Vite (3000/5173) + Gateway (5000).
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5000",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_cors_origins(cls, v):
        """Accept comma-separated env value or a native list."""
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    # Database
    DB_SERVER: str = "localhost"
    DB_NAME: str = "afrats_ml"
    DB_USER: str = ""
    DB_PASSWORD: str = ""

    # RabbitMQ
    RABBITMQ_URL: str = "amqp://guest:guest@localhost:5672"

    # RabbitMQ Management API (port 15672) — topology sayfası için.
    # Broker'daki queue/connection/exchange stat'larını proxy etmek üzere
    # admin_router.get_broker_* endpoint'leri tarafından kullanılır.
    RABBITMQ_MGMT_URL:  str = "http://localhost:15672"
    RABBITMQ_MGMT_USER: str = "guest"
    RABBITMQ_MGMT_PASS: str = "guest"

    # JWT — Auth Service ile aynı değerler.
    # JWT_SECRET zorunlu (default yok): service .env'siz başlatılamaz.
    # OWASP HS256 önerisi ≥256-bit → minimum 32 ASCII karakter.
    JWT_SECRET: str = Field(..., min_length=32)
    JWT_ALGORITHM: str = "HS256"
    JWT_ISSUER: str = "afrats-auth"
    JWT_AUDIENCE: str = "afrats-api"

    # ML
    MODEL_PATH: str = "./models"
    MODEL_VERSION: str = "v1.0.0"

    @property
    def db_connection_string(self) -> str:
        if self.DB_USER:
            return (
                f"mssql+pyodbc://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_SERVER}/{self.DB_NAME}"
                f"?driver=ODBC+Driver+18+for+SQL+Server"
                f"&TrustServerCertificate=yes"
            )
        return (
            f"mssql+pyodbc://@{self.DB_SERVER}/{self.DB_NAME}"
            f"?driver=ODBC+Driver+17+for+SQL+Server"
            f"&trusted_connection=yes"
        )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()