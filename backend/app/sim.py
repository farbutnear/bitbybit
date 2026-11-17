"""The simulator: tune a small system until it holds up under load.

Everything is computed on the server from simple queueing maths, so the same settings
always give the same result and it can be explained in a sentence:

  utilisation  = load / capacity
  mean latency = service time / (1 - utilisation)      (an M/M/1 queue)
  p99          = ln(100) x the mean latency of the slowest path that carries >= 1% of requests
  overloaded   = utilisation >= 1: the excess is dropped and the rest waits for the timeout

A level is a workload, a few knobs with prices, and goals for p99, errors, queue lag and
monthly cost. `simulate` is pure; the routes add bits and progress on top.
"""

import hashlib
import itertools
import json
import math
from datetime import date
from functools import lru_cache
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import loot
from .models import User, UserSim

LEVELS: dict[str, dict] = {lv["id"]: lv for lv in json.loads((Path(__file__).parent / "content" / "sim.json").read_text())["levels"]}

TIMEOUT_MS = 2000
P99_FACTOR = math.log(100)  # p99 of an exponential response time is ln(100) x its mean
BITS_SOLVE = 30  # first time a level is solved
BITS_INCIDENT = 40  # today's incident, once per day


class SimError(ValueError):
    """The submitted settings don't fit the level's knobs."""


# ---------- the model ----------

def _wait(service_ms: float, rho: float) -> float:
    """Mean time in an M/M/1 queue, capped at the timeout once it is overloaded."""
    if rho >= 1:
        return TIMEOUT_MS
    return min(TIMEOUT_MS, service_ms / (1 - rho))


def _drop(rho: float) -> float:
    """Share of requests an overloaded tier can't serve."""
    return 0.0 if rho < 1 else 1 - 1 / rho


def validate(level: dict, config: dict) -> dict:
    """Return the config with defaults filled in, or raise SimError."""
    out = {}
    knobs = {k["id"]: k for k in level["knobs"]}
    if not isinstance(config, dict) or set(config) - set(knobs):
        raise SimError("unknown setting")
    for kid, knob in knobs.items():
        value = config.get(kid, knob["default"])
        if knob["type"] == "int":
            if not isinstance(value, int) or isinstance(value, bool) or not knob["min"] <= value <= knob["max"]:
                raise SimError(f"{kid} must be a whole number from {knob['min']} to {knob['max']}")
        elif knob["type"] == "bool":
            if not isinstance(value, bool):
                raise SimError(f"{kid} must be on or off")
        elif value not in [o["value"] for o in knob["options"]]:
            raise SimError(f"{kid} must be one of the listed options")
        out[kid] = value
    return out


def simulate(level: dict, config: dict) -> dict:
    cfg = validate(level, config)
    knobs = {k["id"]: k for k in level["knobs"]}
    app, db, load = level["app"], level["db"], level["load"]

    servers = cfg.get("app_servers", app.get("servers", 1))
    hit = cfg.get("cache", 0) / 100
    replicas = cfg.get("replicas", 0)
    queued = cfg.get("queue", False)
    workers = cfg.get("workers", 0) if queued else 0

    reads = load["rps"] * (1 - load["write_ratio"])
    writes = load["rps"] * load["write_ratio"]
    burst = load.get("write_burst", 1)  # writes spike to this many times their average
    peak_writes = writes * burst

    # App tier: identical servers behind a load balancer, each an M/M/1 queue.
    rho_app = (reads + peak_writes) / (servers * app["rps_each"])

    # Writes reaching the database. A queue lets workers feed them in at their own pace.
    lag_s = 0.0
    unbounded = False
    if queued:
        worker_cap = workers * level["worker"]["rps_each"]
        db_writes = min(peak_writes, worker_cap)
        if worker_cap < writes:
            unbounded = True  # slower than the average: the backlog never drains
            lag_s = float("inf")
        elif worker_cap < peak_writes:
            lag_s = (peak_writes - worker_cap) * load.get("burst_seconds", 60) / worker_cap
    else:
        db_writes = peak_writes

    # Database: reads are shared by the primary and its replicas, but every node applies every write.
    db_reads = reads * (1 - hit)
    per_node_reads = db_reads / (1 + replicas)
    rho_db = per_node_reads / db["read_rps"] + db_writes / db["write_rps"]

    w_app, w_db = _wait(app["service_ms"], rho_app), _wait(db["service_ms"], rho_db)
    paths = [  # (share of all requests, mean latency, chance of failing)
        (reads * hit, w_app + 1, _drop(rho_app)),
        (reads * (1 - hit), w_app + w_db, 1 - (1 - _drop(rho_app)) * (1 - _drop(rho_db))),
        (peak_writes, w_app + (2 if queued else w_db), _drop(rho_app) if queued else 1 - (1 - _drop(rho_app)) * (1 - _drop(rho_db))),
    ]
    total = sum(p[0] for p in paths)
    p99 = min(TIMEOUT_MS, P99_FACTOR * max(lat for share, lat, _ in paths if share / total >= 0.01))
    errors = sum(share * fail for share, _, fail in paths) / total

    cost = db["cost"] + servers * app["cost"] + replicas * db.get("replica_cost", 0)
    if "cache" in knobs:
        cost += next(o["cost"] for o in knobs["cache"]["options"] if o["value"] == cfg["cache"])
    if queued:
        cost += level["queue"]["cost"] + workers * level["worker"]["cost"]

    goals = level["goals"]
    checks = [
        {"id": "p99", "label": "p99 latency", "value": round(p99), "target": goals["p99_ms"], "unit": "ms", "ok": p99 <= goals["p99_ms"]},
        {"id": "errors", "label": "Errors", "value": round(errors * 100, 1), "target": goals["error_pct"], "unit": "%", "ok": errors * 100 <= goals["error_pct"]},
    ]
    if "lag_s" in goals:
        checks.append(
            {"id": "lag", "label": "Queue lag", "value": None if unbounded else round(lag_s), "target": goals["lag_s"], "unit": "s", "ok": lag_s <= goals["lag_s"]}
        )
    checks.append({"id": "cost", "label": "Cost", "value": cost, "target": goals["budget"], "unit": "$/mo", "ok": cost <= goals["budget"]})

    def state(rho: float) -> str:
        return "down" if rho >= 1 else "hot" if rho >= 0.75 else "ok"

    busy = lambda rho: f"{round(rho * 100)}% busy"  # noqa: E731
    nodes = [
        {"id": "users", "kind": "client", "label": "Users", "note": f"{load['rps']:,} req/s", "x": 0, "y": 1},
        {"id": "app", "kind": "app", "label": f"App x{servers}", "note": busy(rho_app), "x": 1, "y": 1},
        {"id": "db", "kind": "db", "label": "Database" if not replicas else f"DB +{replicas} replica{'s' if replicas > 1 else ''}", "note": busy(rho_db), "x": 3, "y": 1},
    ]
    edges = [["users", "app"], ["app", "db"]]
    states = {"app": state(rho_app), "db": state(rho_db)}
    if hit:
        nodes.append({"id": "cache", "kind": "cache", "label": "Cache", "note": f"{round(hit * 100)}% hits", "x": 2, "y": 0})
        edges.append(["app", "cache"])
        states["cache"] = "ok"
    if queued:
        slow = unbounded or lag_s > goals.get("lag_s", math.inf)
        nodes.append({"id": "queue", "kind": "queue", "label": "Queue", "note": "never drains" if unbounded else f"{round(lag_s)} s lag", "x": 2, "y": 2})
        nodes.append({"id": "workers", "kind": "worker", "label": f"Workers x{workers}", "note": f"{workers * level['worker']['rps_each']:,} writes/s", "x": 3, "y": 2})
        edges += [["app", "queue"], ["queue", "workers"]]
        states["queue"] = "down" if unbounded else "hot" if slow else "ok"
        states["workers"] = "ok"

    passed = all(c["ok"] for c in checks)
    return {
        "config": cfg,
        "passed": passed,
        "checks": checks,
        "cost": cost,
        "diagram": {"nodes": nodes, "edges": edges, "flows": [{"path": ["users", "app", "db"], "speed": "fast" if passed else "slow"}]},
        "states": states,
        "verdict": _verdict(passed, rho_app, rho_db, cost, goals, checks, queued, unbounded, replicas, load),
    }


def _verdict(passed, rho_app, rho_db, cost, goals, checks, queued, unbounded, replicas, load) -> str:
    """One or two sentences on what is holding the system back, starting with the worst problem."""
    ok = {c["id"]: c["ok"] for c in checks}
    if passed:
        return "It holds. Every tier has headroom and the bill is inside the budget."
    if unbounded:
        return "The workers are slower than the average write rate, so the queue grows without limit. Add workers until they outpace it."
    if rho_db >= 1:
        if load.get("write_burst", 1) > 1 and not queued:
            return (
                "The write spike is more than the database can apply at once. Replicas won't fix that: "
                "every replica has to apply every write too. Something has to absorb the burst."
            )
        if queued:
            return "The workers now push writes faster than the database can apply them. Use fewer workers, or take read load off the database."
        return f"The database is at {round(rho_db * 100)}% of what it can do, so requests pile up and time out. Take load off it."
    if rho_app >= 1:
        return f"The app tier is at {round(rho_app * 100)}% of capacity. Requests are being dropped before they reach anything else."
    if not ok.get("lag", True):
        return "The queue absorbs the spike, but it drains too slowly. A few more workers will clear it in time."
    if not ok["p99"]:
        tier, rho = ("database", rho_db) if rho_db >= rho_app else ("app tier", rho_app)
        if tier == "database" and load.get("write_burst", 1) > 1 and not queued:
            return (
                f"The database is {round(rho * 100)}% busy, and most of that is the write spike. Replicas can't share it: "
                "every replica has to apply every write too. Something has to absorb the burst."
            )
        return f"Nothing is down, but the {tier} is {round(rho * 100)}% busy and waiting time climbs steeply past about 70%. Give it headroom."
    if not ok["cost"]:
        return f"It holds up, but it costs ${cost:,} a month against a budget of ${goals['budget']:,}. Find the cheaper fix."
    return "Close. One number is still over its target."


# ---------- levels, the daily incident and progress ----------

def _space(level: dict):
    """Every possible setting of a level's knobs."""
    axes = []
    for k in level["knobs"]:
        if k["type"] == "int":
            axes.append(range(k["min"], k["max"] + 1))
        elif k["type"] == "bool":
            axes.append((False, True))
        else:
            axes.append([o["value"] for o in k["options"]])
    for combo in itertools.product(*axes):
        yield dict(zip([k["id"] for k in level["knobs"]], combo, strict=True))


def cheapest(level: dict) -> int | None:
    """The lowest monthly cost that meets every goal except the budget, or None if nothing does."""
    best = None
    for cfg in _space(level):
        res = simulate(level, cfg)
        if all(c["ok"] for c in res["checks"] if c["id"] != "cost") and (best is None or res["cost"] < best):
            best = res["cost"]
    return best


@lru_cache(maxsize=64)
def incident_level(day: date) -> dict:
    """Today's incident: one of the levels, with the traffic scaled by a factor fixed by the date."""
    ids = sorted(LEVELS)
    digest = hashlib.sha256(day.isoformat().encode()).digest()
    base = LEVELS[ids[digest[0] % len(ids)]]
    for step in range(6):  # walk down from the day's factor until the level is solvable
        factor = round(1.1 + (digest[1] % 5) * 0.1 - step * 0.1, 1)
        level = json.loads(json.dumps(base))
        level["load"]["rps"] = round(base["load"]["rps"] * factor / 50) * 50
        best = cheapest(level)
        if best is not None:
            level["goals"]["budget"] = math.ceil(best * 1.15 / 10) * 10
            break
    level["id"] = f"incident:{day.isoformat()}"
    level["base_id"] = base["id"]
    level["title"] = f"Incident: {base['title']}"
    level["story"] = f"Traffic is running at {factor:g}x the usual. {base['story']}"
    return level


def get_level(level_id: str, today: date) -> dict | None:
    if level_id == "incident":
        return incident_level(today)
    return LEVELS.get(level_id)


def public_level(level: dict) -> dict:
    return {
        "id": level["id"],
        "title": level["title"],
        "story": level["story"],
        "teaches": level["teaches"],
        "goals": level["goals"],
        "knobs": level["knobs"],
        "start": simulate(level, {}),
    }


def overview(db: Session, user: User, today: date) -> dict:
    rows = {r.level_id: r for r in db.scalars(select(UserSim).where(UserSim.user_id == user.id))}
    incident = incident_level(today)
    inc = rows.get(incident["id"])

    def entry(level: dict, row: UserSim | None) -> dict:
        return {
            "id": level["id"],
            "title": level["title"],
            "teaches": level["teaches"],
            "solved": bool(row and row.solved_at),
            "best_cost": row.best_cost if row else None,
            "attempts": row.attempts if row else 0,
        }

    return {
        "levels": [entry(lv, rows.get(lv["id"])) for lv in LEVELS.values()],
        "incident": entry(incident, inc) | {"story": incident["story"], "bits": BITS_INCIDENT},
        "bits_per_level": BITS_SOLVE,
    }


def run(db: Session, user: User, level: dict, config: dict, now) -> dict:
    """Run a level with the user's settings, record the attempt and pay bits for a first solve."""
    result = simulate(level, config)
    row = db.get(UserSim, (user.id, level["id"]))
    if row is None:
        row = UserSim(user_id=user.id, level_id=level["id"], attempts=0)
        db.add(row)
    row.attempts += 1
    first_solve = False
    bits = 0
    if result["passed"]:
        if row.solved_at is None:
            row.solved_at = now
            first_solve = True
            bits = loot.award(db, user, BITS_INCIDENT if level["id"].startswith("incident:") else BITS_SOLVE)
        row.best_cost = result["cost"] if row.best_cost is None else min(row.best_cost, result["cost"])
    db.commit()
    return result | {"first_solve": first_solve, "bits_earned": bits, "bits": user.bits, "attempts": row.attempts, "best_cost": row.best_cost}
