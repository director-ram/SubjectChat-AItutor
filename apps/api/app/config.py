from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    env: str = "local"
    database_url: str | None = None
    redis_url: str | None = None

    openai_api_key: str | None = None
    openai_base_url: str | None = None
    openai_model: str = "llama-3.2-3b-instruct"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance."""

    return Settings()

