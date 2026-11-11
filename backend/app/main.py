from contextlib import asynccontextmanager
from datetime import datetime
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from . import service
from .config import settings
from .db import Base, SessionLocal, engine, get_db, utcnow
from .models import Card, PushToken, User
from .push import Sender, is_expo_token, send_expo_push
from .seed import seed_content
from .srs import AnswerError


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Prototype convenience: create tables and load content on startup.
    # A real deployment would use Alembic migrations and a separate seed step.
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_content(db)
    yield


app = FastAPI(title="Sysdrill API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DB = Annotated[Session, Depends(get_db)]


def get_now() -> datetime:
    return utcnow()


def get_sender() -> Sender:
    return send_expo_push


Now = Annotated[datetime, Depends(get_now)]


# ---------- schemas ----------

def _check_tz(v: str) -> str:
    try:
        ZoneInfo(v)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError(f"unknown timezone {v!r}") from None
    return v


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    timezone: str
    daily_goal: int = Field(default=settings.default_daily_goal, ge=1, le=50)
    reminder_hour: int = Field(default=settings.default_reminder_hour, ge=0, le=23)
    reminder_minute: int = Field(default=0, ge=0, le=59)

    _tz = field_validator("timezone")(_check_tz)


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    timezone: str | None = None
    daily_goal: int | None = Field(default=None, ge=1, le=50)
    reminder_hour: int | None = Field(default=None, ge=0, le=23)
    reminder_minute: int | None = Field(default=None, ge=0, le=59)

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str | None) -> str | None:
        return None if v is None else _check_tz(v)


class ReviewIn(BaseModel):
    card_id: str
    answer: Any
    is_retry: bool = False
    duration_ms: int | None = Field(default=None, ge=0)


class PushTokenIn(BaseModel):
    token: str
    platform: Literal["ios", "android", "web"]


# ---------- helpers ----------

def _user(db: Session, user_id: str) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "user not found")
    return user


# ---------- routes ----------

@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/users", status_code=201)
def create_user(body: UserCreate, db: DB, now: Now) -> dict:
    user = User(
        name=body.name.strip(),
        timezone=body.timezone,
        daily_goal=body.daily_goal,
        reminder_hour=body.reminder_hour,
        reminder_minute=body.reminder_minute,
        streak_freezes=settings.starting_streak_freezes,
    )
    db.add(user)
    db.flush()
    service.refresh_reminder(db, user, now)
    db.commit()
    return service.user_summary(db, user, now)


@app.get("/users/{user_id}")
def get_user(user_id: str, db: DB, now: Now) -> dict:
    return service.user_summary(db, _user(db, user_id), now)


@app.patch("/users/{user_id}")
def update_user(user_id: str, body: UserUpdate, db: DB, now: Now) -> dict:
    user = _user(db, user_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    service.refresh_reminder(db, user, now)
    db.commit()
    return service.user_summary(db, user, now)


@app.get("/users/{user_id}/session")
def get_session(user_id: str, db: DB, now: Now) -> dict:
    return service.build_session(db, _user(db, user_id), now)


@app.post("/users/{user_id}/reviews")
def post_review(user_id: str, body: ReviewIn, db: DB, now: Now) -> dict:
    user = _user(db, user_id)
    card = db.get(Card, body.card_id)
    if card is None:
        raise HTTPException(404, "card not found")
    try:
        return service.submit_review(db, user, card, body.answer, now, body.is_retry, body.duration_ms)
    except AnswerError as exc:
        raise HTTPException(422, str(exc)) from None


@app.get("/users/{user_id}/skills")
def get_skills(user_id: str, db: DB) -> list[dict]:
    return service.skill_progress(db, _user(db, user_id))


@app.post("/users/{user_id}/push-tokens", status_code=201)
def register_push_token(user_id: str, body: PushTokenIn, db: DB, now: Now) -> dict:
    user = _user(db, user_id)
    if not is_expo_token(body.token):
        raise HTTPException(422, "expected an Expo push token like ExponentPushToken[...]")
    tok = db.get(PushToken, body.token)
    if tok is None:
        db.add(PushToken(token=body.token, user_id=user.id, platform=body.platform))
    else:
        tok.user_id = user.id  # same device, possibly a new account: move the token
        tok.platform = body.platform
    db.flush()
    service.refresh_reminder(db, user, now)
    db.commit()
    return {"ok": True, "next_reminder_at": user.next_reminder_at}


@app.delete("/users/{user_id}/push-tokens/{token}")
def delete_push_token(user_id: str, token: str, db: DB, now: Now) -> dict:
    user = _user(db, user_id)
    tok = db.get(PushToken, token)
    if tok and tok.user_id == user.id:
        db.delete(tok)
        db.flush()
        service.refresh_reminder(db, user, now)
        db.commit()
    return {"ok": True}


# ---------- debug (disable with SYSDRILL_ENABLE_DEBUG_ROUTES=false) ----------

if settings.enable_debug_routes:

    @app.post("/debug/users/{user_id}/test-push")
    def debug_test_push(user_id: str, db: DB, sender: Annotated[Sender, Depends(get_sender)]) -> dict:
        return service.send_test_push(db, _user(db, user_id), sender)

    @app.post("/debug/run-reminders")
    def debug_run_reminders(db: DB, now: Now, sender: Annotated[Sender, Depends(get_sender)]) -> dict:
        return service.run_reminder_tick(db, now, sender)
