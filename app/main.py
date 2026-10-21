from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.hospitals import router as hospitals_router
from app.api.jobs import router as jobs_router
from app.core.config import get_settings
from app.db.database import Base, engine
from app.models import Hospital, HospitalDepartment, Job  # noqa: F401

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(jobs_router)
app.include_router(hospitals_router)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/")
def root() -> dict:
    return {
        "service": "ai-consult-beauty-backend",
        "version": "0.3.0",
        "status": "running",
        "control_api": "/api/jobs",
        "hospital_api": "/api/hospitals",
    }
