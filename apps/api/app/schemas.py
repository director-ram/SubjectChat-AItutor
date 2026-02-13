from __future__ import annotations

from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ChatMessage(BaseModel):
    role: MessageRole
    content: str


class SubjectType(str, Enum):
    DEFAULT = "default"
    CUSTOM = "custom"


class CustomSubjectConfig(BaseModel):
    """Configuration for a custom subject defined by the user (not persisted yet)."""

    name: str = Field(..., description="Human-friendly name of the custom subject, e.g. 'Linear Algebra Review'")
    description: Optional[str] = Field(
        None,
        description="Brief description of what the subject focuses on; used to guide the tutor's style.",
    )
    teaching_style: Optional[str] = Field(
        None,
        description="Optional teaching style instructions (e.g., 'use many step-by-step examples, ask checks often').",
    )


class ChatRequest(BaseModel):
    """
    Request body for /api/chat.

    Supports either:
    - A default subject, referenced by subject_id (e.g. 'math', 'physics'), OR
    - A custom subject with inline configuration.
    """

    subject_type: SubjectType = Field(
        default=SubjectType.DEFAULT,
        description="Whether the subject is a predefined default or a one-off custom subject.",
    )
    subject_id: Optional[str] = Field(
        default=None,
        description="Identifier of a default subject, e.g. 'math', 'physics'. Required when subject_type='default'.",
    )
    custom_subject: Optional[CustomSubjectConfig] = Field(
        default=None,
        description="Inline configuration for a custom subject. Required when subject_type='custom'.",
    )
    messages: list[ChatMessage] = Field(
        ...,
        description="Ordered list of chat messages (user and assistant) that make up the conversation.",
    )


class ChatResponse(BaseModel):
    message: ChatMessage
    suggested_questions: list["SuggestedQuestion"] | None = Field(
        default=None,
        description="Optional list of next questions suggested based on the latest user message.",
    )
    # In the future we can add fields like 'usage', 'subject', etc.


class SuggestedQuestion(BaseModel):
    """A suggested follow-up question for the learner."""

    text: str = Field(..., description="The question text the learner could ask next.")


class SubjectConfig(BaseModel):
    """Represents a subject configuration returned by the API."""

    id: str
    name: str
    description: str
    category: Optional[str] = None


class SubjectsListResponse(BaseModel):
    subjects: list[SubjectConfig]

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(system|user|assistant)$")
    content: str = Field(min_length=1, max_length=20000)


class ChatRequest(BaseModel):
    subject_id: str = Field(min_length=1, max_length=64)
    messages: list[ChatMessage] = Field(min_length=1)
    max_tokens: int | None = Field(default=512, ge=64, le=4096)
    temperature: float | None = Field(default=0.4, ge=0.0, le=2.0)


class ChatResponse(BaseModel):
    assistant: ChatMessage
    model: str
    stub: bool = False


class NextQuestionResponse(BaseModel):
    question_text: str
    rationale: str
    subject_id: str
    stub: bool = False


class FeedbackRequest(BaseModel):
    message_index: int = Field(ge=0)
    rating: int = Field(ge=-1, le=1)  # -1 = thumbs down, 0 = neutral/clear, 1 = thumbs up
    subject_id: str = Field(min_length=1, max_length=64)
    message_content: str  # The assistant's message being rated
    user_question: str | None = None  # Optional: the user's question


class FeedbackResponse(BaseModel):
    ok: bool
    message: str
    feedback_id: int | None = None


class ConversationSummary(BaseModel):
    id: int
    subject_id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int


class ConversationDetail(BaseModel):
    id: int
    subject_id: str
    title: str
    created_at: str
    messages: list[ChatMessage]


class SaveConversationRequest(BaseModel):
    subject_id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=256)
    messages: list[ChatMessage] = Field(min_length=1)


class SaveConversationResponse(BaseModel):
    id: int
    message: str

