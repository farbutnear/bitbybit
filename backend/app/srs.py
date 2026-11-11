"""Spaced repetition (FSRS) and answer grading.

Answers are auto-graded, so each review maps to one of two FSRS ratings:
wrong -> Again, right -> Good.

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

    if card.kind == "numeric":
        if not isinstance(answer, (int, float)) or isinstance(answer, bool):
            raise AnswerError("numeric answer must be a number")
        expected = float(d["answer"])
        tol = float(d.get("tolerance", 1.0))  # ratio: 2.0 means "within 2x either way"
        if answer <= 0:
            return False, expected
        ratio = max(answer / expected, expected / answer)
        return ratio <= tol + 1e-9, expected

    raise ValueError(f"unknown card kind {card.kind!r}")


def public_payload(card: Card, rng: random.Random | None = None) -> dict:
    """Card as sent to the app: everything needed to render it, nothing that gives away the answer."""
    rng = rng or random.Random()
    d = card.data
    base = {"id": card.id, "skill_id": card.skill_id, "kind": card.kind, "prompt": card.prompt}
    if card.kind == "mcq":
        return base | {"options": d["options"], "diagram": d.get("diagram")}
    if card.kind == "order":
        items = list(d["items"])
        while len(items) > 1 and items == d["items"]:
            rng.shuffle(items)
        return base | {"items": items}
    if card.kind == "numeric":
        return base | {"unit": d.get("unit", ""), "hint": d.get("hint")}
    raise ValueError(f"unknown card kind {card.kind!r}")


def schedule(fsrs_state: dict | None, correct: bool, now: datetime) -> FsrsCard:
    card = FsrsCard.from_dict(fsrs_state) if fsrs_state else FsrsCard()
    rating = Rating.Good if correct else Rating.Again
    new_card, _log = SCHEDULER.review_card(card, rating, now)
    return new_card


def rating_for(correct: bool) -> int:
    return int(Rating.Good if correct else Rating.Again)
