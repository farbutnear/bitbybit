"""The learning path: which tracks a user chose, which lessons are open, and lesson contents.

Lessons are authored sequences of teaching screens and cards. Within a track they unlock in
order: finished lessons can be replayed, the first unfinished one is "next", the rest are locked.
Tracks themselves are never locked; the user picks any that have content.
"""

import random
from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from . import loot, srs
from .models import Card, Lesson, Step, Track, Unit, User, UserCard, UserLesson, UserTrack


class CourseError(ValueError):
    """A request that doesn't fit the course rules (unknown track, locked lesson, ...)."""


# ---------- tracks ----------

def _lesson_totals(db: Session) -> dict[str, int]:
    return dict(db.execute(select(Lesson.track_id, func.count()).group_by(Lesson.track_id)).all())


def _lessons_done(db: Session, user: User) -> dict[str, int]:
    return dict(
        db.execute(
            select(Lesson.track_id, func.count())
            .join(UserLesson, UserLesson.lesson_id == Lesson.id)
            .where(UserLesson.user_id == user.id)
            .group_by(Lesson.track_id)
        ).all()
    )


def chosen_track_ids(db: Session, user: User) -> list[str]:
    return list(
        db.scalars(
            select(UserTrack.track_id)
            .join(Track, Track.id == UserTrack.track_id)
            .where(UserTrack.user_id == user.id)
            .order_by(Track.position)
        )
    )


def list_tracks(db: Session, user: User | None = None) -> list[dict]:
    """All tracks in course order. A track with no lessons yet is listed as unavailable."""
    totals = _lesson_totals(db)
    done = _lessons_done(db, user) if user else {}
    chosen = set(chosen_track_ids(db, user)) if user else set()
    return [
        {
            "id": t.id,
            "title": t.title,
            "blurb": t.blurb,
            "icon": t.icon,
            "available": totals.get(t.id, 0) > 0,
            "lessons_total": totals.get(t.id, 0),
            "lessons_done": done.get(t.id, 0),
            "chosen": t.id in chosen,
            "active": bool(user and user.active_track_id == t.id),
        }
        for t in db.scalars(select(Track).order_by(Track.position))
    ]


def default_track_ids(db: Session) -> list[str]:
    """The first track that has content: where a beginner should start."""
    totals = _lesson_totals(db)
    for t in db.scalars(select(Track).order_by(Track.position)):
        if totals.get(t.id, 0) > 0:
            return [t.id]
    return []


def set_tracks(db: Session, user: User, track_ids: list[str], active_track_id: str | None = None) -> None:
    """Replace the user's chosen tracks. Progress in a dropped track is kept."""
    wanted = list(dict.fromkeys(track_ids))  # de-duplicate, keep order
    if not wanted:
        raise CourseError("choose at least one track")
    totals = _lesson_totals(db)
    known = {t.id for t in db.scalars(select(Track))}
    for tid in wanted:
        if tid not in known:
            raise CourseError(f"unknown track {tid!r}")
        if totals.get(tid, 0) == 0:
            raise CourseError(f"track {tid!r} has no lessons yet")
    if active_track_id is not None and active_track_id not in wanted:
        raise CourseError("the active track must be one of the chosen tracks")

    db.execute(delete(UserTrack).where(UserTrack.user_id == user.id))
    for tid in wanted:
        db.add(UserTrack(user_id=user.id, track_id=tid))
    if active_track_id is not None:
        user.active_track_id = active_track_id
    elif user.active_track_id not in wanted:
        # Keep the current one if still chosen; otherwise fall back to the first in course order.
        order = [t.id for t in db.scalars(select(Track).order_by(Track.position)) if t.id in wanted]
        user.active_track_id = order[0]
    db.flush()


# ---------- path ----------

def _statuses(db: Session, user: User, track_id: str) -> tuple[list[Lesson], dict[str, str]]:
    lessons = list(db.scalars(select(Lesson).where(Lesson.track_id == track_id).order_by(Lesson.position)))
    done = set(
        db.scalars(
            select(UserLesson.lesson_id)
            .join(Lesson, Lesson.id == UserLesson.lesson_id)
            .where(UserLesson.user_id == user.id, Lesson.track_id == track_id)
        )
    )
    status: dict[str, str] = {}
    next_given = False
    for les in lessons:
        if les.id in done:
            status[les.id] = "done"
        elif not next_given:
            status[les.id] = "next"
            next_given = True
        else:
            status[les.id] = "locked"
    return lessons, status


def track_path(db: Session, user: User, track_id: str) -> dict:
    track = db.get(Track, track_id)
    if track is None:
        raise CourseError(f"unknown track {track_id!r}")
    lessons, status = _statuses(db, user, track_id)
    card_counts = dict(
        db.execute(
            select(Step.lesson_id, func.count())
            .join(Lesson, Lesson.id == Step.lesson_id)
            .where(Lesson.track_id == track_id, Step.kind == "card")
            .group_by(Step.lesson_id)
        ).all()
    )
    by_unit: dict[str, list[dict]] = {}
    for les in lessons:
        by_unit.setdefault(les.unit_id, []).append(
            {"id": les.id, "title": les.title, "status": status[les.id], "card_count": card_counts.get(les.id, 0)}
        )
    units = [
        {"id": u.id, "title": u.title, "number": i + 1, "lessons": by_unit.get(u.id, [])}
        for i, u in enumerate(db.scalars(select(Unit).where(Unit.track_id == track_id).order_by(Unit.position)))
    ]
    done = sum(1 for v in status.values() if v == "done")
    return {
        "track": {"id": track.id, "title": track.title, "blurb": track.blurb, "icon": track.icon},
        "units": units,
        "lessons_done": done,
        "lessons_total": len(lessons),
    }


# ---------- lessons ----------

def lesson_payload(db: Session, user: User, lesson: Lesson, rng: random.Random | None = None) -> dict:
    """Everything the app needs to play a lesson. Card answers are never included."""
    _lessons, status = _statuses(db, user, lesson.track_id)
    if status[lesson.id] == "locked":
        raise CourseError("finish the earlier lessons on this track first")
    rng = rng or random.Random()
    steps = list(db.scalars(select(Step).where(Step.lesson_id == lesson.id).order_by(Step.position)))
    card_ids = [s.card_id for s in steps if s.kind == "card"]
    cards = {c.id: c for c in db.scalars(select(Card).where(Card.id.in_(card_ids)))}
    seen = set(
        db.scalars(select(UserCard.card_id).where(UserCard.user_id == user.id, UserCard.card_id.in_(card_ids)))
    )
    out = []
    for s in steps:
        if s.kind == "teach":
            out.append({"type": "teach", **(s.data or {})})
        else:
            reason = "ahead" if s.card_id in seen else "new"
            out.append({"type": "card", "card": srs.public_payload(cards[s.card_id], rng) | {"reason": reason}})
    unit = db.get(Unit, lesson.unit_id)
    return {
        "id": lesson.id,
        "title": lesson.title,
        "track_id": lesson.track_id,
        "unit_title": unit.title if unit else "",
        "status": status[lesson.id],
        "steps": out,
    }


def complete_lesson(db: Session, user: User, lesson: Lesson, now: datetime) -> dict:
    """Mark a lesson finished once every card in it has been answered. Safe to call twice."""
    lessons, status = _statuses(db, user, lesson.track_id)
    if status[lesson.id] == "locked":
        raise CourseError("finish the earlier lessons on this track first")
    card_ids = list(db.scalars(select(Step.card_id).where(Step.lesson_id == lesson.id, Step.kind == "card")))
    answered = set(
        db.scalars(select(UserCard.card_id).where(UserCard.user_id == user.id, UserCard.card_id.in_(card_ids)))
    )
    if set(card_ids) - answered:
        raise CourseError("answer every card in the lesson before finishing it")

    first_time = status[lesson.id] != "done"
    bits_earned = 0
    if first_time:
        db.add(UserLesson(user_id=user.id, lesson_id=lesson.id, completed_at=now))
        bits_earned = loot.award(db, user, loot.BITS_LESSON)  # replays pay nothing extra
        db.commit()
        lessons, status = _statuses(db, user, lesson.track_id)

    nxt = next((les for les in lessons if status[les.id] == "next"), None)
    done = sum(1 for v in status.values() if v == "done")
    return {
        "first_time": first_time,
        "bits_earned": bits_earned,
        "bits": user.bits,
        "next_lesson": {"id": nxt.id, "title": nxt.title} if nxt else None,
        "track_complete": nxt is None,
        "lessons_done": done,
        "lessons_total": len(lessons),
    }
