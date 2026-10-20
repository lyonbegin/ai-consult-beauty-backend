from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.db.database import SessionLocal
from app.models.job import Job
from app.schemas.job import JobCreate, JobRead
from collectors.registry import JOB_REGISTRY, JOB_TYPES

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/types")
def list_job_types() -> list[dict]:
    return JOB_TYPES


@router.get("", response_model=list[JobRead])
def list_jobs(limit: int = Query(default=50, ge=1, le=200)) -> list[Job]:
    with SessionLocal() as session:
        return list(
            session.scalars(
                select(Job)
                .order_by(Job.created_at.desc())
                .limit(limit)
            )
        )


@router.get("/{job_id}", response_model=JobRead)
def get_job(job_id: str) -> Job:
    with SessionLocal() as session:
        job = session.get(Job, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job not found")
        return job


@router.post("", response_model=JobRead, status_code=202)
def create_job(payload: JobCreate) -> Job:
    if payload.job_type not in JOB_REGISTRY:
        raise HTTPException(status_code=400, detail="unknown job type")

    with SessionLocal() as session:
        job = Job(
            job_type=payload.job_type,
            status="queued",
            params=payload.params,
        )
        session.add(job)
        session.commit()
        session.refresh(job)
        return job
