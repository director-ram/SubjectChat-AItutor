from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index, SmallInteger
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()


class Feedback(Base):
    """Store user feedback (thumbs up/down) for model improvement and fine-tuning."""
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(String(64), nullable=False, index=True)
    message_content = Column(Text, nullable=False)  # The assistant's message that was rated
    user_question = Column(Text)  # The user's question that prompted this response
    rating = Column(SmallInteger, nullable=False)  # -1 (dislike), 0 (neutral), 1 (like)
    message_index = Column(Integer)  # Position in conversation
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("ix_feedback_subject_rating", "subject_id", "rating"),
        Index("ix_feedback_created", "created_at"),
    )


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(String(64), nullable=False, index=True)
    title = Column(String(256), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_conversations_subject_created", "subject_id", "created_at"),
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(16), nullable=False)  # user, assistant, system
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    conversation = relationship("Conversation", back_populates="messages")


class CustomSubject(Base):
    """User-created subjects; subject_id in conversations is 'custom-{id}'."""
    __tablename__ = "custom_subjects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    description = Column(Text, default="", nullable=False)
    teaching_style = Column(Text, default="", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
