from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.llm import build_subject_system_prompt, chat_completion
from app.schemas import (
    ChatRequest,
    ChatResponse,
    ChatMessage,
    NextQuestionResponse,
    FeedbackRequest,
    FeedbackResponse,
    ConversationSummary,
    ConversationDetail,
    SaveConversationRequest,
    SaveConversationResponse,
)
from app.settings import settings
from app.database import init_db, get_db
from app.models import Conversation, Message, Feedback

app = FastAPI(title="SubjectChat API")


@app.on_event("startup")
def on_startup():
    init_db()


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"] ,
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/debug/settings")
def debug_settings() -> dict:
    return {
        "openai_base_url": settings.openai_base_url,
        "openai_model": settings.openai_model,
        "openai_api_key_set": bool(settings.openai_api_key),
    }


@app.get("/api/feedback/stats")
def get_feedback_stats(subject_id: str | None = None) -> dict:
    """Get feedback statistics for analysis and model improvement."""
    try:
        with get_db() as db:
            query = db.query(Feedback)
            if subject_id:
                query = query.filter(Feedback.subject_id == subject_id)
            
            all_feedback = query.all()
            total = len(all_feedback)
            likes = sum(1 for f in all_feedback if f.rating == 1)
            dislikes = sum(1 for f in all_feedback if f.rating == -1)
            
            return {
                "total_feedback": total,
                "likes": likes,
                "dislikes": dislikes,
                "like_percentage": round(likes / total * 100, 1) if total > 0 else 0,
                "subject_id": subject_id,
            }
    except RuntimeError:
        return {"error": "Database not configured"}


@app.get("/api/feedback/export")
def export_feedback(subject_id: str | None = None, limit: int = 100) -> list[dict]:
    """Export feedback data for fine-tuning and analysis."""
    try:
        with get_db() as db:
            query = db.query(Feedback).order_by(Feedback.created_at.desc())
            if subject_id:
                query = query.filter(Feedback.subject_id == subject_id)
            
            feedback_list = query.limit(limit).all()
            
            return [
                {
                    "id": f.id,
                    "subject_id": f.subject_id,
                    "user_question": f.user_question,
                    "assistant_message": f.message_content,
                    "rating": f.rating,
                    "rating_label": "like" if f.rating == 1 else "dislike" if f.rating == -1 else "neutral",
                    "created_at": f.created_at.isoformat(),
                }
                for f in feedback_list
            ]
    except RuntimeError:
        return []


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    system_prompt = build_subject_system_prompt(req.subject_id)
    messages = [{"role": "system", "content": system_prompt}] + [
        {"role": m.role, "content": m.content} for m in req.messages
    ]

    result = await chat_completion(
        messages=messages,
        max_tokens=req.max_tokens or 512,
        temperature=req.temperature or 0.4,
    )

    return ChatResponse(
        assistant=ChatMessage(role="assistant", content=result.content),
        model=result.model,
        stub=result.stub,
    )


@app.get("/api/recommendation/next-question", response_model=NextQuestionResponse)
async def next_question(subject_id: str) -> NextQuestionResponse:
    # MVP: stub recommendation. Later: read from progress/events and generate adaptively.
    if not settings.openai_base_url:
        return NextQuestionResponse(
            subject_id=subject_id,
            question_text=f"Practice: Give me a {subject_id} question at your current level.",
            rationale="Stub mode: enable local Llama 3.2 to generate personalized recommendations.",
            stub=True,
        )

    prompt = (
        "You are generating ONE next practice question for a student. "
        "Return only the question text (no solution)."
    )

    result = await chat_completion(
        messages=[
            {"role": "system", "content": prompt},
            {
                "role": "user",
                "content": f"Subject: {subject_id}. Suggest the next practice question.",
            },
        ],
        max_tokens=128,
        temperature=0.6,
    )

    return NextQuestionResponse(
        subject_id=subject_id,
        question_text=result.content.strip(),
        rationale="Suggested by local Llama 3.2 based on subject context.",
        stub=result.stub,
    )


@app.post("/api/feedback", response_model=FeedbackResponse)
async def submit_feedback(req: FeedbackRequest) -> FeedbackResponse:
    # Store feedback in database for model improvement and fine-tuning
    try:
        with get_db() as db:
            fb = Feedback(
                subject_id=req.subject_id,
                message_content=req.message_content,
                user_question=req.user_question,
                rating=req.rating,
                message_index=req.message_index,
            )
            db.add(fb)
            db.commit()
            db.refresh(fb)
            
            print(f"[FEEDBACK SAVED] id={fb.id}, subject={req.subject_id}, rating={req.rating}")
            return FeedbackResponse(ok=True, message="Feedback saved for model improvement.", feedback_id=fb.id)
    except Exception as e:
        print(f"[FEEDBACK ERROR] {e}")
        return FeedbackResponse(ok=False, message="Failed to save feedback.")


@app.get("/api/conversations", response_model=list[ConversationSummary])
def list_conversations(subject_id: str | None = None) -> list[ConversationSummary]:
    try:
        with get_db() as db:
            query = db.query(Conversation)
            if subject_id:
                query = query.filter(Conversation.subject_id == subject_id)
            conversations = query.order_by(Conversation.updated_at.desc()).limit(50).all()
            
            return [
                ConversationSummary(
                    id=c.id,
                    subject_id=c.subject_id,
                    title=c.title,
                    created_at=c.created_at.isoformat(),
                    updated_at=c.updated_at.isoformat(),
                    message_count=len(c.messages),
                )
                for c in conversations
            ]
    except RuntimeError:
        # DB not configured
        return []


@app.get("/api/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation(conversation_id: int) -> ConversationDetail:
    try:
        with get_db() as db:
            conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
            if not conversation:
                raise HTTPException(status_code=404, detail="Conversation not found")
            
            return ConversationDetail(
                id=conversation.id,
                subject_id=conversation.subject_id,
                title=conversation.title,
                created_at=conversation.created_at.isoformat(),
                messages=[
                    ChatMessage(role=m.role, content=m.content)
                    for m in sorted(conversation.messages, key=lambda x: x.created_at)
                ],
            )
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Database not configured")


@app.post("/api/conversations", response_model=SaveConversationResponse)
def save_conversation(req: SaveConversationRequest) -> SaveConversationResponse:
    try:
        with get_db() as db:
            conversation = Conversation(
                subject_id=req.subject_id,
                title=req.title,
            )
            db.add(conversation)
            db.flush()  # Get the ID
            
            for msg in req.messages:
                message = Message(
                    conversation_id=conversation.id,
                    role=msg.role,
                    content=msg.content,
                )
                db.add(message)
            
            return SaveConversationResponse(
                id=conversation.id,
                message="Conversation saved successfully",
            )
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Database not configured")


@app.delete("/api/conversations/{conversation_id}")
def delete_conversation(conversation_id: int) -> dict:
    try:
        with get_db() as db:
            conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
            if not conversation:
                raise HTTPException(status_code=404, detail="Conversation not found")
            db.delete(conversation)
            return {"ok": True, "message": "Conversation deleted"}
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Database not configured")
