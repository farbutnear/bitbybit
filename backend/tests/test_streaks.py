from datetime import date, datetime, timezone

from app.streaks import StreakState, apply_goal_met, displayed_streak, is_at_risk, local_today

D = date(2026, 11, 11)


def st(current=0, longest=0, freezes=0, last=None):
    return StreakState(current=current, longest=longest, freezes=freezes, last_goal_date=last)


def days(n):
    from datetime import timedelta

    return timedelta(days=n)


def test_first_goal_starts_streak():
    s = apply_goal_met(st(), D, max_freezes=2)
    assert (s.current, s.longest, s.last_goal_date) == (1, 1, D)


def test_consecutive_day_extends():
    s = apply_goal_met(st(current=3, longest=3, last=D - days(1)), D, 2)
    assert s.current == 4 and s.longest == 4


def test_same_day_is_idempotent():
    s0 = st(current=3, longest=5, last=D)
    assert apply_goal_met(s0, D, 2) == s0


def test_gap_without_freeze_resets_but_keeps_longest():
    s = apply_goal_met(st(current=10, longest=10, last=D - days(2)), D, 2)
    assert s.current == 1 and s.longest == 10


def test_one_missed_day_consumes_one_freeze():
    s = apply_goal_met(st(current=4, longest=4, freezes=1, last=D - days(2)), D, 2)
    assert s.current == 5 and s.freezes == 0


def test_two_missed_days_need_two_freezes():
    s = apply_goal_met(st(current=4, freezes=1, last=D - days(3)), D, 2)
    assert s.current == 1 and s.freezes == 1  # not enough: reset, freeze not spent


def test_freeze_earned_every_seven_days_with_cap():
    s = apply_goal_met(st(current=6, longest=6, freezes=0, last=D - days(1)), D, 2)
    assert s.current == 7 and s.freezes == 1
    capped = apply_goal_met(st(current=13, freezes=2, last=D - days(1)), D, 2)
    assert capped.current == 14 and capped.freezes == 2


def test_timezone_moving_backwards_never_breaks_streak():
    # last goal recorded as "tomorrow" relative to the new timezone's today
    s0 = st(current=5, longest=5, last=D + days(1))
    assert apply_goal_met(s0, D, 2) == s0
    assert displayed_streak(s0, D) == 5


def test_displayed_streak_alive_yesterday_dead_after_gap():
    s = st(current=8, last=D - days(1))
    assert displayed_streak(s, D) == 8 and is_at_risk(s, D)
    assert displayed_streak(st(current=8, last=D - days(2)), D) == 0
    assert displayed_streak(st(current=8, freezes=1, last=D - days(2)), D) == 8


def test_not_at_risk_once_goal_met_today():
    assert not is_at_risk(st(current=8, last=D), D)


def test_local_today_uses_user_timezone():
    now = datetime(2026, 11, 11, 17, 0, tzinfo=timezone.utc)
    assert local_today("Asia/Singapore", now) == date(2026, 11, 12)  # 01:00 next day
    assert local_today("America/New_York", now) == date(2026, 11, 11)  # 12:00
    assert local_today("Pacific/Honolulu", datetime(2026, 11, 11, 9, 0, tzinfo=timezone.utc)) == date(2026, 11, 10)
