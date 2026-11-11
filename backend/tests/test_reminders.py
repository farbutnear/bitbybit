from datetime import datetime, timezone

from app.reminders import next_reminder_at, reminder_message

UTC = timezone.utc


def test_later_today():
    now = datetime(2026, 11, 11, 15, 0, tzinfo=UTC)  # 10:00 New York (EST, UTC-5)
    assert next_reminder_at("America/New_York", 20, 0, now) == datetime(2026, 11, 12, 1, 0, tzinfo=UTC)


def test_already_passed_goes_to_tomorrow():
    now = datetime(2026, 11, 11, 13, 0, tzinfo=UTC)  # 21:00 Singapore
    assert next_reminder_at("Asia/Singapore", 20, 0, now) == datetime(2026, 11, 12, 12, 0, tzinfo=UTC)


def test_exactly_now_is_not_next():
    now = datetime(2026, 11, 12, 12, 0, tzinfo=UTC)  # exactly 20:00 Singapore
    assert next_reminder_at("Asia/Singapore", 20, 0, now) == datetime(2026, 11, 13, 12, 0, tzinfo=UTC)


def test_dst_fall_back_shifts_utc_time():
    # New York leaves DST on 2026-11-01. 20:00 EDT = 00:00 UTC, 20:00 EST = 01:00 UTC.
    before = next_reminder_at("America/New_York", 20, 0, datetime(2026, 10, 31, 12, 0, tzinfo=UTC))
    after = next_reminder_at("America/New_York", 20, 0, datetime(2026, 11, 1, 12, 0, tzinfo=UTC))
    assert before == datetime(2026, 11, 1, 0, 0, tzinfo=UTC)
    assert after == datetime(2026, 11, 2, 1, 0, tzinfo=UTC)


def test_dst_spring_forward_gap_still_fires():
    # 02:30 does not exist in New York on 2026-03-08; must still return a time that day.
    t = next_reminder_at("America/New_York", 2, 30, datetime(2026, 3, 8, 5, 0, tzinfo=UTC))
    assert t.date() == datetime(2026, 3, 8).date() and t > datetime(2026, 3, 8, 5, 0, tzinfo=UTC)


def test_messages():
    title, body = reminder_message(streak=12, due_count=7, goal=5, done_today=4)
    assert "12-day" in title and body.startswith("1 more card ")
    title, body = reminder_message(streak=0, due_count=1, goal=5, done_today=0)
    assert "1 card ready" in body
