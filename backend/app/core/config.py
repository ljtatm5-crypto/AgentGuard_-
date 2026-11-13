from functools import lru_cache

from pydantic import model_validator
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
    run_batch_size: int = 5
    remote_request_timeout_seconds: float = 30.0
    audit_log_enabled: bool = True
    db_auto_create: bool = True
    db_pool_size: int = 5
    db_max_overflow: int = 5
    db_pool_recycle_seconds: int = 300
    # 小安与“被测 Agent”完全独立配置，避免复用目标网关授权。
    xiaoan_enabled: bool = True
    xiaoan_llm_enabled: bool = False
    xiaoan_llm_url: str = ""
    xiaoan_llm_model: str = ""
    xiaoan_llm_api_key_env: str = ""
    xiaoan_embedding_url: str = ""
    xiaoan_embedding_model: str = ""
    xiaoan_embedding_api_key_env: str = ""
    xiaoan_embedding_dimensions: int = 256
    xiaoan_max_context_chars: int = 12000
    xiaoan_rate_limit_per_minute: int = 20
    xiaoan_knowledge_version: str = "2026.11-p0"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="AGENTGUARD_",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_anonymous_write_scope(self):
        if (
            self.environment.lower() == "production"
            and self.allow_anonymous_writes
            and not self.demo_mode
        ):
            raise ValueError(
                "production 环境禁止在非 demo_mode 下开启匿名写权限；"
                "请配置 AGENTGUARD_WRITE_TOKEN 或显式启用隔离演示模式"
            )
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def allowed_target_host_list(self) -> list[str]:
        return [item.strip().lower() for item in self.allowed_target_hosts.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
