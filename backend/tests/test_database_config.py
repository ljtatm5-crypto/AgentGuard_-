from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.session import Base, acquire_bootstrap_lock, escape_alembic_url, managed_pool_options, normalize_database_url, should_use_managed_pool
from app.models.entities import Agent


def test_normalize_postgres_urls():
    assert normalize_database_url("postgres://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert normalize_database_url("postgresql://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert normalize_database_url("sqlite:///./x.db") == "sqlite:///./x.db"


def test_sqlite_records_survive_engine_recreation(tmp_path):
    db_path = tmp_path / "persistence.db"
    url = f"sqlite:///{db_path.as_posix()}"
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(Agent(id="persisted-agent", name="persisted", adapter="mock"))
        session.commit()
    engine.dispose()

    reopened = create_engine(url)
    with Session(reopened) as session:
        row = session.scalar(select(Agent).where(Agent.id == "persisted-agent"))
        assert row is not None
        assert row.name == "persisted"
    reopened.dispose()

def test_bootstrap_lock_is_a_sqlite_noop(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'lock.db').as_posix()}")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        acquire_bootstrap_lock(session)
        assert session.scalar(select(1)) == 1
    engine.dispose()

def test_managed_neon_pool_is_detected():
    assert should_use_managed_pool("production", "postgresql+psycopg://u:p@direct.example/db")
    assert should_use_managed_pool("test", "postgresql+psycopg://u:p@db.example-pooler.example/db")
    assert not should_use_managed_pool("test", "postgresql+psycopg://u:p@direct.example/db")


def test_managed_pool_keeps_one_warm_connection_and_recycles_early():
    options = managed_pool_options(300)
    assert options["pool_size"] == 1
    assert options["max_overflow"] == 3
    assert options["pool_timeout"] == 5
    assert options["pool_recycle"] == 60


def test_alembic_url_escapes_percent_encoded_credentials():
    assert escape_alembic_url("postgresql://user:p%40ss@db.example/app") == "postgresql+psycopg://user:p%%40ss@db.example/app"
