from __future__ import annotations

from typing import List

import httpx

from .config import get_settings
from .schemas import ChatMessage, MessageRole


class ChatProvider:
    """
    Simple provider abstraction for chat completions.

    - If OPENAI_BASE_URL (and optionally OPENAI_API_KEY) are configured, forwards
      requests to an OpenAI-compatible /chat/completions endpoint.
    - Otherwise, returns a stubbed response that is deterministic and helpful
      for UI and backend integration testing.
    """

    def __init__(self) -> None:
        self.settings = get_settings()

    async def chat(
        self,
        messages: List[ChatMessage],
        subject_system_prompt: str,
    ) -> ChatMessage:
        if not self.settings.openai_base_url:
            # Stub mode: echo back a helpful placeholder.
            joined_content = "\n".join(f"{m.role}: {m.content}" for m in messages if m.role == MessageRole.USER)
            content = (
                "This is a stubbed SubjectChat response (no LLM configured yet).\n\n"
                "I would normally answer using a subject-specific tutoring style.\n\n"
                f"Subject system prompt I received was:\n{subject_system_prompt}\n\n"
                "For now, here is a simple acknowledgement of your latest question:\n\n"
                f"{joined_content}"
            )
            return ChatMessage(role=MessageRole.ASSISTANT, content=content)

        return await self._call_openai_compatible(messages, subject_system_prompt)

    async def _call_openai_compatible(
        self,
        messages: List[ChatMessage],
        subject_system_prompt: str,
    ) -> ChatMessage:
        """
        Call an OpenAI-compatible Chat Completions endpoint.
        """

        url = f"{self.settings.openai_base_url.rstrip('/')}/chat/completions"

        # Compose messages: system prompt + conversation
        payload_messages = [
            {"role": "system", "content": subject_system_prompt},
            *[{"role": m.role.value, "content": m.content} for m in messages],
        ]

        payload = {
            "model": self.settings.openai_model,
            "messages": payload_messages,
        }

        headers = {}
        if self.settings.openai_api_key:
            headers["Authorization"] = f"Bearer {self.settings.openai_api_key}"

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()

        # Basic extraction following the OpenAI-style schema
        content = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "The provider did not return any content.")
        )

        return ChatMessage(role=MessageRole.ASSISTANT, content=content)

    async def suggest_next_questions(
        self,
        last_user_question: str,
        subject_system_prompt: str,
        max_suggestions: int = 3,
    ) -> list[str]:
        """
        Generate suggested follow-up questions for the learner based on their latest question.

        In stub mode, returns a small set of generic but relevant suggestions.
        With an LLM configured, asks the model to produce concise, progression-oriented questions.
        """

        if not self.settings.openai_base_url:
            # Simple heuristic suggestions when no model is configured.
            return [
                "Can you give me another example that is slightly more challenging than my last question?",
                "What are common mistakes students make with this type of problem?",
                "How can I check if I truly understand this concept on my own?",
            ][:max_suggestions]

        # Use the same chat completions endpoint but with a specialised instruction.
        url = f"{self.settings.openai_base_url.rstrip('/')}/chat/completions"

        system_prompt = (
            subject_system_prompt
            + "\n\n"
            "You are now helping to design the next practice questions for the learner.\n"
            "Given the learner's latest question, propose a few SHORT follow-up questions that:\n"
            "- stay on the same topic,\n"
            "- gradually increase difficulty or explore related angles,\n"
            "- encourage understanding, not just memorisation.\n"
            "Output each question on its own line, with no bullets, numbering, or extra explanation."
        )

        payload_messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"The learner's latest question was:\n\n{last_user_question}\n\n"
                f"Please propose up to {max_suggestions} follow-up questions.",
            },
        ]

        payload = {
            "model": self.settings.openai_model,
            "messages": payload_messages,
        }

        headers = {}
        if self.settings.openai_api_key:
            headers["Authorization"] = f"Bearer {self.settings.openai_api_key}"

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()

        raw = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )

        # Parse into individual non-empty lines and truncate.
        questions = [line.strip() for line in raw.splitlines() if line.strip()]
        return questions[:max_suggestions]


