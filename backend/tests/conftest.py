import os
import tempfile
from datetime import datetime, timezone

# Point the module-level engine at a throwaway file before the app is imported.
os.environ.setdefault("SYSDRILL_DATABASE_URL", f"sqlite:///{tempfile.mkdtemp()}/import.db")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app import main
from app.db import Base, make_engine
from app.push import PushResult
from app.seed import seed_content


class Clock:
    def __init__(self, now: datetime):
        self.now = now

    def __call__(self) -> datetime:
        return self.now


class FakeSender:
    def __init__(self):
        self.sent = []
        self.errors: dict[str, str] = {}  # token -> error to return

    def __call__(self, messages):
        self.sent.extend(messages)
        return [PushResult(m.to, m.to not in self.errors, self.errors.get(m.to)) for m in messages]


@pytest.fixture
def session_factory(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path}/test.db")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as db:
        seed_content(db)
    yield factory
    engine.dispose()


@pytest.fixture
def clock():
    # Wednesday 2026-11-11 15:00 UTC (23:00 in Singapore, 10:00 in New York)
    return Clock(datetime(2026, 11, 11, 15, 0, tzinfo=timezone.utc))


@pytest.fixture
def sender():
    return FakeSender()


@pytest.fixture
def client(session_factory, clock, sender):
    def _db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    main.app.dependency_overrides[main.get_db] = _db
    main.app.dependency_overrides[main.get_now] = clock
    main.app.dependency_overrides[main.get_sender] = lambda: sender
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()
