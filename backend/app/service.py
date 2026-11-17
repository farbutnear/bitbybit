"""Core application logic, kept separate from HTTP so the worker and tests can call it directly."""

import random
from datetime import datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from . import srs
from .config import settings
from .models import Card, PushToken, Review, Track, User, UserCard, UserTrack
from .push import PushMessage, Sender
from .reminders import next_reminder_at, reminder_message
from .streaks import StreakState, apply_goal_met, displayed_streak, is_at_risk, local_today

# ---------- streak helpers ----------

def streak_state(user: User) -> StreakState:
    return StreakState(
        current=user.current_streak,
        longest=user.longest_streak,
        freezes=user.streak_freezes,
        last_goal_date=user.last_goal_date,
    )


def _save_streak(user: User, s: StreakState) -> None:
    user.current_streak = s.current
    user.longest_streak = s.longest
    user.streak_freezes = s.freezes
    user.last_goal_date = s.last_goal_date


# ---------- counts ----------

def today_count(db: Session, user: User, now: datetime) -> int:
    today = local_today(user.timezone, now)
    return db.scalar(
        select(func.count()).select_from(Review).where(Review.user_id == user.id, Review.local_date == today)
    ) or 0


def due_count(db: Session, user: User, now: datetime) -> int:
    return db.scalar(
        select(func.count()).select_from(UserCard).where(UserCard.user_id == user.id, UserCard.due <= now)
    ) or 0


def learned_count(db: Session, user: User) -> int:
    return db.scalar(select(func.count()).select_from(UserCard).where(UserCard.user_id == user.id)) or 0


def has_push(db: Session, user: User) -> bool:
    return db.scalar(select(func.count()).select_from(PushToken).where(PushToken.user_id == user.id)) > 0


# ---------- users ----------

def refresh_reminder(db: Session, user: User, now: datetime) -> None:
    """Server reminders only run for users with a registered push token.

    Users without one (e.g. running in Expo Go) get local notifications scheduled on the
    device instead, so the worker never has to look at them.
    """
    if has_push(db, user):
        user.next_reminder_at = next_reminder_at(user.timezone, user.reminder_hour, user.reminder_minute, now)
    else:
        user.next_reminder_at = None


def user_summary(db: Session, user: User, now: datetime) -> dict:
    today = local_today(user.timezone, now)
    s = streak_state(user)
    return {
        "id": user.id,
        "name": user.name,
        "timezone": user.timezone,
        "daily_goal": user.daily_goal,
        "reminder_hour": user.reminder_hour,
        "reminder_minute": user.reminder_minute,
        "streak": {
            "current": displayed_streak(s, today),
            "longest": s.longest,
            "freezes": s.freezes,
            "at_risk": is_at_risk(s, today),
        },
        "today_count": today_count(db, user, now),
        "goal_met_today": user.last_goal_date == today,
        "due_count": due_count(db, user, now),
        "learned_count": learned_count(db, user),
        "has_push": has_push(db, user),
        "active_track_id": user.active_track_id,
        "track_ids": list(
            db.scalars(
                select(UserTrack.track_id)
                .join(Track, Track.id == UserTrack.track_id)
                .where(UserTrack.user_id == user.id)
                .order_by(Track.position)
            )
        ),
    }


# ---------- review (spaced repetition) ----------

def build_review(db: Session, user: User, now: datetime, practice: bool = False, rng: random.Random | None = None) -> dict:
    """Cards the user has already met in a lesson and that FSRS says are due.

    New material only ever arrives through lessons (see course.py). With practice=True and
    nothing due, the cards due soonest are offered instead, so there is always a way to
    reach the daily goal.
    """
    size = settings.session_size
    rows = list(
        db.execute(
            select(UserCard.card_id, UserCard.due)
            .where(UserCard.user_id == user.id, UserCard.due <= now)
            .order_by(UserCard.due)
            .limit(size)
        )
    )
    reason = "due"
    if not rows and practice:
        rows = list(
            db.execute(
                select(UserCard.card_id, UserCard.due)
                .where(UserCard.user_id == user.id)
                .order_by(UserCard.due)
                .limit(size)
            )
        )
        reason = "ahead"
    ids = [r[0] for r in rows]
    cards = {c.id: c for c in db.scalars(select(Card).where(Card.id.in_(ids)))}
    rng = rng or random.Random()
    next_due = db.scalar(select(func.min(UserCard.due)).where(UserCard.user_id == user.id, UserCard.due > now))
    return {
        "cards": [srs.public_payload(cards[i], rng) | {"reason": reason} for i in ids],
        "due_count": due_count(db, user, now),
        "learned_count": learned_count(db, user),
        "next_due": next_due,
    }


def submit_review(
    db: Session,
    user: User,
    card: Card,
    answer: Any,
    now: datetime,
    is_retry: bool = False,
    duration_ms: int | None = None,
) -> dict:
    correct, canonical = srs.grade(card, answer)  # raises srs.AnswerError on malformed answers
    today = local_today(user.timezone, now)

    uc = db.get(UserCard, (user.id, card.id))
    schedule_it = not (is_retry and uc is not None)
    if schedule_it:
        new = srs.schedule(uc.fsrs if uc else None, correct, now)
        if uc is None:
            uc = UserCard(user_id=user.id, card_id=card.id, first_seen_date=today, reps=0, lapses=0)
            db.add(uc)
        elif not correct:
            uc.lapses += 1
        uc.fsrs = new.to_dict()
        uc.due = new.due
        uc.stability = float(new.stability or 0.0)
        uc.reps += 1
        uc.last_review = now

    db.add(
        Review(
            user_id=user.id,
            card_id=card.id,
            correct=correct,
            rating=srs.rating_for(correct) if schedule_it else 0,
            reviewed_at=now,
            local_date=today,
            duration_ms=duration_ms,
        )
    )
    db.flush()

    count = today_count(db, user, now)
    just_met_goal = False
    if count >= user.daily_goal and user.last_goal_date != today:
        _save_streak(user, apply_goal_met(streak_state(user), today, settings.max_streak_freezes))
        just_met_goal = True
    db.commit()

    s = streak_state(user)
    return {
        "correct": correct,
        "correct_answer": canonical,
        "explanation": card.explanation,
        "next_due": uc.due if uc else None,
        "today_count": count,
        "goal_met_today": user.last_goal_date == today,
        "just_met_goal": just_met_goal,
        "streak": {
            "current": displayed_streak(s, today),
            "longest": s.longest,
            "freezes": s.freezes,
            "at_risk": is_at_risk(s, today),
        },
    }


# ---------- reminders ----------

def _prune(db: Session, results) -> int:
    dead = [r.token for r in results if not r.ok and r.error == "DeviceNotRegistered"]
    for token in dead:
        tok = db.get(PushToken, token)
        if tok:
            db.delete(tok)
    return len(dead)


def run_reminder_tick(db: Session, now: datetime, sender: Sender) -> dict:
    """Send reminders to users whose reminder time has passed and who haven't practiced today.

    Each user is *claimed* with a conditional UPDATE before sending, so two workers running
    at once can't both send. The claim moves next_reminder_at forward before the send:
    if the send then fails, that user misses one reminder. For nudges, at-most-once is the
    right trade-off; a duplicate "your streak is at risk" is worse than a missed one.
    """
    stats = {"claimed": 0, "sent": 0, "skipped_goal_met": 0, "pruned": 0, "failed": 0}
    candidates = list(
        db.scalars(
            select(User)
            .where(User.next_reminder_at.is_not(None), User.next_reminder_at <= now)
            .order_by(User.next_reminder_at)
            .limit(settings.worker_batch_size)
        )
    )
    for user in candidates:
        old = user.next_reminder_at
        new = next_reminder_at(user.timezone, user.reminder_hour, user.reminder_minute, now)
        res = db.execute(
            update(User).where(User.id == user.id, User.next_reminder_at == old).values(next_reminder_at=new)
        )
        db.commit()
        if res.rowcount != 1:
            continue  # another worker got it
        stats["claimed"] += 1
        db.refresh(user)

        if user.last_goal_date == local_today(user.timezone, now):
            stats["skipped_goal_met"] += 1
            continue

        tokens = list(db.scalars(select(PushToken.token).where(PushToken.user_id == user.id)))
        if not tokens:
            continue
        summary = user_summary(db, user, now)
        title, body = reminder_message(
            summary["streak"]["current"], summary["due_count"], user.daily_goal, summary["today_count"]
        )
        results = sender([PushMessage(to=t, title=title, body=body, data={"type": "reminder"}) for t in tokens])
        stats["sent"] += sum(r.ok for r in results)
        stats["failed"] += sum(not r.ok for r in results)
        stats["pruned"] += _prune(db, results)
        db.commit()
    return stats


def send_test_push(db: Session, user: User, sender: Sender) -> dict:
    tokens = list(db.scalars(select(PushToken.token).where(PushToken.user_id == user.id)))
    if not tokens:
        return {"sent": 0, "failed": 0, "detail": "no push tokens registered for this user"}
    results = sender(
        [PushMessage(to=t, title="bitbybit test push", body="Server push is working 🎉", data={"type": "test"})
         for t in tokens]
    )
    pruned = _prune(db, results)
    db.commit()
    return {
        "sent": sum(r.ok for r in results),
        "failed": sum(not r.ok for r in results),
        "pruned": pruned,
        "errors": [r.error for r in results if not r.ok],
    }
