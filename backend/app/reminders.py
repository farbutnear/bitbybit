from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo


def next_reminder_at(tz_name: str, hour: int, minute: int, now_utc: datetime) -> datetime:
    """Next occurrence of hour:minute in the user's local time, strictly after now, in UTC.

    zoneinfo handles DST: 20:00 in New York is 01:00 UTC in winter and 00:00 UTC in summer.
    If the local time does not exist (inside a spring-forward gap), the pre-transition
    offset is used, which lands just after the gap.
    """
    tz = ZoneInfo(tz_name)
    local_now = now_utc.astimezone(tz)
    for day_offset in (0, 1, 2):
        d = local_now.date() + timedelta(days=day_offset)
        candidate = datetime.combine(d, time(hour, minute), tzinfo=tz).astimezone(timezone.utc)
        # Compare in UTC. Comparing two datetimes that share a tzinfo compares wall
        # clock times, which is wrong across DST transitions.
        if candidate > now_utc.astimezone(timezone.utc):
            return candidate
    raise AssertionError("unreachable: a reminder time always exists within 2 days")


def reminder_message(streak: int, due_count: int, goal: int, done_today: int) -> tuple[str, str]:
    remaining = max(goal - done_today, 0)
    if streak > 0:
        title = f"🔥 Your {streak}-day streak is on the line"
        body = f"{remaining} more card{'s' if remaining != 1 else ''} keeps it alive."
    else:
        title = "Time for a quick drill"
        body = f"{due_count} card{'s' if due_count != 1 else ''} ready. Five minutes keeps the skills sharp."
    return title, body
