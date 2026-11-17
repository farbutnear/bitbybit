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


def test_seed_content_answers_are_self_consistent():
    tracks = {t["id"] for t in json.loads(COURSE_PATH.read_text())["tracks"]}
    cards = json.loads(CARDS_PATH.read_text())["cards"]
    ids = [c["id"] for c in cards]
    assert len(ids) == len(set(ids))
    for c in cards:
        assert c["track"] in tracks
        obj = card(c["kind"], c["data"])
        if c["kind"] == "mcq":
            assert grade(obj, c["data"]["answer"])[0], c["id"]
        elif c["kind"] == "order":
            assert grade(obj, c["data"]["items"])[0], c["id"]
        else:
            assert grade(obj, c["data"]["answer"])[0], c["id"]


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
                        assert len(s["teach"]["body"].split()) <= 60, f"{les['id']}: teaching screen too long"
    assert len(lesson_ids) == len(set(lesson_ids))
    assert sorted(used) == sorted(cards), "every card must appear in exactly one lesson"
