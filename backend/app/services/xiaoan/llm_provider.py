"""Optional XiaoAn-only OpenAI-compatible answer model."""
from __future__ import annotations

import json
import os
import re

import httpx

from app.core.config import get_settings
from app.core.target_scope import validate_target_scope


class XiaoAnLLMUnavailable(RuntimeError):
    pass


class XiaoAnLLM:
    def __init__(self) -> None:
        settings = get_settings()
        self.enabled = settings.xiaoan_enabled and settings.xiaoan_llm_enabled
        self.url = settings.xiaoan_llm_url
        self.model = settings.xiaoan_llm_model
        self.api_key_env = settings.xiaoan_llm_api_key_env

    def complete_json(self, *, system: str, user: str) -> dict:
        if not self.enabled:
            raise XiaoAnLLMUnavailable("小安模型未启用")
        api_key = os.getenv(self.api_key_env, "") if self.api_key_env else ""
        if not self.url or not self.model or not api_key:
            raise XiaoAnLLMUnavailable("小安模型地址、模型或凭据环境变量未配置")
        settings = get_settings()
        validate_target_scope(
            endpoint=self.url,
            adapter="openai_compat",
            target_scope="self_hosted_dify",
            authorization_confirmed=True,
            authorization_reference="XIAOAN-LLM",
            allowed_hosts=settings.allowed_target_host_list,
        )
        with httpx.Client(timeout=settings.remote_request_timeout_seconds, follow_redirects=False, trust_env=False) as client:
            response = client.post(
                self.url,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": self.model,
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                },
            )
            response.raise_for_status()
        payload = response.json()
        choices = payload.get("choices")
        content = choices[0].get("message", {}).get("content") if isinstance(choices, list) and choices else None
        if not isinstance(content, str):
            raise XiaoAnLLMUnavailable("小安模型响应缺少 message.content")
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip(), flags=re.IGNORECASE)
        parsed = json.loads(cleaned)
        if not isinstance(parsed, dict):
            raise XiaoAnLLMUnavailable("小安模型返回的 JSON 顶层必须是对象")
        return parsed


def get_xiaoan_llm() -> XiaoAnLLM:
    return XiaoAnLLM()
