import pytest
from sqlalchemy import inspect, text
from sqlalchemy.orm import sessionmaker

from app.db import SCHEMA_VERSION, init_db, make_engine
from app.models import SchemaMeta, User
from app.seed import seed_content


def test_fresh_database_is_created_and_versioned(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path}/a.db")
    assert init_db(engine) is False
    with sessionmaker(bind=engine)() as db:
        assert db.get(SchemaMeta, "version").value == str(SCHEMA_VERSION)
        assert seed_content(db) > 0
    assert init_db(engine) is False  # same version: nothing is rebuilt
    engine.dispose()


def test_old_schema_is_rebuilt_or_refused(tmp_path):
    """A database made before tracks existed (a `skills` table, cards keyed by skill)."""
    engine = make_engine(f"sqlite:///{tmp_path}/old.db")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE skills (id VARCHAR PRIMARY KEY, title VARCHAR, position INTEGER)"))
        conn.execute(text("CREATE TABLE cards (id VARCHAR PRIMARY KEY, skill_id VARCHAR REFERENCES skills(id))"))
        conn.execute(text("CREATE TABLE users (id VARCHAR PRIMARY KEY, name VARCHAR)"))
        conn.execute(text("INSERT INTO users VALUES ('u1', 'Old')"))

    with pytest.raises(RuntimeError, match="schema"):
        init_db(engine, reset_on_change=False)

    assert init_db(engine, reset_on_change=True) is True
    tables = inspect(engine).get_table_names()
    assert "skills" not in tables and "tracks" in tables
    with sessionmaker(bind=engine)() as db:
        assert db.get(User, "u1") is None
        assert seed_content(db) > 0  # the new schema accepts the course
    engine.dispose()
