from datetime import timedelta

from app.models import Card, User, UserCard

TOKEN = "ExponentPushToken[abc123]"


def make_user(client, tz="Asia/Singapore", goal=5, hour=20):
    r = client.post("/users", json={"name": "Asher", "timezone": tz, "daily_goal": goal, "reminder_hour": hour})
    assert r.status_code == 201, r.text
    return r.json()


def right_answer(session_factory, card_id):
    with session_factory() as db:
        c = db.get(Card, card_id)
        return c.data["items"] if c.kind == "order" else c.data["answer"]


def wrong_answer(session_factory, card_id):
    with session_factory() as db:
        c = db.get(Card, card_id)
        if c.kind == "mcq":
            return (c.data["answer"] + 1) % len(c.data["options"])
        if c.kind == "order":
            return list(reversed(c.data["items"]))
        return c.data["answer"] * 100


def review(client, uid, card_id, answer, **kw):
    r = client.post(f"/users/{uid}/reviews", json={"card_id": card_id, "answer": answer, **kw})
    assert r.status_code == 200, r.text
    return r.json()


def test_validation(client):
    assert client.post("/users", json={"name": "A", "timezone": "Mars/Base"}).status_code == 422
    assert client.get("/users/nope").status_code == 404
    uid = make_user(client)["id"]
    r = client.post(f"/users/{uid}/push-tokens", json={"token": "not-a-token", "platform": "ios"})
    assert r.status_code == 422


def test_first_session_is_new_cards_in_curriculum_order(client):
    uid = make_user(client)["id"]
    s = client.get(f"/users/{uid}/session").json()
    assert s["new_count"] == 5 and s["due_count"] == 0
    assert [c["reason"] for c in s["cards"]] == ["new"] * 5
    assert all(c["skill_id"] == "estimation" for c in s["cards"])  # first skill first
    for c in s["cards"]:
        assert "answer" not in c and "explanation" not in c


def test_meeting_goal_starts_streak_then_later_sessions_review_ahead(client, session_factory):
    uid = make_user(client)["id"]
    cards = client.get(f"/users/{uid}/session").json()["cards"]
    results = [review(client, uid, c["id"], right_answer(session_factory, c["id"])) for c in cards]
    assert all(r["correct"] for r in results)
    assert [r["just_met_goal"] for r in results] == [False] * 4 + [True]
    assert results[-1]["streak"]["current"] == 1

    # New-card cap reached, nothing due yet: the session fills with early reviews.
    s2 = client.get(f"/users/{uid}/session").json()
    assert s2["new_count"] == 0 and {c["reason"] for c in s2["cards"]} == {"ahead"}

    me = client.get(f"/users/{uid}").json()
    assert me["today_count"] == 5 and me["goal_met_today"] and not me["streak"]["at_risk"]


def test_wrong_answer_returns_explanation_and_retry_does_not_reschedule(client, session_factory):
    uid = make_user(client)["id"]
    card_id = client.get(f"/users/{uid}/session").json()["cards"][0]["id"]
    r = review(client, uid, card_id, wrong_answer(session_factory, card_id))
    assert r["correct"] is False and r["explanation"] and r["correct_answer"] is not None

    with session_factory() as db:
        due_after_fail = db.get(UserCard, (uid, card_id)).due
    r2 = review(client, uid, card_id, right_answer(session_factory, card_id), is_retry=True)
    assert r2["correct"] and r2["today_count"] == 2  # retry counts toward the goal...
    with session_factory() as db:
        uc = db.get(UserCard, (uid, card_id))
        assert uc.due == due_after_fail and uc.reps == 1  # ...but not toward the schedule


def test_streak_across_days_in_user_timezone(client, session_factory, clock):
    uid = make_user(client, goal=1)["id"]

    def practice():
        c = client.get(f"/users/{uid}/session").json()["cards"][0]
        return review(client, uid, c["id"], right_answer(session_factory, c["id"]))

    assert practice()["streak"]["current"] == 1  # 23:00 Singapore, Nov 11
    clock.now += timedelta(hours=2)  # 01:00 Singapore, Nov 12: a new local day
    assert client.get(f"/users/{uid}").json()["streak"]["at_risk"] is True
    assert practice()["streak"]["current"] == 2
    clock.now += timedelta(days=3)  # skip two days with only one freeze
    assert client.get(f"/users/{uid}").json()["streak"]["current"] == 0
    r = practice()
    assert r["streak"]["current"] == 1 and r["streak"]["longest"] == 2


def test_reminders_end_to_end(client, session_factory, clock, sender):
    uid = make_user(client, goal=1, hour=20)["id"]
    with session_factory() as db:
        assert db.get(User, uid).next_reminder_at is None  # no token -> server never reminds

    r = client.post(f"/users/{uid}/push-tokens", json={"token": TOKEN, "platform": "android"})
    assert r.status_code == 201
    with session_factory() as db:
        # 23:00 Singapore now, so the next 20:00 is tomorrow = 12:00 UTC Nov 12
        assert db.get(User, uid).next_reminder_at.isoformat() == "2026-11-12T12:00:00+00:00"

    assert client.post("/debug/run-reminders").json()["claimed"] == 0  # not due yet

    clock.now = clock.now.replace(day=12, hour=12, minute=1)
    stats = client.post("/debug/run-reminders").json()
    assert stats["claimed"] == 1 and stats["sent"] == 1
    assert sender.sent[-1].to == TOKEN and "card" in sender.sent[-1].body

    # Running again in the same minute (e.g. a second worker) must not double-send.
    assert client.post("/debug/run-reminders").json()["claimed"] == 0

    # Next day: practice first, then the reminder is skipped.
    clock.now = clock.now.replace(day=13, hour=11)
    c = client.get(f"/users/{uid}/session").json()["cards"][0]
    review(client, uid, c["id"], right_answer(session_factory, c["id"]))
    clock.now = clock.now.replace(hour=12, minute=5)
    stats = client.post("/debug/run-reminders").json()
    assert stats["skipped_goal_met"] == 1 and stats["sent"] == 0


def test_dead_tokens_are_pruned(client, session_factory, sender):
    uid = make_user(client)["id"]
    client.post(f"/users/{uid}/push-tokens", json={"token": TOKEN, "platform": "ios"})
    sender.errors[TOKEN] = "DeviceNotRegistered"
    out = client.post(f"/debug/users/{uid}/test-push").json()
    assert out["failed"] == 1 and out["pruned"] == 1
    assert client.get(f"/users/{uid}").json()["has_push"] is False


def test_skill_progress(client, session_factory):
    uid = make_user(client)["id"]
    c = client.get(f"/users/{uid}/session").json()["cards"][0]
    review(client, uid, c["id"], right_answer(session_factory, c["id"]))
    skills = client.get(f"/users/{uid}/skills").json()
    assert [s["id"] for s in skills][0] == "estimation"
    est = skills[0]
    assert est["seen"] == 1 and est["total"] == 5 and 0 < est["mastery"] < 1
