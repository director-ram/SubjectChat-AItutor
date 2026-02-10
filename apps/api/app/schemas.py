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

