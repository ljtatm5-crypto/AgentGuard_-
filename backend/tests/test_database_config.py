from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.session import Base, acquire_bootstrap_lock, normalize_database_url
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