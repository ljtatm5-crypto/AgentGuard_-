"""Optional XiaoAn-only OpenAI-compatible answer model."""
from __future__ import annotations

import json
import os
import re

import httpx

from app.core.config import get_settings
from app.core.target_scope import validate_assistant_provider


class XiaoAnLLMUnavailable(RuntimeError):
    pass


class XiaoAnLLM:
    def __init__(self) -> None:
        settings = get_settings()
        self.enabled = settings.xiaoan_enabled and settings.xiaoan_llm_enabled
        self.url = settings.xiaoan_llm_url
        self.model = settings.xiaoan_llm_model
        self.api_key_env = settings.xiaoan_llm_api_key_env
        self.json_mode = settings.xiaoan_llm_json_mode

    def _post(self, payload: dict, auth_token: str | None) -> str:
        if not self.enabled:
            raise XiaoAnLLMUnavailable("小安模型未启用")
        api_key = (os.getenv(self.api_key_env, "") if self.api_key_env else "") or (auth_token or "").strip()
        if not self.url or not self.model:
            raise XiaoAnLLMUnavailable("小安模型地址或模型未配置")
        if self.api_key_env and not api_key:
            raise XiaoAnLLMUnavailable("小安模型凭据环境变量未配置")
        settings = get_settings()
        validate_assistant_provider(
            endpoint=self.url,
            provider="小安在线模型",
            allowed_hosts=settings.xiaoan_llm_allowed_host_list,
        )
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        payload = {**payload, "model": self.model, "stream": False}
        with httpx.Client(timeout=settings.remote_request_timeout_seconds, follow_redirects=False, trust_env=False) as client:
            response = client.post(self.url, headers=headers, json=payload)
            if response.status_code >= 400:
                detail = response.text[:800].replace("\n", " ")
                raise XiaoAnLLMUnavailable(f"在线模型返回 HTTP {response.status_code}: {detail}")
        body = response.json()
        choices = body.get("choices")
        content = choices[0].get("message", {}).get("content") if isinstance(choices, list) and choices else None
        if not isinstance(content, str):
            raise XiaoAnLLMUnavailable("小安模型响应缺少 message.content")
        return content

    def complete_text(self, *, system: str, user: str, auth_token: str | None = None) -> str:
        return self._post({
            "temperature": 0.25,
            "max_tokens": 1000,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }, auth_token).strip()

    def complete_json(self, *, system: str, user: str, auth_token: str | None = None) -> dict:
        payload = {
            "temperature": 0.1,
            "max_tokens": 1400,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        if self.json_mode:
            payload["response_format"] = {"type": "json_object"}
        content = self._post(payload, auth_token)
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip(), flags=re.IGNORECASE)
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start < 0 or end <= start:
                raise XiaoAnLLMUnavailable("小安模型未返回可解析的 JSON")
            parsed = json.loads(cleaned[start:end + 1])
        if not isinstance(parsed, dict):
            raise XiaoAnLLMUnavailable("小安模型返回的 JSON 顶层必须是对象")
        return parsed


def get_xiaoan_llm() -> XiaoAnLLM:
    return XiaoAnLLM()
