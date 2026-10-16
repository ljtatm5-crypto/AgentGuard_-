from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import agents, findings, metrics, runs, suites
from app.core.config import get_settings
from app.db.session import SessionLocal, init_db
from app.services.seed import ensure_demo_data

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        ensure_demo_data(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="面向 AI 智能体的可观察测试与安全回归平台",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz", tags=["system"])
def healthz():
    return {"status": "ok", "service": "agentguard-backend", "demo_mode": settings.demo_mode}


app.include_router(agents.router, prefix="/api")
app.include_router(suites.router, prefix="/api")
app.include_router(runs.router, prefix="/api")
app.include_router(findings.router, prefix="/api")
app.include_router(metrics.router, prefix="/api")
