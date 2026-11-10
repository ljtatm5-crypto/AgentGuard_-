from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import agents, authorizations, desktop, findings, metrics, runs, suites
from app.core.config import get_settings
from app.db.session import SessionLocal, check_db_connection, init_db
from app.security.access import WriteAccessMiddleware
from app.services.seed import ensure_demo_data
from app.services.desktop_contract import ensure_desktop_data

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    check_db_connection()
    if settings.db_auto_create:
        init_db()
    db = SessionLocal()
    try:
        ensure_demo_data(db)
        ensure_desktop_data(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="面向 AI 智能体的可观察测试与安全回归平台",
    lifespan=lifespan,
)
# Installation order matters: CORS must wrap authentication failures too.
app.add_middleware(WriteAccessMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz", tags=["system"])
def healthz():
    return {
        "status": "ok",
        "service": "agentguard-backend",
        "demo_mode": settings.demo_mode,
        "writes_require_auth": not settings.allow_anonymous_writes,
        "max_cases_per_run": settings.max_cases_per_run,
        "environment": settings.environment,
    }


@app.get("/api/v2/capabilities", tags=["system"])
def capabilities():
    return {
        "public_read": True,
        "controlled_writes": True,
        "anonymous_writes": settings.allow_anonymous_writes,
        "writes_require_auth": not settings.allow_anonymous_writes,
        "max_cases_per_run": settings.max_cases_per_run,
        "async_tasks": False,
        "database": "postgresql" if settings.database_url.startswith(("postgresql", "postgres")) else "sqlite",
        "migrations": "alembic",
        "auto_create_schema": settings.db_auto_create,
        "environment": settings.environment,
        "llm_enabled": settings.llm_enabled,
        "write_token_configured": bool(settings.write_token.strip()),
        "private_reads_require_auth": not settings.allow_anonymous_writes,
        "rate_limit_scope": "per_process",
        "public_data_scope": "seeded_demo_summary",
    }


app.include_router(agents.router, prefix="/api")
app.include_router(authorizations.router, prefix="/api")
app.include_router(suites.router, prefix="/api")
app.include_router(runs.router, prefix="/api")
app.include_router(findings.router, prefix="/api")
app.include_router(metrics.router, prefix="/api")
app.include_router(desktop.router, prefix="/api/v2")
