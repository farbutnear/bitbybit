from datetime import date, timedelta

import pytest

from app import sim
from test_api import make_user

LEVELS = list(sim.LEVELS.values())


def check(result, check_id):
    return next(c for c in result["checks"] if c["id"] == check_id)


# ---------- content: every level is broken at the start and can be fixed inside its budget ----------

@pytest.mark.parametrize("level", LEVELS, ids=lambda lv: lv["id"])
def test_level_starts_broken_and_is_solvable_within_budget(level):
    start = sim.simulate(level, {})
    assert not start["passed"]
    assert check(start, "cost")["ok"]  # the starting system is cheap, just not good enough
    best = sim.cheapest(level)
    assert best is not None and best <= level["goals"]["budget"]
    assert level["goals"]["budget"] < best * 1.25  # the budget is tight enough to rule out brute force


@pytest.mark.parametrize("level", LEVELS, ids=lambda lv: lv["id"])
def test_diagram_is_well_formed_for_every_setting(level):
    for cfg in sim._space(level):
        d = sim.simulate(level, cfg)["diagram"]
        ids = [n["id"] for n in d["nodes"]]
        assert len(ids) == len(set(ids)) and all(0 <= n["x"] <= 3 for n in d["nodes"])
        pos = {n["id"]: n["x"] for n in d["nodes"]}
        assert all(a in pos and b in pos and pos[a] < pos[b] for a, b in d["edges"])  # edges run left to right


# ---------- the model ----------

def test_latency_needs_headroom_not_just_capacity():
    level = sim.LEVELS["launch-day"]
    p99 = [check(sim.simulate(level, {"app_servers": n}), "p99")["value"] for n in range(1, 15)]
    assert p99 == sorted(p99, reverse=True)  # more servers never makes it slower
    seven = sim.simulate(level, {"app_servers": 7})  # 86% busy: no errors, but far too slow
    assert check(seven, "errors")["value"] == 0 and not check(seven, "p99")["ok"] and seven["states"]["app"] == "hot"
    assert sim.simulate(level, {"app_servers": 6})["states"]["app"] == "down"  # exactly at capacity is already down


def test_a_cache_takes_load_off_the_database():
    level = sim.LEVELS["hot-reads"]
    none = sim.simulate(level, {"cache": 0})
    big = sim.simulate(level, {"cache": 95})
    assert none["states"]["db"] == "down" and big["states"]["db"] == "ok"
    assert "cache" not in none["states"] and big["states"]["cache"] == "ok"
    # Replicas can do it too, but cost far more than the cache that does the same job.
    assert sim.simulate(level, {"replicas": 4})["cost"] > sim.simulate(level, {"cache": 95})["cost"]


def test_replicas_do_not_absorb_a_write_spike_but_a_queue_does():
    level = sim.LEVELS["upload-spike"]
    replicas = sim.simulate(level, {"replicas": 3, "app_servers": 12})
    assert not replicas["passed"] and "every replica has to apply every write" in replicas["verdict"]
    solved = sim.simulate(level, {"app_servers": 8, "replicas": 1, "queue": True, "workers": 5})
    assert solved["passed"] and solved["cost"] == sim.cheapest(level)


def test_worker_count_has_a_sweet_spot():
    level = sim.LEVELS["upload-spike"]
    few = sim.simulate(level, {"queue": True, "workers": 1})  # slower than the average write rate
    assert check(few, "lag")["value"] is None and few["states"]["queue"] == "down" and "grows without limit" in few["verdict"]
    slow = sim.simulate(level, {"queue": True, "workers": 3, "replicas": 1, "app_servers": 8})
    assert not check(slow, "lag")["ok"] and check(slow, "errors")["ok"]
    many = sim.simulate(level, {"queue": True, "workers": 8})  # the queue no longer protects the database
    assert many["states"]["db"] == "down" and "faster than the database" in many["verdict"]


def test_settings_are_validated():
    level = sim.LEVELS["hot-reads"]
    for bad in ({"app_servers": 99}, {"cache": 50}, {"replicas": True}, {"turbo": 1}, {"app_servers": 2.5}):
        with pytest.raises(sim.SimError):
            sim.simulate(level, bad)
    assert sim.simulate(level, {})["config"] == {"app_servers": 8, "cache": 0, "replicas": 0}


def test_incident_is_fixed_by_the_date_and_always_solvable():
    day = date(2026, 11, 17)
    assert sim.incident_level(day) == sim.incident_level(day)
    for i in range(30):
        level = sim.incident_level(day + timedelta(days=i))
        assert level["id"] == f"incident:{(day + timedelta(days=i)).isoformat()}"
        assert not sim.simulate(level, {})["passed"]
        assert sim.cheapest(level) <= level["goals"]["budget"]
    assert len({sim.incident_level(day + timedelta(days=i))["base_id"] for i in range(30)}) == len(LEVELS)  # they rotate


# ---------- API ----------

def test_sim_flow_pays_bits_once_per_level(client):
    user = make_user(client)
    uid, start_bits = user["id"], user["bits"]
    overview = client.get(f"/users/{uid}/sim").json()
    assert [lv["id"] for lv in overview["levels"]] == list(sim.LEVELS) and not any(lv["solved"] for lv in overview["levels"])

    level = client.get(f"/users/{uid}/sim/launch-day").json()
    assert level["start"]["passed"] is False and level["knobs"][0]["id"] == "app_servers"

    fail = client.post(f"/users/{uid}/sim/launch-day/run", json={"config": {"app_servers": 7}}).json()
    assert not fail["passed"] and fail["bits_earned"] == 0 and fail["attempts"] == 1

    win = client.post(f"/users/{uid}/sim/launch-day/run", json={"config": {"app_servers": 10}}).json()
    assert win["passed"] and win["first_solve"] and win["bits_earned"] == sim.BITS_SOLVE and win["best_cost"] == 800
    better = client.post(f"/users/{uid}/sim/launch-day/run", json={"config": {"app_servers": 9}}).json()
    assert better["passed"] and not better["first_solve"] and better["bits_earned"] == 0 and better["best_cost"] == 740
    assert better["bits"] == start_bits + sim.BITS_SOLVE

    solved = next(lv for lv in client.get(f"/users/{uid}/sim").json()["levels"] if lv["id"] == "launch-day")
    assert solved == {"id": "launch-day", "title": "Launch day", "teaches": sim.LEVELS["launch-day"]["teaches"], "solved": True, "best_cost": 740, "attempts": 3}

    assert client.post(f"/users/{uid}/sim/launch-day/run", json={"config": {"app_servers": 0}}).status_code == 422
    assert client.get(f"/users/{uid}/sim/nope").status_code == 404


def test_daily_incident_pays_once_a_day(client, clock):
    uid = make_user(client, tz="UTC")["id"]
    level = sim.incident_level(clock.now.date())
    fix = next(cfg for cfg in sim._space(level) if sim.simulate(level, cfg)["passed"])

    shown = client.get(f"/users/{uid}/sim/incident").json()
    assert shown["id"] == level["id"] and shown["title"].startswith("Incident: ")
    first = client.post(f"/users/{uid}/sim/incident/run", json={"config": fix}).json()
    assert first["passed"] and first["bits_earned"] == sim.BITS_INCIDENT
    assert client.post(f"/users/{uid}/sim/incident/run", json={"config": fix}).json()["bits_earned"] == 0
    assert client.get(f"/users/{uid}/sim").json()["incident"]["solved"] is True

    clock.now += timedelta(days=1)  # a new day brings a new incident
    tomorrow = client.get(f"/users/{uid}/sim").json()["incident"]
    assert tomorrow["id"] != level["id"] and tomorrow["solved"] is False
