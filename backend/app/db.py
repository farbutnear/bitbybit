from collections.abc import Iterator
from datetime import datetime, timezone

from sqlalchemy import DateTime, create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.types import TypeDecorator

from .config import settings


class UTCDateTime(TypeDecorator):
    """Stores timezone-aware datetimes as naive UTC and returns them as aware UTC.

    SQLite has no timezone support, so without this, aware datetimes go in and naive
    ones come out, and comparisons between the two raise. Everything in the app is UTC.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("Naive datetime passed to UTCDateTime column; use an aware datetime")
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect):
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc)


class Base(DeclarativeBase):
    pass


def make_engine(url: str) -> Engine:
    kwargs: dict = {}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    engine = create_engine(url, **kwargs)

    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _record):
            cur = dbapi_conn.cursor()
            # WAL lets the API and the reminder worker use the same file concurrently.
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

    return engine


engine = make_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Bump when the tables change. There are no migrations yet (prototype), so a mismatch
# rebuilds the database from scratch; content is reseeded and the app sends users whose
# account vanished back through onboarding.
SCHEMA_VERSION = 4


def init_db(target: Engine | None = None, reset_on_change: bool = True) -> bool:
    """Create tables, rebuilding them if they were made by an older schema. Returns True if rebuilt."""
    import logging

    from sqlalchemy import MetaData, inspect, select

    from .models import SchemaMeta  # imported here: models imports this module

    eng = target or engine
    existing = inspect(eng).get_table_names()
    rebuilt = False
    if existing:
        current = None
        if SchemaMeta.__tablename__ in existing:
            with eng.connect() as conn:
                current = conn.execute(select(SchemaMeta.value).where(SchemaMeta.key == "version")).scalar()
        if current != str(SCHEMA_VERSION):
            if not reset_on_change:
                raise RuntimeError(
                    f"Database schema is version {current}, the code expects {SCHEMA_VERSION}. "
                    "Migrate it, or set BITBYBIT_RESET_DB_ON_SCHEMA_CHANGE=true to rebuild it."
                )
            logging.getLogger("bitbybit.db").warning(
                "Schema changed (%s -> %s): rebuilding the database. Existing users and progress are removed.",
                current,
                SCHEMA_VERSION,
            )
            old = MetaData()
            old.reflect(eng)
            old.drop_all(eng)
            rebuilt = True
    Base.metadata.create_all(eng)
    with sessionmaker(bind=eng)() as db:
        db.merge(SchemaMeta(key="version", value=str(SCHEMA_VERSION)))
        db.commit()
    return rebuilt
