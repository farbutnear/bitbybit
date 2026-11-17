from datetime import timedelta

from app.models import Card, User, UserCard

TOKEN = "ExponentPushToken[abc123]"


def make_user(client, tz="Asia/Singapore", goal=5, hour=20, **extra):
    body = {"name": "Asher", "timezone": tz, "daily_goal": goal, "reminder_hour": hour, **extra}
    r = client.post("/users", json=body)
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


def path(client, uid, track="foundations"):
    r = client.get(f"/users/{uid}/tracks/{track}/path")
    assert r.status_code == 200, r.text
    return r.json()


def lesson_ids(p, status=None):
    return [les["id"] for u in p["units"] for les in u["lessons"] if status is None or les["status"] == status]


def play_lesson(client, session_factory, uid, lesson_id):
    """Answer every card correctly, then finish the lesson. Returns (review results, completion)."""
    les = client.get(f"/users/{uid}/lessons/{lesson_id}").json()
    results = [
        review(client, uid, s["card"]["id"], right_answer(session_factory, s["card"]["id"]))
        for s in les["steps"]
        if s["type"] == "card"
    ]
    done = client.post(f"/users/{uid}/lessons/{lesson_id}/complete")
    assert done.status_code == 200, done.text
    return results, done.json()


def test_validation(client):
    assert client.post("/users", json={"name": "A", "timezone": "Mars/Base"}).status_code == 422
    assert client.get("/users/nope").status_code == 404
    uid = make_user(client)["id"]
    r = client.post(f"/users/{uid}/push-tokens", json={"token": "not-a-token", "platform": "ios"})
    assert r.status_code == 422


# ---------- tracks ----------

def test_catalogue_marks_empty_tracks_unavailable(client):
    tracks = {t["id"]: t for t in client.get("/tracks").json()}
    assert tracks["foundations"]["available"] and tracks["foundations"]["lessons_total"] == 2
    assert tracks["apis"]["available"] is False
    assert list(tracks)[0] == "foundations"  # course order


def test_new_user_defaults_to_first_track_and_can_choose_others(client):
    me = make_user(client)
    assert me["track_ids"] == ["foundations"] and me["active_track_id"] == "foundations"

    picked = make_user(client, track_ids=["caching", "storage"])
    assert picked["track_ids"] == ["storage", "caching"]  # returned in course order
    assert picked["active_track_id"] == "storage"

    uid = me["id"]
    r = client.put(f"/users/{uid}/tracks", json={"track_ids": ["foundations", "caching"], "active_track_id": "caching"})
    assert r.status_code == 200 and r.json()["active_track_id"] == "caching"
    mine = {t["id"]: t for t in client.get(f"/users/{uid}/tracks").json()}
    assert mine["caching"]["chosen"] and mine["caching"]["active"] and not mine["storage"]["chosen"]

    # Dropping the active track falls back to one that is still chosen.
    r = client.put(f"/users/{uid}/tracks", json={"track_ids": ["foundations"]})
    assert r.json()["active_track_id"] == "foundations"


def test_track_choice_is_validated(client):
    uid = make_user(client)["id"]
    put = lambda body: client.put(f"/users/{uid}/tracks", json=body).status_code  # noqa: E731
    assert put({"track_ids": []}) == 422
    assert put({"track_ids": ["nope"]}) == 422
    assert put({"track_ids": ["apis"]}) == 422  # no lessons yet
    assert put({"track_ids": ["foundations"], "active_track_id": "caching"}) == 422
    assert client.post("/users", json={"name": "A", "timezone": "UTC", "track_ids": ["apis"]}).status_code == 422


# ---------- path and lessons ----------

def test_path_unlocks_lessons_in_order(client, session_factory):
    uid = make_user(client)["id"]
    p = path(client, uid)
    assert p["track"]["title"] == "Foundations" and p["units"][0]["number"] == 1
    first, second = lesson_ids(p)
    assert lesson_ids(p, "next") == [first] and lesson_ids(p, "locked") == [second]

    assert client.get(f"/users/{uid}/lessons/{second}").status_code == 403
    assert client.post(f"/users/{uid}/lessons/{second}/complete").status_code == 409

    _, done = play_lesson(client, session_factory, uid, first)
    assert done["first_time"] and done["next_lesson"]["id"] == second and not done["track_complete"]
    p = path(client, uid)
    assert lesson_ids(p, "done") == [first] and lesson_ids(p, "next") == [second]
    assert p["lessons_done"] == 1 and p["lessons_total"] == 2

    _, done = play_lesson(client, session_factory, uid, second)
    assert done["track_complete"] and done["next_lesson"] is None

    # Other tracks are open from the start, whatever order the user takes them in.
    assert lesson_ids(path(client, uid, "consistency"), "next") == ["consistency-u1-l1"]
    assert client.get(f"/users/{uid}/tracks/nope/path").status_code == 404


def test_lesson_teaches_first_and_never_leaks_answers(client):
    uid = make_user(client)["id"]
    les = client.get(f"/users/{uid}/lessons/foundations-u1-l1").json()
    assert les["title"] and les["unit_title"] == "Thinking in numbers"
    assert [s["type"] for s in les["steps"]] == ["teach", "card", "teach", "card"]
    assert les["steps"][0]["title"] and les["steps"][0]["body"] and les["steps"][0]["llama"]
    for s in les["steps"]:
        if s["type"] == "card":
            assert "answer" not in s["card"] and "explanation" not in s["card"]
            assert s["card"]["reason"] == "new" and s["card"]["track_id"] == "foundations"


def test_lesson_cannot_be_finished_with_unanswered_cards(client, session_factory):
    uid = make_user(client)["id"]
    les = client.get(f"/users/{uid}/lessons/foundations-u1-l1").json()
    first_card = next(s["card"]["id"] for s in les["steps"] if s["type"] == "card")
    review(client, uid, first_card, right_answer(session_factory, first_card))
    assert client.post(f"/users/{uid}/lessons/foundations-u1-l1/complete").status_code == 409


def test_finished_lessons_can_be_replayed(client, session_factory):
    uid = make_user(client)["id"]
    play_lesson(client, session_factory, uid, "foundations-u1-l1")
    les = client.get(f"/users/{uid}/lessons/foundations-u1-l1").json()
    assert les["status"] == "done"
    assert {s["card"]["reason"] for s in les["steps"] if s["type"] == "card"} == {"ahead"}
    _, again = play_lesson(client, session_factory, uid, "foundations-u1-l1")
    assert again["first_time"] is False


# ---------- review ----------

def test_review_only_contains_cards_met_in_lessons(client, session_factory, clock):
    uid = make_user(client)["id"]
    r = client.get(f"/users/{uid}/review").json()
    assert r["cards"] == [] and r["learned_count"] == 0 and r["next_due"] is None
    assert client.get(f"/users/{uid}/review?practice=true").json()["cards"] == []

    play_lesson(client, session_factory, uid, "foundations-u1-l1")
    r = client.get(f"/users/{uid}/review").json()
    assert r["cards"] == [] and r["learned_count"] == 2 and r["next_due"] is not None

    # Nothing due yet, but practice mode offers what was learned.
    ahead = client.get(f"/users/{uid}/review?practice=true").json()["cards"]
    assert len(ahead) == 2 and {c["reason"] for c in ahead} == {"ahead"}

    clock.now += timedelta(days=5)
    due = client.get(f"/users/{uid}/review").json()
    assert len(due["cards"]) == 2 and {c["reason"] for c in due["cards"]} == {"due"} and due["due_count"] == 2
    assert client.get(f"/users/{uid}").json()["due_count"] == 2


def test_wrong_answer_returns_explanation_and_retry_does_not_reschedule(client, session_factory):
    uid = make_user(client)["id"]
    les = client.get(f"/users/{uid}/lessons/foundations-u1-l1").json()
    card_id = next(s["card"]["id"] for s in les["steps"] if s["type"] == "card")
    r = review(client, uid, card_id, wrong_answer(session_factory, card_id))
    assert r["correct"] is False and r["explanation"] and r["correct_answer"] is not None

    with session_factory() as db:
        due_after_fail = db.get(UserCard, (uid, card_id)).due
    r2 = review(client, uid, card_id, right_answer(session_factory, card_id), is_retry=True)
    assert r2["correct"] and r2["today_count"] == 2  # retry counts toward the goal...
    with session_factory() as db:
        uc = db.get(UserCard, (uid, card_id))
        assert uc.due == due_after_fail and uc.reps == 1  # ...but not toward the schedule


# ---------- streaks and reminders ----------

def test_lessons_count_toward_goal_and_streak(client, session_factory):
    uid = make_user(client, goal=5)["id"]
    r1, _ = play_lesson(client, session_factory, uid, "foundations-u1-l1")  # 2 cards
    r2, _ = play_lesson(client, session_factory, uid, "foundations-u1-l2")  # 3 cards
    results = r1 + r2
    assert all(r["correct"] for r in results)
    assert [r["just_met_goal"] for r in results] == [False] * 4 + [True]
    assert results[-1]["streak"]["current"] == 1
    me = client.get(f"/users/{uid}").json()
    assert me["today_count"] == 5 and me["goal_met_today"] and not me["streak"]["at_risk"]
    assert me["learned_count"] == 5


def test_streak_across_days_in_user_timezone(client, session_factory, clock):
    uid = make_user(client, goal=1)["id"]
    play_lesson(client, session_factory, uid, "foundations-u1-l1")
    assert client.get(f"/users/{uid}").json()["streak"]["current"] == 1  # 23:00 Singapore, Nov 11

    def practice():
        c = client.get(f"/users/{uid}/review?practice=true").json()["cards"][0]
        return review(client, uid, c["id"], right_answer(session_factory, c["id"]))

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
    assert sender.sent[-1].to == TOKEN and "next lesson" in sender.sent[-1].body

    # Running again in the same minute (e.g. a second worker) must not double-send.
    assert client.post("/debug/run-reminders").json()["claimed"] == 0

    # Next day: practice first, then the reminder is skipped.
    clock.now = clock.now.replace(day=13, hour=11)
    play_lesson(client, session_factory, uid, "foundations-u1-l1")
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
