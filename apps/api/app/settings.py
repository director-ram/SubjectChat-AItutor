from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


# Find .env in the parent directory of this file (apps/api/)
ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ENV_FILE), env_file_encoding="utf-8", extra="ignore")

    env: str = "local"

    database_url: str = ""
    redis_url: str = ""

    openai_api_key: str = ""
    openai_base_url: str = ""  # e.g. http://localhost:1234/v1
    openai_model: str = "llama-3.2-3b-instruct"

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ]


settings = Settings()
