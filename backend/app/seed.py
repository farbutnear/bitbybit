"""Load the course (tracks, units, lessons, steps) and cards. Safe to run repeatedly: it upserts."""

import json
from pathlib import Path

from sqlalchemy import delete
from sqlalchemy.orm import Session

from .models import Card, Lesson, Step, Track, Unit

CONTENT_DIR = Path(__file__).parent / "content"
CARDS_PATH = CONTENT_DIR / "cards.json"
COURSE_PATH = CONTENT_DIR / "course.json"


def seed_content(db: Session, cards_path: Path = CARDS_PATH, course_path: Path = COURSE_PATH) -> int:
    cards = json.loads(cards_path.read_text(encoding="utf-8"))["cards"]
    tracks = json.loads(course_path.read_text(encoding="utf-8"))["tracks"]

    for pos, t in enumerate(tracks):
        db.merge(Track(id=t["id"], title=t["title"], blurb=t["blurb"], icon=t["icon"], position=pos))
    db.flush()

    for pos, c in enumerate(cards):
        db.merge(
            Card(
                id=c["id"],
                track_id=c["track"],
                position=pos,
                kind=c["kind"],
                prompt=c["prompt"],
                data=c["data"],
                explanation=c["explanation"],
            )
        )
    db.flush()

    for t in tracks:
        lesson_pos = 0
        for unit_pos, u in enumerate(t["units"]):
            db.merge(Unit(id=u["id"], track_id=t["id"], title=u["title"], position=unit_pos))
            db.flush()
            for les in u["lessons"]:
                db.merge(
                    Lesson(id=les["id"], unit_id=u["id"], track_id=t["id"], title=les["title"], position=lesson_pos)
                )
                lesson_pos += 1
                db.flush()
                # Steps carry no user data, so replace them wholesale.
                db.execute(delete(Step).where(Step.lesson_id == les["id"]))
                for step_pos, s in enumerate(les["steps"]):
                    if "card" in s:
                        db.add(Step(lesson_id=les["id"], position=step_pos, kind="card", card_id=s["card"]))
                    else:
                        db.add(Step(lesson_id=les["id"], position=step_pos, kind="teach", data=s["teach"]))
    db.commit()
    return len(cards)


if __name__ == "__main__":
    from .db import SessionLocal, init_db

    init_db()
    with SessionLocal() as db:
        print(f"Seeded {seed_content(db)} cards")
