from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def escape_alembic_url(url: str) -> str:
    """Escape ConfigParser interpolation markers in Alembic URLs."""
    return normalize_database_url(url).replace("%", "%%")


def should_use_managed_pool(environment: str, url: str) -> bool:
    return environment in {"production", "preview"} or "-pooler." in url


def managed_pool_options(recycle_seconds: int) -> dict:
    """Small warm pool for serverless without hoarding Neon connections."""
    return {
        "pool_size": 1,
        "max_overflow": 3,
        "pool_timeout": 5,
        "pool_recycle": min(recycle_seconds, 60),
    }


def normalize_database_url(url: str) -> str:
    """Normalize managed PostgreSQL URLs for psycopg 3 + SQLAlchemy."""
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url.removeprefix("postgres://")
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url.removeprefix("postgresql://")
    return url


settings = get_settings()
database_url = normalize_database_url(settings.database_url)
is_sqlite = database_url.startswith("sqlite")
engine_kwargs: dict = {}
if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    managed_pool = should_use_managed_pool(settings.environment, database_url)
    engine_kwargs.update({"pool_pre_ping": True, "connect_args": {"connect_timeout": 10}})
    if managed_pool:
        # Neon owns the server-side pool. Keep only one idle socket per warm
        # function while allowing short bursts of concurrent dashboard reads.
        engine_kwargs.update(managed_pool_options(settings.db_pool_recycle_seconds))
    else:
        engine_kwargs.update({
            "pool_size": settings.db_pool_size,
            "max_overflow": settings.db_max_overflow,
            "pool_recycle": settings.db_pool_recycle_seconds,
        })
engine = create_engine(database_url, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app.models import entities  # noqa: F401

    Base.metadata.create_all(bind=engine)


def check_db_connection() -> None:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))


def acquire_bootstrap_lock(db: Session) -> None:
    """Serialize first-run seeding across concurrent serverless cold starts."""
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(1730119902)"))
