from __future__ import annotations

import json
from dataclasses import dataclass
from typing import AsyncIterator
from urllib.parse import urljoin

import httpx

from app.settings import settings


@dataclass(frozen=True)
class LlmResult:
    content: str
    model: str
    stub: bool


def _normalize_base_url(base_url: str) -> str:
    base_url = (base_url or "").strip()
    if not base_url:
        return ""
    # Allow users to provide either http://host:port or http://host:port/v1
    if base_url.endswith("/"):
        base_url = base_url[:-1]
    if not base_url.endswith("/v1"):
        base_url = base_url + "/v1"
    return base_url


def build_subject_system_prompt(subject_id: str) -> str:
    # Minimal, safe defaults; expand later with subject JSON configs.
    base_rules = (
        "You are a helpful study tutor. "
        "Explain step-by-step, ask clarifying questions when needed, "
        "and prefer hints before final answers. "
        "If you are uncertain, say so."
    )

    subject_rules: dict[str, str] = {
        "math": "Show steps and verify with a quick check.",
        "physics": "State assumptions and units; show formulas clearly.",
        "chemistry": "Balance equations carefully; explain concepts.",
        "history": "Prefer accurate facts; call out uncertainty; avoid inventing citations.",
        "writing": "Help with outlines and feedback; avoid writing exam answers verbatim.",
    }

    extra = subject_rules.get(subject_id.lower(), "")
    if extra:
        return f"{base_rules} Subject focus: {subject_id}. {extra}"
    return f"{base_rules} Subject focus: {subject_id}."


async def chat_completion(messages: list[dict[str, str]], max_tokens: int, temperature: float) -> LlmResult:
    base_url = _normalize_base_url(settings.openai_base_url)
    model = settings.openai_model

    if not base_url:
        return LlmResult(
            content=(
                "(Stub mode) Local LLM is not configured yet.\n\n"
                "To enable Llama 3.2 locally, run LM Studio and start its OpenAI-compatible server, "
                "then set OPENAI_BASE_URL (e.g. http://localhost:1234/v1) and OPENAI_MODEL in .env."
            ),
            model=model,
            stub=True,
        )

    url = urljoin(base_url + "/", "chat/completions")
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if settings.openai_api_key:
        headers["Authorization"] = f"Bearer {settings.openai_api_key}"

    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    content = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
        .strip()
    )

    if not content:
        content = "(No content returned from model.)"

    return LlmResult(content=content, model=model, stub=False)


async def chat_completion_stream(
    messages: list[dict[str, str]], max_tokens: int, temperature: float
) -> AsyncIterator[str]:
    """Yield content chunks as they arrive from the provider. In stub mode yields full message at once."""
    base_url = _normalize_base_url(settings.openai_base_url)
    model = settings.openai_model

    if not base_url:
        stub_content = (
            "(Stub mode) Local LLM is not configured yet.\n\n"
            "To enable Llama 3.2 locally, run LM Studio and start its OpenAI-compatible server, "
            "then set OPENAI_BASE_URL (e.g. http://localhost:1234/v1) and OPENAI_MODEL in .env."
        )
        yield stub_content
        return

    url = urljoin(base_url + "/", "chat/completions")
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if settings.openai_api_key:
        headers["Authorization"] = f"Bearer {settings.openai_api_key}"

    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream("POST", url, json=payload, headers=headers) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue
                data = line[6:].strip()
                if data == "[DONE]":
                    break
                try:
                    obj = json.loads(data)
                    delta = obj.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content") or ""
                    if content:
                        yield content
                except json.JSONDecodeError:
                    continue
