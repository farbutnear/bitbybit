"""Core application logic, kept separate from HTTP so the worker and tests can call it directly."""

import random
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from . import loot, srs
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


def uptime_history(db: Session, user: User, today: date, days: int = 14) -> list[dict]:
    """The last `days` local days, oldest first, for the uptime bar on the home screen.

    met: the daily goal was reached. frozen: missed, but a freeze kept the streak alive.
    missed: nothing held. today: still in progress.
    """
    start = today - timedelta(days=days - 1)
    counts = dict(
        db.execute(
            select(Review.local_date, func.count())
            .where(Review.user_id == user.id, Review.local_date >= start)
            .group_by(Review.local_date)
        ).all()
    )
    s = streak_state(user)
    # Walk back from the last goal day through the live streak: gaps inside it were covered by freezes.
    frozen: set[date] = set()
    if s.last_goal_date and displayed_streak(s, today) > 0:
        remaining, day = s.current, s.last_goal_date
        while remaining > 0 and day >= start:
            if counts.get(day, 0) >= user.daily_goal or day == s.last_goal_date:
                remaining -= 1
            else:
                frozen.add(day)
            day -= timedelta(days=1)
    out = []
    for i in range(days):
        day = start + timedelta(days=i)
        count = counts.get(day, 0)
        if day == today and user.last_goal_date != today:
            state = "today"
        elif count >= user.daily_goal or day == s.last_goal_date:
            state = "met"
        else:
            state = "frozen" if day in frozen else "missed"
        out.append({"date": day.isoformat(), "state": state, "count": count})
    return out


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
        "history": uptime_history(db, user, today),
        "bits": user.bits,
        "bits_earned": user.bits_earned,
        "equipped": loot.equipped(db, user),
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
        "session": loot.start_session(db, user, None, now) if ids else None,
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
    session_id: str | None = None,
) -> dict:
    correct, canonical = srs.grade(card, answer)  # raises srs.AnswerError on malformed answers
    today = local_today(user.timezone, now)
    session = loot.get_session(db, user, session_id)

    # Rollback cap: the first wrong answer of a session is caught before it counts. Nothing is
    # recorded and the right answer is not revealed, so the second attempt is a real one.
    if session and not correct and not is_retry and loot.charges_left(db, user, session)["second_try"] > 0:
        loot.record_use(db, session, "second_try", card.id, None, now)
        db.commit()
        return {"rolled_back": True, "correct": False, "perks": loot.charges_left(db, user, session)}

    assisted = loot.was_assisted(db, session, card.id)
    uc = db.get(UserCard, (user.id, card.id))
    fresh = uc is None or uc.due <= now  # new or due, as opposed to practising ahead
    schedule_it = not (is_retry and uc is not None)
    if schedule_it:
        new = srs.schedule(uc.fsrs if uc else None, correct, now, assisted)
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
            rating=srs.rating_for(correct, assisted) if schedule_it else 0,
            reviewed_at=now,
            local_date=today,
            duration_ms=duration_ms,
            session_id=session.id if session else None,
            assisted=assisted,
        )
    )
    db.flush()

    count = today_count(db, user, now)
    just_met_goal = False
    if count >= user.daily_goal and user.last_goal_date != today:
        _save_streak(user, apply_goal_met(streak_state(user), today, loot.max_freezes(db, user)))
        just_met_goal = True

    # Bits: paid for right first-try answers, the daily goal and each full week of streak.
    bits = 0
    if correct and not is_retry:
        if not fresh:
            bits += loot.BITS_CARD_AHEAD
        elif assisted:
            bits += loot.BITS_CARD_ASSISTED
        else:
            bits += loot.BITS_CARD
            if "combo_bonus" in loot.active_perks(db, user) and loot.combo(db, session) >= loot.COMBO_AFTER:
                bits += loot.COMBO_BITS
    if just_met_goal:
        bits += loot.BITS_GOAL
        if user.current_streak % 7 == 0:
            bits += loot.BITS_STREAK_WEEK
    bits_earned = loot.award(db, user, bits)
    db.commit()

    s = streak_state(user)
    return {
        "rolled_back": False,
        "correct": correct,
        "assisted": assisted,
        "correct_answer": canonical,
        "explanation": card.explanation,
        "next_due": uc.due if uc else None,
        "today_count": count,
        "goal_met_today": user.last_goal_date == today,
        "just_met_goal": just_met_goal,
        "bits_earned": bits_earned,
        "bits": user.bits,
        "perks": loot.charges_left(db, user, session) if session else None,
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
