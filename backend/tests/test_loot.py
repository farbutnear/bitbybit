import random
from collections import Counter
from datetime import datetime, timedelta, timezone

import pytest
from fsrs import Rating

from app import loot, main, srs
from app.models import Card, Review, User, UserCard, UserGear

from test_api import make_user, play_lesson, review, right_answer, wrong_answer

MCQ = "estimation-nfr"  # first card of the first Foundations lesson
LESSON = "foundations-u1-l1"
SPOT = "compute-slow-node"  # a find-the-fault card from the Scaling track


def give(session_factory, uid, *gear_ids, equip=True, bits=None):
    """Put gear straight into a user's inventory (and optionally set their balance)."""
    with session_factory() as db:
        for g in gear_ids:
            db.add(UserGear(user_id=uid, gear_id=g, copies=1, equipped=equip, obtained_at=datetime.now(timezone.utc)))
        if bits is not None:
            db.get(User, uid).bits = bits
        db.commit()


def start(client, uid, lesson_id=LESSON):
    r = client.get(f"/users/{uid}/lessons/{lesson_id}")
    assert r.status_code == 200, r.text
    return r.json()["session"]


def bits(client, uid):
    return client.get(f"/users/{uid}").json()["bits"]


def use(client, uid, session_id, perk, card_id):
    return client.post(f"/users/{uid}/perks/use", json={"session_id": session_id, "perk": perk, "card_id": card_id})


# ---------- catalogue and economy ----------

def test_catalogue_is_consistent():
    assert abs(sum(loot.ODDS.values()) - 1) < 1e-9
    assert {d["slot"] for d in loot.GEAR.values()} == set(loot.SLOTS)
    assert {d["rarity"] for d in loot.GEAR.values()} == set(loot.RARITIES)  # every rarity can be rolled
    perks = [d["perk"] for d in loot.GEAR.values()]
    assert len(perks) == len(set(perks))  # no two pieces do the same thing


def test_new_user_starts_with_one_pack_worth_of_bits(client):
    user = make_user(client)
    assert user["bits"] == loot.PACK_COST and user["equipped"] == {"head": None, "face": None, "neck": None}
    summary = client.get(f"/users/{user['id']}/loot").json()
    assert len(summary["gear"]) == len(loot.GEAR) and not any(g["owned"] for g in summary["gear"])
    assert summary["pack"]["odds"] == loot.ODDS  # the odds are published, not hidden
    assert summary["pack"]["packs_until_guaranteed_legendary"] == loot.PITY_PACKS


def test_bits_are_paid_for_learning_not_for_replaying(client, session_factory, clock):
    uid = make_user(client, goal=3)["id"]
    before = bits(client, uid)
    wrong = review(client, uid, MCQ, wrong_answer(session_factory, MCQ))
    assert wrong["bits_earned"] == 0
    retry = review(client, uid, MCQ, right_answer(session_factory, MCQ), is_retry=True)
    assert retry["bits_earned"] == 0  # the in-lesson retry never pays

    second = review(client, uid, "estimation-latency-dc", right_answer(session_factory, "estimation-latency-dc"))
    assert second["bits_earned"] == loot.BITS_CARD + loot.BITS_GOAL and second["just_met_goal"]  # third review of the day
    done = client.post(f"/users/{uid}/lessons/{LESSON}/complete").json()
    assert done["bits_earned"] == loot.BITS_LESSON
    assert bits(client, uid) == before + loot.BITS_CARD + loot.BITS_GOAL + loot.BITS_LESSON

    again = client.post(f"/users/{uid}/lessons/{LESSON}/complete").json()
    assert again["bits_earned"] == 0  # finishing the same lesson twice pays once
    ahead = review(client, uid, "estimation-latency-dc", right_answer(session_factory, "estimation-latency-dc"))
    assert ahead["bits_earned"] == loot.BITS_CARD_AHEAD  # not due yet: a token bit, so grinding one card is pointless

    clock.now += timedelta(days=30)
    due = review(client, uid, "estimation-latency-dc", right_answer(session_factory, "estimation-latency-dc"))
    assert due["bits_earned"] == loot.BITS_CARD  # a due review pays in full (goal of 3 not met yet today)


def test_a_full_week_of_streak_pays_a_bonus(client, session_factory, clock):
    uid = make_user(client, goal=1)["id"]
    cards = ["estimation-nfr", "estimation-latency-dc"]
    earned = []
    for day in range(7):
        res = review(client, uid, cards[day % 2], right_answer(session_factory, cards[day % 2]))
        earned.append(res["bits_earned"])
        clock.now += timedelta(days=1)
    assert res["streak"]["current"] == 7
    assert earned[6] - earned[5] == loot.BITS_STREAK_WEEK  # day 6 and day 7 differ only by the weekly bonus


# ---------- packs ----------

def test_roll_pack_follows_the_odds_and_avoids_repeats():
    rng = random.Random(1)
    packs = [loot.roll_pack(rng, 0) for _ in range(4000)]
    assert all(len(p) == loot.PACK_SIZE and set(p) <= set(loot.GEAR) for p in packs)
    counts = Counter(loot.GEAR[g]["rarity"] for p in packs for g in p)
    total = sum(counts.values())
    for rarity, odds in loot.ODDS.items():
        assert abs(counts[rarity] / total - odds) < 0.02
    rares = [g for g, d in loot.GEAR.items() if d["rarity"] == "rare"]
    for p in packs:  # there are enough rares to never repeat one inside a pack
        drawn = [g for g in p if g in rares]
        assert len(drawn) == len(set(drawn))


def test_pity_guarantees_a_legendary_every_tenth_pack():
    for seed in range(200):
        rng = random.Random(seed)
        assert any(loot.GEAR[g]["rarity"] == "legendary" for g in loot.roll_pack(rng, loot.PITY_PACKS - 1))


def test_opening_packs_costs_bits_and_refunds_duplicates(client, session_factory):
    uid = make_user(client)["id"]
    main.app.dependency_overrides[main.get_rng] = lambda: random.Random(3)

    first = client.post(f"/users/{uid}/packs/open").json()
    assert len(first["cards"]) == loot.PACK_SIZE and all(c["new"] or c["refund"] for c in first["cards"])
    refunds = sum(c["refund"] for c in first["cards"])
    assert first["bits"] == refunds  # 100 starting bits spent, duplicates paid back
    assert first["loot"]["pack"]["opened"] == 1

    broke = client.post(f"/users/{uid}/packs/open")
    assert broke.status_code == 409 and "not enough bits" in broke.text

    # The same seed draws the same three cards again: now every one is a duplicate.
    give(session_factory, uid, bits=loot.PACK_COST)
    second = client.post(f"/users/{uid}/packs/open").json()
    assert [c["id"] for c in second["cards"]] == [c["id"] for c in first["cards"]]
    assert not any(c["new"] for c in second["cards"])
    assert second["bits"] == sum(loot.DUPLICATE_REFUND[c["rarity"]] for c in second["cards"])
    with session_factory() as db:
        assert db.get(User, uid).bits_earned == 0  # refunds are not earnings
        assert db.get(UserGear, (uid, first["cards"][0]["id"])).copies >= 2


def test_pity_counter_tracks_packs_without_a_legendary(client, session_factory):
    uid = make_user(client)["id"]
    with session_factory() as db:
        user = db.get(User, uid)
        user.bits = loot.PACK_COST * 2
        user.packs_since_legendary = loot.PITY_PACKS - 1
        db.commit()
    opened = client.post(f"/users/{uid}/packs/open").json()
    assert any(c["rarity"] == "legendary" for c in opened["cards"])
    assert opened["loot"]["pack"]["packs_until_guaranteed_legendary"] == loot.PITY_PACKS


# ---------- gear ----------

def test_equipping_needs_ownership_and_one_piece_per_slot(client, session_factory):
    uid = make_user(client)["id"]
    assert client.post(f"/users/{uid}/gear/debug-visor/equip").status_code == 409  # not owned
    assert client.post(f"/users/{uid}/gear/nope/equip").status_code == 409
    give(session_factory, uid, "debug-visor", "tracer-lens", "block-chain", equip=False)

    client.post(f"/users/{uid}/gear/debug-visor/equip")
    client.post(f"/users/{uid}/gear/block-chain/equip")
    assert client.get(f"/users/{uid}").json()["equipped"] == {"head": None, "face": "debug-visor", "neck": "block-chain"}
    client.post(f"/users/{uid}/gear/tracer-lens/equip")  # same slot: replaces the visor
    assert client.get(f"/users/{uid}").json()["equipped"]["face"] == "tracer-lens"
    summary = client.post(f"/users/{uid}/gear/tracer-lens/unequip").json()
    assert not next(g for g in summary["gear"] if g["id"] == "tracer-lens")["equipped"]


def test_block_chain_adds_a_quarter_more_bits(client, session_factory):
    uid = make_user(client, goal=50)["id"]
    give(session_factory, uid, "block-chain")
    res = review(client, uid, MCQ, right_answer(session_factory, MCQ))
    assert res["bits_earned"] == 7  # 5 * 1.25, rounded up


def test_replica_tags_hold_one_more_freeze_and_freezes_can_be_bought(client, session_factory):
    uid = make_user(client)["id"]
    give(session_factory, uid, bits=loot.FREEZE_COST * 3)
    assert client.post(f"/users/{uid}/shop/freeze").json()["freeze"] == {"cost": loot.FREEZE_COST, "held": 2, "max": 2}
    full = client.post(f"/users/{uid}/shop/freeze")
    assert full.status_code == 409 and bits(client, uid) == loot.FREEZE_COST * 2  # nothing charged at the cap

    give(session_factory, uid, "replica-tags")
    assert client.post(f"/users/{uid}/shop/freeze").json()["freeze"]["held"] == 3
    assert client.post(f"/users/{uid}/shop/freeze").status_code == 409
    give(session_factory, uid, bits=0)
    client.post(f"/users/{uid}/gear/replica-tags/unequip")
    assert client.post(f"/users/{uid}/shop/freeze").status_code == 409


def test_oncall_headset_pays_a_combo_from_the_third_right_answer_in_a_row(client, session_factory):
    uid = make_user(client, goal=50)["id"]
    give(session_factory, uid, "oncall-headset")
    session = client.get(f"/users/{uid}/lessons/{LESSON}").json()["session"]["id"]
    order = ["estimation-nfr", "estimation-latency-dc", "compute-stateless", "compute-l7"]
    earned = [review(client, uid, c, right_answer(session_factory, c), session_id=session)["bits_earned"] for c in order]
    assert earned == [5, 5, 5 + loot.COMBO_BITS, 5 + loot.COMBO_BITS]
    miss = review(client, uid, "caching-cdn", wrong_answer(session_factory, "caching-cdn"), session_id=session)
    assert miss["bits_earned"] == 0
    after = review(client, uid, "caching-stampede", right_answer(session_factory, "caching-stampede"), session_id=session)
    assert after["bits_earned"] == 5  # the miss reset the run


# ---------- session perks ----------

def test_sessions_report_charges_for_equipped_gear_only(client, session_factory):
    uid = make_user(client)["id"]
    assert start(client, uid)["perks"] == {"second_try": 0, "strike_option": 0, "clear_node": 0}
    give(session_factory, uid, "rollback-cap", "debug-visor")
    assert start(client, uid)["perks"] == {"second_try": 1, "strike_option": 1, "clear_node": 0}


def test_rollback_cap_catches_one_wrong_answer_without_revealing_it(client, session_factory):
    uid = make_user(client, goal=50)["id"]
    give(session_factory, uid, "rollback-cap")
    session = start(client, uid)["id"]

    caught = review(client, uid, MCQ, wrong_answer(session_factory, MCQ), session_id=session)
    assert caught == {"rolled_back": True, "correct": False, "perks": {"second_try": 0, "strike_option": 0, "clear_node": 0}}
    with session_factory() as db:  # nothing was recorded: no review, no schedule, no progress toward the goal
        assert db.query(Review).count() == 0 and db.get(UserCard, (uid, MCQ)) is None

    second = review(client, uid, MCQ, right_answer(session_factory, MCQ), session_id=session)
    assert second["correct"] and second["assisted"] and second["bits_earned"] == loot.BITS_CARD_ASSISTED
    with session_factory() as db:
        assert db.query(Review).one().rating == int(Rating.Hard)  # counted, but scheduled as shaky

    other = "estimation-latency-dc"
    miss = review(client, uid, other, wrong_answer(session_factory, other), session_id=session)
    assert miss["rolled_back"] is False and miss["correct"] is False and "correct_answer" in miss  # only one charge
    assert start(client, uid)["perks"]["second_try"] == 1  # a new run gets a fresh one


def test_rollback_needs_a_session_and_never_applies_to_retries(client, session_factory):
    uid = make_user(client, goal=50)["id"]
    give(session_factory, uid, "rollback-cap")
    assert review(client, uid, MCQ, wrong_answer(session_factory, MCQ))["rolled_back"] is False  # no session id
    session = start(client, uid)["id"]
    retry = review(client, uid, MCQ, wrong_answer(session_factory, MCQ), session_id=session, is_retry=True)
    assert retry["rolled_back"] is False and retry["perks"]["second_try"] == 1


def test_debug_visor_strikes_a_wrong_option_never_the_answer(client, session_factory):
    uid = make_user(client, goal=50)["id"]
    give(session_factory, uid, "debug-visor")
    with session_factory() as db:
        answer = db.get(Card, MCQ).data["answer"]
    for seed in range(25):  # whatever the dice say, the answer survives
        main.app.dependency_overrides[main.get_rng] = lambda seed=seed: random.Random(seed)
        session = start(client, uid)["id"]
        r = use(client, uid, session, "strike_option", MCQ)
        assert r.status_code == 200, r.text
        assert r.json()["removed_option"] != answer and "answer" not in r.text
        assert r.json()["perks"]["strike_option"] == 0

    assert use(client, uid, session, "strike_option", MCQ).status_code == 409  # out of charges
    res = review(client, uid, MCQ, answer, session_id=session)
    assert res["correct"] and res["assisted"] and res["bits_earned"] == loot.BITS_CARD_ASSISTED

    fresh = start(client, uid)["id"]
    assert use(client, uid, fresh, "strike_option", SPOT).status_code == 409  # wrong kind of card
    assert use(client, uid, fresh, "clear_node", "compute-l7").status_code == 409  # perk not equipped
    assert use(client, uid, "no-such-session", "strike_option", MCQ).status_code == 404


def test_root_crown_gives_face_gear_a_second_charge(client, session_factory):
    uid = make_user(client)["id"]
    give(session_factory, uid, "debug-visor", "root-crown")
    session = start(client, uid)
    assert session["perks"]["strike_option"] == 2
    first = use(client, uid, session["id"], "strike_option", MCQ).json()["removed_option"]
    second = use(client, uid, session["id"], "strike_option", MCQ).json()["removed_option"]
    assert first != second  # two different options go, leaving a real two-way choice
    with session_factory() as db:
        assert db.get(Card, MCQ).data["answer"] not in (first, second)


def test_strike_always_leaves_at_least_two_options(session_factory, clock):
    with session_factory() as db:
        user = User(name="A", timezone="UTC", daily_goal=5, reminder_hour=20)
        db.add(user)
        db.flush()
        db.add(UserGear(user_id=user.id, gear_id="debug-visor", copies=1, equipped=True, obtained_at=clock.now))
        db.add(UserGear(user_id=user.id, gear_id="root-crown", copies=1, equipped=True, obtained_at=clock.now))
        card = db.get(Card, MCQ)
        card.data = card.data | {"options": card.data["options"][:3], "answer": 0}
        db.commit()
        session = loot.get_session(db, user, loot.start_session(db, user, None, clock.now)["id"])
        loot.use_perk(db, user, session, "strike_option", card, clock.now)
        with pytest.raises(loot.LootError, match="nothing left"):
            loot.use_perk(db, user, session, "strike_option", card, clock.now)


def test_tracer_lens_rules_out_a_healthy_component(client, session_factory):
    uid = make_user(client, goal=50)["id"]
    give(session_factory, uid, "tracer-lens")
    with session_factory() as db:
        data = db.get(Card, SPOT).data
    kinds = {n["id"]: n.get("kind") for n in data["diagram"]["nodes"]}
    for seed in range(25):
        main.app.dependency_overrides[main.get_rng] = lambda seed=seed: random.Random(seed)
        session = start(client, uid)["id"]
        cleared = use(client, uid, session, "clear_node", SPOT).json()["cleared_node"]
        assert cleared != data["answer"] and kinds[cleared] != "client"
    res = review(client, uid, SPOT, data["answer"], session_id=session)
    assert res["correct"] and res["assisted"]


def test_assisted_answers_come_back_sooner(clock):
    plain = srs.schedule(None, True, clock.now)
    helped = srs.schedule(None, True, clock.now, assisted=True)
    assert helped.due < plain.due and helped.stability < plain.stability
    assert srs.rating_for(True, True) == int(Rating.Hard) and srs.rating_for(False, True) == int(Rating.Again)


def test_lessons_still_play_end_to_end_with_sessions(client, session_factory):
    uid = make_user(client)["id"]
    results, done = play_lesson(client, session_factory, uid, LESSON)
    assert all(r["rolled_back"] is False for r in results) and done["first_time"]
    assert client.get(f"/users/{uid}/review?practice=true").json()["session"]["perks"]["second_try"] == 0
    assert client.get(f"/users/{uid}/review").json()["session"] is None  # nothing due: no run to start


def test_uptime_history_marks_met_frozen_missed_and_today(client, session_factory, clock):
    uid = make_user(client, goal=1)["id"]  # starts with one streak freeze

    def practise():
        review(client, uid, MCQ, right_answer(session_factory, MCQ))

    clock.now += timedelta(days=3)  # nothing on the first three days
    practise()  # met
    clock.now += timedelta(days=1)
    practise()  # met
    clock.now += timedelta(days=2)  # one day skipped: the freeze covers it
    practise()  # met
    clock.now += timedelta(days=1)  # today, nothing yet

    user = client.get(f"/users/{uid}").json()
    history = user["history"]
    assert len(history) == 14 and history[-1]["count"] == 0
    assert [h["state"] for h in history[-5:]] == ["met", "met", "frozen", "met", "today"]
    assert all(h["state"] == "missed" for h in history[:-5])
    assert user["streak"]["current"] == 3

    practise()
    last = client.get(f"/users/{uid}").json()["history"][-1]
    assert last["state"] == "met" and last["count"] == 1
