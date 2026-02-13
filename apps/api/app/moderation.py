"""
Basic content moderation (Phase 1 safety).
Refuse disallowed requests and return a safe message; no LLM call.
"""
from __future__ import annotations

import re
from typing import Tuple

# Minimal blocklist: obvious harmful or off-topic patterns (expand as needed).
# Kept small to avoid false positives; can be moved to config/DB later.
_BLOCK_PATTERNS = [
    r"\b(ignore\s+previous|disregard\s+instructions|system\s+prompt)\b",
    r"\b(how\s+to\s+(build|make)\s+(a\s+)?(bomb|weapon))\b",
    r"\b(hack\s+into|steal\s+password)\b",
]

_COMPILED = [re.compile(p, re.I) for p in _BLOCK_PATTERNS]

REFUSAL_MESSAGE = (
    "I can't help with that. Please ask a question related to your subject (e.g. math, physics, "
    "chemistry, history, or writing) and I'll be glad to explain or give practice."
)


def check_user_content(text: str) -> Tuple[bool, str | None]:
    """
    Check user message for disallowed content.
    Returns (allowed, refusal_message).
    If allowed is False, refusal_message is the safe message to show; otherwise refusal_message is None.
    """
    if not text or not text.strip():
        return True, None
    combined = " ".join(text.split())
    for pat in _COMPILED:
        if pat.search(combined):
            return False, REFUSAL_MESSAGE
    return True, None
