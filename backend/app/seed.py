"""Load skills and cards from content/cards.json. Safe to run repeatedly: it upserts."""

import json
from pathlib import Path

from sqlalchemy.orm import Session

from .models import Card, Skill

CONTENT_PATH = Path(__file__).parent / "content" / "cards.json"


def seed_content(db: Session, path: Path = CONTENT_PATH) -> int:
    raw = json.loads(path.read_text(encoding="utf-8"))
    for pos, s in enumerate(raw["skills"]):
        db.merge(Skill(id=s["id"], title=s["title"], position=pos))
    for pos, c in enumerate(raw["cards"]):
        db.merge(
            Card(
                id=c["id"],
                skill_id=c["skill"],
                position=pos,
                kind=c["kind"],
                prompt=c["prompt"],
                data=c["data"],
                explanation=c["explanation"],
            )
        )
    db.commit()
    return len(raw["cards"])


if __name__ == "__main__":
    from .db import Base, SessionLocal, engine

    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        print(f"Seeded {seed_content(db)} cards")
