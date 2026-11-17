import json
import random

import pytest

from app.models import Card
from app.seed import CARDS_PATH, COURSE_PATH
from app.srs import AnswerError, grade, public_payload


def card(kind, data):
    return Card(id="c", track_id="t", position=0, kind=kind, prompt="p", data=data, explanation="e")


def test_mcq():
    c = card("mcq", {"options": ["a", "b", "c"], "answer": 1})
    assert grade(c, 1) == (True, 1)
    assert grade(c, 0)[0] is False
    with pytest.raises(AnswerError):
        grade(c, 5)
    with pytest.raises(AnswerError):
        grade(c, True)  # bools are ints in Python; reject them


def test_order():
    c = card("order", {"items": ["x", "y", "z"]})
    assert grade(c, ["x", "y", "z"])[0] is True
    assert grade(c, ["y", "x", "z"])[0] is False
    with pytest.raises(AnswerError):
        grade(c, ["x", "x", "z"])


def test_numeric_tolerance_is_a_ratio():
    c = card("numeric", {"answer": 2315, "tolerance": 1.5})
    assert grade(c, 2000)[0] and grade(c, 3400)[0]
    assert not grade(c, 1000)[0] and not grade(c, 4000)[0]
    assert not grade(c, 0)[0] and not grade(c, -5)[0]
    exact = card("numeric", {"answer": 12, "tolerance": 1.0})
    assert grade(exact, 12)[0] and not grade(exact, 13)[0]


def test_payload_hides_answers_and_shuffles_order():
    c = card("order", {"items": ["a", "b", "c", "d"]})
    p = public_payload(c, random.Random(0))
    assert sorted(p["items"]) == ["a", "b", "c", "d"] and p["items"] != ["a", "b", "c", "d"]
    m = public_payload(card("mcq", {"options": ["a", "b"], "answer": 1}))
    assert "answer" not in m
    n = public_payload(card("numeric", {"answer": 3, "unit": "ms"}))
    assert "answer" not in n and n["unit"] == "ms"


DIAGRAM = {
    "nodes": [
        {"id": "users", "kind": "client", "label": "Users", "x": 0, "y": 0},
        {"id": "app", "kind": "app", "label": "App", "x": 1, "y": 0, "note": "p99 900 ms"},
        {"id": "s1", "kind": "slot", "x": 2, "y": 0},
        {"id": "s2", "kind": "slot", "x": 3, "y": 0},
    ],
    "edges": [["users", "app"], ["app", "s1"], ["s1", "s2"]],
}


def test_slider_grades_like_numeric_and_hides_the_answer():
    c = card("slider", {"min": 10, "max": 1_000_000, "answer": 2315, "tolerance": 1.5, "unit": "req/s"})
    assert grade(c, 2000) == (True, 2315.0) and not grade(c, 20000)[0]
    with pytest.raises(AnswerError):
        grade(c, "2000")
    p = public_payload(c)
    assert p["min"] == 10 and p["max"] == 1_000_000 and p["unit"] == "req/s"
    assert "answer" not in p and "tolerance" not in p


def test_spot():
    c = card("spot", {"diagram": DIAGRAM, "answer": "app"})
    assert grade(c, "app") == (True, "app") and grade(c, "users") == (False, "app")
    with pytest.raises(AnswerError):
        grade(c, "nope")
    with pytest.raises(AnswerError):
        grade(c, 1)
    p = public_payload(c)
    assert p["diagram"] == DIAGRAM and "answer" not in p


def test_build():
    data = {"diagram": DIAGRAM, "slots": {"s1": "queue", "s2": "worker"}, "bank": ["queue", "worker", "cache", "cdn"]}
    c = card("build", data)
    assert grade(c, {"s1": "queue", "s2": "worker"})[0] is True
    correct, shown = grade(c, {"s1": "worker", "s2": "queue"})  # right parts, wrong places
    assert correct is False and shown == {"s1": "queue", "s2": "worker"}
    for bad in ({"s1": "queue"}, {"s1": "queue", "s2": "worker", "s3": "cache"}, {"s1": "queue", "s2": "db"}, ["queue"]):
        with pytest.raises(AnswerError):
            grade(c, bad)
    with pytest.raises(AnswerError):
        grade(c, {"s1": "queue", "s2": "queue"})  # only one queue tile in the bank
    p = public_payload(c, random.Random(1))
    assert sorted(p["bank"]) == sorted(data["bank"]) and "slots" not in p
    assert all(set(n) <= {"id", "kind", "x", "y"} for n in p["diagram"]["nodes"] if n["kind"] == "slot")


def test_match():
    pairs = [["a", "1"], ["b", "2"], ["c", "3"]]
    c = card("match", {"pairs": pairs})
    assert grade(c, [["b", "2"], ["a", "1"], ["c", "3"]])[0] is True  # order of pairs doesn't matter
    assert grade(c, [["a", "2"], ["b", "1"], ["c", "3"]]) == (False, pairs)
    for bad in ([["a", "1"]], [["a", "1"], ["a", "2"], ["c", "3"]], [["a", "1"], ["b", "2"], ["c", "9"]], "abc", [["a"]]):
        with pytest.raises(AnswerError):
            grade(c, bad)
    p = public_payload(c, random.Random(0))
    assert p["left"] == ["a", "b", "c"] and sorted(p["right"]) == ["1", "2", "3"] and p["right"] != ["1", "2", "3"]
    assert "pairs" not in p


NODE_KINDS = {"client", "lb", "app", "cache", "db", "replica", "queue", "worker", "cdn", "box", "slot"}


def check_diagram(diagram, where):
    ids = [n["id"] for n in diagram["nodes"]]
    assert len(ids) == len(set(ids)), where
    for n in diagram["nodes"]:
        assert n["kind"] in NODE_KINDS, f"{where}: unknown node kind {n['kind']}"
        assert 0 <= n["x"] <= 3 and 0 <= n["y"] <= 3, f"{where}: {n['id']} is off the 4-column grid"
        assert n["kind"] == "slot" or n.get("label"), f"{where}: {n['id']} needs a label"
    edges = {tuple(e) for e in diagram["edges"]}
    for a, b in edges:
        assert a in ids and b in ids, f"{where}: edge {a}->{b}"
    for flow in diagram.get("flows", []):
        assert flow["speed"] in ("fast", "slow"), where
        for a, b in zip(flow["path"], flow["path"][1:]):
            assert (a, b) in edges, f"{where}: flow follows a missing edge {a}->{b}"


def test_seed_content_answers_are_self_consistent():
    tracks = {t["id"] for t in json.loads(COURSE_PATH.read_text())["tracks"]}
    cards = json.loads(CARDS_PATH.read_text())["cards"]
    ids = [c["id"] for c in cards]
    assert len(ids) == len(set(ids))
    for c in cards:
        assert c["track"] in tracks
        obj, d = card(c["kind"], c["data"]), c["data"]
        right = {"order": d.get("items"), "build": d.get("slots"), "match": d.get("pairs")}.get(c["kind"], d.get("answer"))
        assert grade(obj, right)[0], c["id"]
        public_payload(obj)  # must not raise
        if d.get("diagram"):
            check_diagram(d["diagram"], c["id"])
        if c["kind"] == "slider":
            assert d["min"] < d["answer"] < d["max"], c["id"]
        if c["kind"] == "build":
            slot_nodes = {n["id"] for n in d["diagram"]["nodes"] if n["kind"] == "slot"}
            assert slot_nodes == set(d["slots"]), c["id"]
            assert not any("label" in n or "note" in n for n in d["diagram"]["nodes"] if n["kind"] == "slot"), c["id"]
            assert len(d["bank"]) > len(d["slots"]), f"{c['id']}: bank needs distractors"
        if c["kind"] == "spot":
            assert not any(n["kind"] == "slot" for n in d["diagram"]["nodes"]), c["id"]


def test_course_structure_is_consistent():
    """Every card is taught in exactly one lesson, on its own track, and ids are unique."""
    course = json.loads(COURSE_PATH.read_text())["tracks"]
    cards = {c["id"]: c for c in json.loads(CARDS_PATH.read_text())["cards"]}
    used: list[str] = []
    lesson_ids: list[str] = []
    for t in course:
        for u in t["units"]:
            assert u["lessons"], u["id"]
            for les in u["lessons"]:
                lesson_ids.append(les["id"])
                card_steps = [s["card"] for s in les["steps"] if "card" in s]
                assert card_steps, f"{les['id']} has no cards"
                assert "teach" in les["steps"][0], f"{les['id']} should open by teaching"
                for cid in card_steps:
                    assert cards[cid]["track"] == t["id"], cid
                used.extend(card_steps)
                for s in les["steps"]:
                    if "teach" in s:
                        assert s["teach"]["title"] and s["teach"]["body"]
                        if s["teach"].get("diagram"):
                            check_diagram(s["teach"]["diagram"], les["id"])
                        assert len(s["teach"]["body"].split()) <= 60, f"{les['id']}: teaching screen too long"
    assert len(lesson_ids) == len(set(lesson_ids))
    assert sorted(used) == sorted(cards), "every card must appear in exactly one lesson"
