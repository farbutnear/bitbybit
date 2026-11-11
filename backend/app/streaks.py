"""Streak rules, as pure functions so the edge cases are easy to test.

A day "counts" when the user hits their daily goal (N reviews) on their *local* calendar
date. Streak state is only written when a goal is met; everything else (is the streak
still alive? is it at risk?) is computed when it's read, so there is no midnight job
that has to touch every user in every timezone.

Freezes: if the user skipped some days and has at least that many freezes, meeting the
goal again consumes them and the streak continues. One freeze is earned every 7 days of
streak, up to a cap.
"""

from dataclasses import dataclass, replace
from datetime import date, datetime
from zoneinfo import ZoneInfo

FREEZE_EVERY_N_DAYS = 7


@dataclass(frozen=True)
class StreakState:
    current: int
    longest: int
    freezes: int
    last_goal_date: date | None


def local_today(tz_name: str, now_utc: datetime) -> date:
    return now_utc.astimezone(ZoneInfo(tz_name)).date()


def apply_goal_met(state: StreakState, today: date, max_freezes: int) -> StreakState:
    """Return the new state after the user met their goal on `today` (their local date)."""
    last = state.last_goal_date
    if last is not None and (today - last).days <= 0:
        # Already counted today. A negative gap can happen if the user moved to a timezone
        # behind their old one; we never let that double-count or break the streak.
        return state

    freezes = state.freezes
    if last is None:
        current = 1
    else:
        missed = (today - last).days - 1
        if missed == 0:
            current = state.current + 1
        elif missed <= freezes:
            freezes -= missed
            current = state.current + 1
        else:
            current = 1

    if current % FREEZE_EVERY_N_DAYS == 0:
        freezes = min(freezes + 1, max_freezes)

    return replace(
        state,
        current=current,
        longest=max(state.longest, current),
        freezes=freezes,
        last_goal_date=today,
    )


def displayed_streak(state: StreakState, today: date) -> int:
    """The streak to show right now. Zero if it is already unrecoverable."""
    last = state.last_goal_date
    if last is None:
        return 0
    missed = (today - last).days - 1
    if missed <= 0:  # met today or yesterday (or a timezone change put "last" in the future)
        return state.current
    if missed <= state.freezes:  # freezes will cover the gap once they practice again
        return state.current
    return 0


def is_at_risk(state: StreakState, today: date) -> bool:
    """True if there is a live streak and today's goal is not met yet."""
    return displayed_streak(state, today) > 0 and state.last_goal_date != today
