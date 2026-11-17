"""Spaced repetition (FSRS) and answer grading.

Card kinds: mcq, order, numeric, slider (log-scale estimate), spot (tap the faulty
component), build (fill slots in an architecture diagram), match (pair items).

Answers are auto-graded, so each review maps to an FSRS rating without asking the user:
wrong -> Again, right -> Good, right with help from a perk -> Hard.

Learning steps are disabled: short-term repetition happens inside the lesson (the app
re-asks a missed card at the end), so FSRS only has to schedule across days. A retry
inside the same lesson is logged for the daily goal but does not touch the schedule,
so a card you just failed still comes back tomorrow.
"""

import random
from datetime import datetime
from typing import Any

from fsrs import Card as FsrsCard
from fsrs import Rating, Scheduler

from .config import settings
from .models import Card

SCHEDULER = Scheduler(
    desired_retention=settings.desired_retention,
    learning_steps=(),
    relearning_steps=(),
    enable_fuzzing=True,  # spreads reviews out so cards learned together don't all come due together
)


class AnswerError(ValueError):
    """The submitted answer has the wrong shape for this card kind."""


def grade(card: Card, answer: Any) -> tuple[bool, Any]:
    """Return (correct, canonical_answer_to_show)."""
    d = card.data
    if card.kind == "mcq":
        if not isinstance(answer, int) or isinstance(answer, bool):
            raise AnswerError("mcq answer must be an option index")
        if not 0 <= answer < len(d["options"]):
            raise AnswerError("option index out of range")
        return answer == d["answer"], d["answer"]

    if card.kind == "order":
        if not isinstance(answer, list) or not all(isinstance(x, str) for x in answer):
            raise AnswerError("order answer must be a list of item strings")
        if sorted(answer) != sorted(d["items"]):
            raise AnswerError("order answer must contain each item exactly once")
        return answer == d["items"], d["items"]

    if card.kind in ("numeric", "slider"):
        if not isinstance(answer, (int, float)) or isinstance(answer, bool):
            raise AnswerError(f"{card.kind} answer must be a number")
        expected = float(d["answer"])
        tol = float(d.get("tolerance", 1.0))  # ratio: 2.0 means "within 2x either way"
        if answer <= 0:
            return False, expected
        ratio = max(answer / expected, expected / answer)
        return ratio <= tol + 1e-9, expected

    if card.kind == "spot":
        # Tap the one component in the diagram that is at fault.
        if not isinstance(answer, str):
            raise AnswerError("spot answer must be a node id")
        if answer not in {n["id"] for n in d["diagram"]["nodes"]}:
            raise AnswerError("spot answer must be a node in the diagram")
        return answer == d["answer"], d["answer"]

    if card.kind == "build":
        # Fill every empty slot in the diagram with a component from the bank.
        if not isinstance(answer, dict) or not all(isinstance(v, str) for v in answer.values()):
            raise AnswerError("build answer must map slot ids to component kinds")
        if set(answer) != set(d["slots"]):
            raise AnswerError("build answer must fill every slot, and only slots")
        spare = list(d["bank"])
        for kind in answer.values():
            if kind not in spare:
                raise AnswerError("build answer uses a component that is not in the bank")
            spare.remove(kind)  # each bank tile can be placed once
        return answer == d["slots"], d["slots"]

    if card.kind == "match":
        # Pair every left item with a right item.
        want = {left: right for left, right in d["pairs"]}
        ok_shape = isinstance(answer, list) and all(
            isinstance(p, (list, tuple)) and len(p) == 2 and all(isinstance(x, str) for x in p) for p in answer
        )
        if not ok_shape:
            raise AnswerError("match answer must be a list of [left, right] pairs")
        if sorted(p[0] for p in answer) != sorted(want) or sorted(p[1] for p in answer) != sorted(want.values()):
            raise AnswerError("match answer must use each item exactly once")
        return all(want[left] == right for left, right in answer), d["pairs"]

    raise ValueError(f"unknown card kind {card.kind!r}")


def _shuffled(items: list, rng: random.Random) -> list:
    """A shuffled copy that never comes back in the original order (when it could differ)."""
    out = list(items)
    while len(set(map(str, out))) > 1 and out == list(items):
        rng.shuffle(out)
    return out


def public_payload(card: Card, rng: random.Random | None = None) -> dict:
    """Card as sent to the app: everything needed to render it, nothing that gives away the answer."""
    rng = rng or random.Random()
    d = card.data
    base = {"id": card.id, "track_id": card.track_id, "kind": card.kind, "prompt": card.prompt}
    if card.kind == "mcq":
        return base | {"options": d["options"], "diagram": d.get("diagram")}
    if card.kind == "order":
        return base | {"items": _shuffled(d["items"], rng)}
    if card.kind == "numeric":
        return base | {"unit": d.get("unit", ""), "hint": d.get("hint")}
    if card.kind == "slider":
        return base | {"min": d["min"], "max": d["max"], "unit": d.get("unit", ""), "hint": d.get("hint")}
    if card.kind == "spot":
        return base | {"diagram": d["diagram"]}
    if card.kind == "build":
        # Slot nodes carry only an id and a position; which component belongs there stays on the server.
        return base | {"diagram": d["diagram"], "bank": _shuffled(d["bank"], rng)}
    if card.kind == "match":
        lefts = [p[0] for p in d["pairs"]]
        return base | {"left": lefts, "right": _shuffled([p[1] for p in d["pairs"]], rng)}
    raise ValueError(f"unknown card kind {card.kind!r}")


def _rating(correct: bool, assisted: bool) -> Rating:
    # A right answer that a perk helped with is "Hard": it counts, but comes back sooner.
    if not correct:
        return Rating.Again
    return Rating.Hard if assisted else Rating.Good


def schedule(fsrs_state: dict | None, correct: bool, now: datetime, assisted: bool = False) -> FsrsCard:
    card = FsrsCard.from_dict(fsrs_state) if fsrs_state else FsrsCard()
    new_card, _log = SCHEDULER.review_card(card, _rating(correct, assisted), now)
    return new_card


def rating_for(correct: bool, assisted: bool = False) -> int:
    return int(_rating(correct, assisted))
