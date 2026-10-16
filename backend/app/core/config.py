from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AgentGuard 智测盾"
    database_url: str = "sqlite:///./agentguard.db"
    cors_origins: str = "http://localhost:5173"
    demo_mode: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="AGENTGUARD_",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
