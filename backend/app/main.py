import random
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from . import course, loot, service, sim
from .config import settings
from .db import SessionLocal, get_db, init_db, utcnow
from .models import Card, Lesson, PushToken, User
from .push import Sender, is_expo_token, send_expo_push
from .seed import seed_content
from .srs import AnswerError
from .streaks import local_today


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Prototype convenience: create tables and load content on startup.
    # A real deployment would use Alembic migrations and a separate seed step.
    init_db(reset_on_change=settings.reset_db_on_schema_change)
    with SessionLocal() as db:
        seed_content(db)
    yield


app = FastAPI(title="bitbybit API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DB = Annotated[Session, Depends(get_db)]


def get_now() -> datetime:
    return utcnow()


def get_sender() -> Sender:
    return send_expo_push


def get_rng() -> random.Random:
    return random.Random()


Now = Annotated[datetime, Depends(get_now)]
Rng = Annotated[random.Random, Depends(get_rng)]


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
    track_ids: list[str] | None = None  # defaults to the first track with content

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


class TracksIn(BaseModel):
    track_ids: list[str]
    active_track_id: str | None = None


class ReviewIn(BaseModel):
    card_id: str
    answer: Any
    is_retry: bool = False
    duration_ms: int | None = Field(default=None, ge=0)
    session_id: str | None = None  # from the lesson or review payload; needed for perks to apply


class PerkIn(BaseModel):
    session_id: str
    perk: Literal["strike_option", "clear_node"]
    card_id: str


class SimRunIn(BaseModel):
    config: dict[str, Any] = Field(default_factory=dict)  # knob id -> value; missing knobs use the level's default


class PushTokenIn(BaseModel):
    token: str
    platform: Literal["ios", "android", "web"]


# ---------- helpers ----------

def _user(db: Session, user_id: str) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "user not found")
    return user


def _lesson(db: Session, lesson_id: str) -> Lesson:
    lesson = db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(404, "lesson not found")
    return lesson


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
        bits=settings.starting_bits,
    )
    db.add(user)
    db.flush()
    try:
        course.set_tracks(db, user, body.track_ids or course.default_track_ids(db))
    except course.CourseError as exc:
        db.rollback()
        raise HTTPException(422, str(exc)) from None
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


# ----- course: tracks, path, lessons -----

@app.get("/tracks")
def get_tracks(db: DB) -> list[dict]:
    """The catalogue, for the track picker shown before an account exists."""
    return course.list_tracks(db)


@app.get("/users/{user_id}/tracks")
def get_user_tracks(user_id: str, db: DB) -> list[dict]:
    return course.list_tracks(db, _user(db, user_id))


@app.put("/users/{user_id}/tracks")
def put_user_tracks(user_id: str, body: TracksIn, db: DB, now: Now) -> dict:
    user = _user(db, user_id)
    try:
        course.set_tracks(db, user, body.track_ids, body.active_track_id)
    except course.CourseError as exc:
        db.rollback()
        raise HTTPException(422, str(exc)) from None
    db.commit()
    return service.user_summary(db, user, now)


@app.get("/users/{user_id}/tracks/{track_id}/path")
def get_path(user_id: str, track_id: str, db: DB) -> dict:
    try:
        return course.track_path(db, _user(db, user_id), track_id)
    except course.CourseError as exc:
        raise HTTPException(404, str(exc)) from None


@app.get("/users/{user_id}/lessons/{lesson_id}")
def get_lesson(user_id: str, lesson_id: str, db: DB, now: Now) -> dict:
    user = _user(db, user_id)
    try:
        payload = course.lesson_payload(db, user, _lesson(db, lesson_id))
    except course.CourseError as exc:
        raise HTTPException(403, str(exc)) from None
    # Loading a lesson starts a run of it: that is what perk charges are counted against.
    return payload | {"session": loot.start_session(db, user, lesson_id, now)}


@app.post("/users/{user_id}/lessons/{lesson_id}/complete")
def post_lesson_complete(user_id: str, lesson_id: str, db: DB, now: Now) -> dict:
    try:
        return course.complete_lesson(db, _user(db, user_id), _lesson(db, lesson_id), now)
    except course.CourseError as exc:
        raise HTTPException(409, str(exc)) from None


# ----- review (spaced repetition) -----

@app.get("/users/{user_id}/review")
def get_review(user_id: str, db: DB, now: Now, practice: bool = False) -> dict:
    return service.build_review(db, _user(db, user_id), now, practice)


@app.post("/users/{user_id}/reviews")
def post_review(user_id: str, body: ReviewIn, db: DB, now: Now) -> dict:
    user = _user(db, user_id)
    card = db.get(Card, body.card_id)
    if card is None:
        raise HTTPException(404, "card not found")
    try:
        return service.submit_review(db, user, card, body.answer, now, body.is_retry, body.duration_ms, body.session_id)
    except AnswerError as exc:
        raise HTTPException(422, str(exc)) from None


# ----- bits, packs, gear and perks -----

@app.get("/users/{user_id}/loot")
def get_loot(user_id: str, db: DB) -> dict:
    """Balance, the gear catalogue with what is owned and equipped, and the published pack odds."""
    return loot.loot_summary(db, _user(db, user_id))


@app.post("/users/{user_id}/packs/open")
def post_open_pack(user_id: str, db: DB, now: Now, rng: Rng) -> dict:
    user = _user(db, user_id)
    try:
        opened = loot.open_pack(db, user, now, rng)
    except loot.LootError as exc:
        raise HTTPException(409, str(exc)) from None
    return opened | {"loot": loot.loot_summary(db, user)}


@app.post("/users/{user_id}/gear/{gear_id}/equip")
def post_equip(user_id: str, gear_id: str, db: DB) -> dict:
    return _set_equipped(db, user_id, gear_id, True)


@app.post("/users/{user_id}/gear/{gear_id}/unequip")
def post_unequip(user_id: str, gear_id: str, db: DB) -> dict:
    return _set_equipped(db, user_id, gear_id, False)


def _set_equipped(db: Session, user_id: str, gear_id: str, on: bool) -> dict:
    user = _user(db, user_id)
    try:
        loot.equip(db, user, gear_id, on)
    except loot.LootError as exc:
        raise HTTPException(409, str(exc)) from None
    return loot.loot_summary(db, user)


@app.post("/users/{user_id}/shop/freeze")
def post_buy_freeze(user_id: str, db: DB) -> dict:
    user = _user(db, user_id)
    try:
        loot.buy_freeze(db, user)
    except loot.LootError as exc:
        raise HTTPException(409, str(exc)) from None
    return loot.loot_summary(db, user)


@app.post("/users/{user_id}/perks/use")
def post_use_perk(user_id: str, body: PerkIn, db: DB, now: Now, rng: Rng) -> dict:
    user = _user(db, user_id)
    session = loot.get_session(db, user, body.session_id)
    card = db.get(Card, body.card_id)
    if session is None or card is None:
        raise HTTPException(404, "session or card not found")
    try:
        return loot.use_perk(db, user, session, body.perk, card, now, rng)
    except loot.LootError as exc:
        raise HTTPException(409, str(exc)) from None


# ----- simulator -----

def _sim_level(user: User, level_id: str, now: datetime) -> dict:
    level = sim.get_level(level_id, local_today(user.timezone, now))
    if level is None:
        raise HTTPException(404, "sim level not found")
    return level


@app.get("/users/{user_id}/sim")
def get_sim_overview(user_id: str, db: DB, now: Now) -> dict:
    """The simulator levels with this user's progress, and today's incident."""
    user = _user(db, user_id)
    return sim.overview(db, user, local_today(user.timezone, now))


@app.get("/users/{user_id}/sim/{level_id}")
def get_sim_level(user_id: str, level_id: str, db: DB, now: Now) -> dict:
    """A level's story, knobs and goals, plus how the system behaves before anything is changed. `incident` is today's."""
    return sim.public_level(_sim_level(_user(db, user_id), level_id, now))


@app.post("/users/{user_id}/sim/{level_id}/run")
def post_sim_run(user_id: str, level_id: str, body: SimRunIn, db: DB, now: Now) -> dict:
    user = _user(db, user_id)
    try:
        return sim.run(db, user, _sim_level(user, level_id, now), body.config, now)
    except sim.SimError as exc:
        raise HTTPException(422, str(exc)) from None


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


# ---------- debug (disable with BITBYBIT_ENABLE_DEBUG_ROUTES=false) ----------

if settings.enable_debug_routes:

    @app.post("/debug/users/{user_id}/test-push")
    def debug_test_push(user_id: str, db: DB, sender: Annotated[Sender, Depends(get_sender)]) -> dict:
        return service.send_test_push(db, _user(db, user_id), sender)

    @app.post("/debug/run-reminders")
    def debug_run_reminders(db: DB, now: Now, sender: Annotated[Sender, Depends(get_sender)]) -> dict:
        return service.run_reminder_tick(db, now, sender)
