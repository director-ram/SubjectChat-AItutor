from __future__ import annotations

from fastapi import Depends, FastAPI, HTTPException, status

from .config import get_settings
from .provider import ChatProvider
from .schemas import ChatRequest, ChatResponse, SubjectConfig, SubjectsListResponse, SubjectType, SuggestedQuestion
from .subjects import build_subject_system_prompt, get_default_subjects


app = FastAPI(
    title="SubjectChat API",
    version="0.1.0",
    description="Backend for the SubjectChat multi-subject tutoring chatbot.",
)


def get_chat_provider() -> ChatProvider:
    return ChatProvider()


@app.get("/health", tags=["system"])
async def health_check():
    settings = get_settings()
    return {
        "status": "ok",
        "env": settings.env,
    }


@app.get("/api/subjects", response_model=SubjectsListResponse, tags=["subjects"])
async def list_subjects() -> SubjectsListResponse:
    """
    List the default subjects available in the system.

    Custom subjects are not persisted yet; they are defined per-request on /api/chat,
    but this endpoint allows the frontend to show a base menu of subjects.
    """

    defaults = get_default_subjects()
    subjects = [
        SubjectConfig(
            id=subj["id"],
            name=subj["name"],
            description=subj["description"],
        )
        for subj in defaults.values()
    ]
    return SubjectsListResponse(subjects=subjects)


@app.post("/api/chat", response_model=ChatResponse, tags=["chat"])
async def chat(
    payload: ChatRequest,
    provider: ChatProvider = Depends(get_chat_provider),
) -> ChatResponse:
    """
    Main chat endpoint.

    Supports:
    - Default subjects (subject_type='default', subject_id='math' | 'physics' | ...)
    - Custom subjects (subject_type='custom', custom_subject={...})
    """

    if payload.subject_type is SubjectType.DEFAULT:
        if not payload.subject_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="subject_id is required when subject_type='default'.",
            )

    if payload.subject_type is SubjectType.CUSTOM:
        if payload.custom_subject is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="custom_subject is required when subject_type='custom'.",
            )

    if not payload.messages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one message is required.",
        )

    system_prompt = build_subject_system_prompt(
        subject_id=payload.subject_id,
        custom_subject=payload.custom_subject,
    )

    assistant_message = await provider.chat(
        messages=payload.messages,
        subject_system_prompt=system_prompt,
    )

    # Try to derive the latest user question for suggestions.
    last_user = None
    for msg in reversed(payload.messages):
        if msg.role.value == "user":
            last_user = msg
            break

    suggested_questions: list[SuggestedQuestion] | None = None
    if last_user is not None:
        raw_suggestions = await provider.suggest_next_questions(
            last_user_question=last_user.content,
            subject_system_prompt=system_prompt,
            max_suggestions=3,
        )
        suggested_questions = [SuggestedQuestion(text=q) for q in raw_suggestions]

    return ChatResponse(
        message=assistant_message,
        suggested_questions=suggested_questions,
    )

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.llm import chat_completion, chat_completion_stream
from app.subjects import build_subject_system_prompt, get_default_subjects
from app.moderation import check_user_content, REFUSAL_MESSAGE
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
from app.models import Conversation, Message, Feedback, CustomSubject

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


def _subject_stats():
    try:
        with get_db() as db:
            from sqlalchemy import func
            results = db.query(
                Conversation.subject_id,
                func.count(Conversation.id).label("conversation_count")
            ).group_by(Conversation.subject_id).all()
            return {sid: count for sid, count in results}
    except RuntimeError:
        return {}


@app.get("/api/subjects")
def list_subjects():
    """List default + custom subjects with conversation counts. Custom subjects have is_custom=True and can be deleted."""
    defaults = get_default_subjects()
    stats = _subject_stats()

    subjects = [
        {
            "id": subj["id"],
            "name": subj["name"],
            "description": subj["description"],
            "conversation_count": stats.get(subj["id"], 0),
            "is_custom": False,
        }
        for subj in defaults.values()
    ]

    try:
        with get_db() as db:
            for row in db.query(CustomSubject).order_by(CustomSubject.created_at.asc()).all():
                sid = f"custom-{row.id}"
                subjects.append({
                    "id": sid,
                    "name": row.name,
                    "description": row.description or "",
                    "conversation_count": stats.get(sid, 0),
                    "is_custom": True,
                })
    except RuntimeError:
        pass

    return {"subjects": subjects}


@app.post("/api/subjects/custom")
def create_custom_subject(req: dict) -> dict:
    """Create a custom subject; returns subject_id (e.g. custom-5) for use in chat and conversations."""
    name = (req.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    description = (req.get("description") or "").strip()
    teaching_style = (req.get("teaching_style") or "").strip()
    try:
        with get_db() as db:
            row = CustomSubject(name=name, description=description, teaching_style=teaching_style)
            db.add(row)
            db.flush()
            sid = f"custom-{row.id}"
            return {
                "id": sid,
                "subject_id": sid,
                "name": row.name,
                "description": row.description or "",
                "teaching_style": row.teaching_style or "",
                "is_custom": True,
            }
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Database not configured")


@app.delete("/api/subjects/{subject_id}")
def delete_custom_subject(subject_id: str) -> dict:
    """Delete a custom subject by id (e.g. custom-5). Also deletes conversations for that subject."""
    if not subject_id.startswith("custom-"):
        raise HTTPException(status_code=400, detail="Only custom subjects can be deleted")
    try:
        raw_id = subject_id[7:]
        pk = int(raw_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid custom subject id")
    try:
        with get_db() as db:
            row = db.query(CustomSubject).filter(CustomSubject.id == pk).first()
            if not row:
                raise HTTPException(status_code=404, detail="Custom subject not found")
            # Delete conversations (and messages via cascade) for this subject
            db.query(Conversation).filter(Conversation.subject_id == subject_id).delete()
            db.delete(row)
            return {"ok": True, "message": "Subject deleted"}
    except HTTPException:
        raise
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Database not configured")


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


def _last_user_content(req: ChatRequest) -> str:
    for m in reversed(req.messages):
        if m.role == "user":
            return m.content or ""
    return ""


def _get_system_prompt_for_subject(subject_id: str) -> str:
    """System prompt for chat: default subjects from llm, custom from DB."""
    if subject_id.startswith("custom-"):
        try:
            with get_db() as db:
                raw_id = subject_id[7:]
                pk = int(raw_id)
                row = db.query(CustomSubject).filter(CustomSubject.id == pk).first()
                if not row:
                    return build_subject_system_prompt(subject_id)
                base = (
                    "You are a helpful study tutor. Explain step-by-step, ask clarifying questions when needed, "
                    "and prefer hints before final answers."
                )
                parts = [base, f"You are teaching: {row.name}."]
                if row.description:
                    parts.append(f"Description: {row.description}")
                if row.teaching_style:
                    parts.append(f"Teaching style: {row.teaching_style}")
                return "\n\n".join(parts)
        except (ValueError, RuntimeError):
            return build_subject_system_prompt(subject_id)
    return build_subject_system_prompt(subject_id)


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    allowed, refusal = check_user_content(_last_user_content(req))
    if not allowed and refusal:
        return ChatResponse(
            assistant=ChatMessage(role="assistant", content=refusal),
            model="moderation",
            stub=True,
        )
    system_prompt = _get_system_prompt_for_subject(req.subject_id)
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


async def _stream_chat_events(req: ChatRequest):
    """SSE generator for streaming chat. Yields 'data: {"content": "..."}\n\n'."""
    import json
    allowed, refusal = check_user_content(_last_user_content(req))
    if not allowed and refusal:
        yield f"data: {json.dumps({'content': refusal})}\n\n"
        return

    system_prompt = _get_system_prompt_for_subject(req.subject_id)
    messages = [{"role": "system", "content": system_prompt}] + [
        {"role": m.role, "content": m.content} for m in req.messages
    ]
    async for chunk in chat_completion_stream(
        messages=messages,
        max_tokens=req.max_tokens or 512,
        temperature=req.temperature or 0.4,
    ):
        yield f"data: {json.dumps({'content': chunk})}\n\n"


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    """Stream assistant response as Server-Sent Events. Each event has { content: string }."""
    return StreamingResponse(
        _stream_chat_events(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
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


# --- Profile notes (LLM-structured notes per subject) ---

def _get_subject_name(subject_id: str) -> str:
    if subject_id.startswith("custom-"):
        try:
            pk = int(subject_id[7:])
            with get_db() as db:
                row = db.query(CustomSubject).filter(CustomSubject.id == pk).first()
                if row:
                    return row.name
        except (ValueError, RuntimeError):
            pass
        return subject_id
    defaults = get_default_subjects()
    return defaults.get(subject_id, {}).get("name", subject_id)


@app.get("/api/profile/notes")
async def get_profile_notes(subject_id: str | None = None) -> list[dict]:
    """
    For each subject that has at least one saved conversation, generate structured notes
    using the LLM from the conversation history (key topics, progress, areas to review).
    Optional: ?subject_id=math to generate notes for a single subject only (e.g. for regenerate).
    """
    try:
        with get_db() as db:
            rows = db.query(Conversation.subject_id).distinct().all()
            all_ids = [r[0] for r in rows if r[0]]
        subject_ids = [subject_id] if subject_id else all_ids
        subject_ids = [s for s in subject_ids if s in all_ids]
    except RuntimeError:
        return []

    result = []
    for subject_id in subject_ids:
        try:
            with get_db() as db:
                convs = (
                    db.query(Conversation)
                    .filter(Conversation.subject_id == subject_id)
                    .order_by(Conversation.updated_at.desc())
                    .limit(5)
                    .all()
                )
            if not convs:
                continue

            # Build context: recent conversation excerpts (last 2 messages per conv to avoid token overflow)
            parts = []
            for c in convs:
                msgs = sorted(c.messages, key=lambda m: m.created_at)
                for m in msgs[-6:]:  # last 3 exchanges per conversation
                    parts.append(f"[{m.role}]: {m.content[:500]}")
            context = "\n\n".join(parts)
            if len(context) > 3000:
                context = context[:3000] + "\n\n..."

            prompt = (
                "You are a study coach. Based on the following chat history between a student and a tutor "
                f"for the subject \"{_get_subject_name(subject_id)}\", produce structured notes for the student's profile. "
                "Use clear sections: Key topics covered, Progress summary, Areas to review, Suggested next steps. "
                "Keep each section concise (2–4 bullet points). Output only the notes, no preamble.\n\n"
                "Chat history:\n" + context
            )

            llm_result = await chat_completion(
                messages=[{"role": "user", "content": prompt}],
                max_tokens=512,
                temperature=0.3,
            )
            result.append({
                "subject_id": subject_id,
                "subject_name": _get_subject_name(subject_id),
                "notes": llm_result.content.strip(),
            })
        except Exception as e:
            result.append({
                "subject_id": subject_id,
                "subject_name": _get_subject_name(subject_id),
                "notes": f"(Notes could not be generated: {e})",
            })

    return result
