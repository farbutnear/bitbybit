import uuid
from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base, UTCDateTime, utcnow


def _uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(80))
    timezone: Mapped[str] = mapped_column(String(64))  # IANA name, e.g. "Asia/Singapore"
    daily_goal: Mapped[int] = mapped_column(Integer)
    reminder_hour: Mapped[int] = mapped_column(Integer)
    reminder_minute: Mapped[int] = mapped_column(Integer, default=0)

    # Streak state. Days are the user's *local* calendar dates.
    current_streak: Mapped[int] = mapped_column(Integer, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0)
    streak_freezes: Mapped[int] = mapped_column(Integer, default=0)
    last_goal_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # When the reminder worker should next consider this user (UTC). Indexed so the
    # worker's "who is due" query is a range scan, not a full table scan.
    next_reminder_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer)


class Card(Base):
    __tablename__ = "cards"

    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.id"))
    position: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(16))  # "mcq" | "order" | "numeric"
    prompt: Mapped[str] = mapped_column(Text)
    data: Mapped[dict] = mapped_column(JSON)  # kind-specific; contains the answer, never sent raw
    explanation: Mapped[str] = mapped_column(Text)


class UserCard(Base):
    """Per-user spaced-repetition state for one card. A row exists once the card was reviewed."""

    __tablename__ = "user_cards"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    card_id: Mapped[str] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), primary_key=True)
    fsrs: Mapped[dict] = mapped_column(JSON)  # serialized fsrs.Card
    due: Mapped[datetime] = mapped_column(UTCDateTime)
    stability: Mapped[float] = mapped_column()  # denormalized from fsrs for progress queries
    reps: Mapped[int] = mapped_column(Integer, default=0)
    lapses: Mapped[int] = mapped_column(Integer, default=0)
    first_seen_date: Mapped[date] = mapped_column(Date)  # user-local date, for the new-cards/day cap
    last_review: Mapped[datetime] = mapped_column(UTCDateTime)

    __table_args__ = (Index("ix_user_cards_user_due", "user_id", "due"),)


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    card_id: Mapped[str] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"))
    correct: Mapped[bool] = mapped_column(Boolean)
    rating: Mapped[int] = mapped_column(Integer)
    reviewed_at: Mapped[datetime] = mapped_column(UTCDateTime)
    local_date: Mapped[date] = mapped_column(Date)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    __table_args__ = (Index("ix_reviews_user_local_date", "user_id", "local_date"),)


class PushToken(Base):
    __tablename__ = "push_tokens"

    token: Mapped[str] = mapped_column(String(255), primary_key=True)  # ExponentPushToken[...]
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    platform: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
