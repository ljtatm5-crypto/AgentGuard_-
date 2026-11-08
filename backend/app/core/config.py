from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AgentGuard 智测盾"
    environment: str = "development"
    database_url: str = "sqlite:///./agentguard.db"
    cors_origins: str = "http://localhost:5173"
    demo_mode: bool = True
    allowed_target_hosts: str = "localhost,127.0.0.1,::1,host.docker.internal"
    llm_enabled: bool = False
    llm_chat_url: str = ""
    llm_model: str = ""
    llm_api_key_env: str = ""
    llm_prompt_version: str = "judge-v1"
    # Public reads stay available, while every mutating request is denied by
    # default unless an operator token is supplied. Local test/demo runs can
    # opt into anonymous writes explicitly.
    allow_anonymous_writes: bool = False
    write_token: str = ""
    write_rate_limit_per_minute: int = 30
    max_request_bytes: int = 1_048_576
    max_cases_per_run: int = 40
    audit_log_enabled: bool = True
    db_auto_create: bool = True
    db_pool_size: int = 5
    db_max_overflow: int = 5
    db_pool_recycle_seconds: int = 300

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="AGENTGUARD_",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def allowed_target_host_list(self) -> list[str]:
        return [item.strip().lower() for item in self.allowed_target_hosts.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
