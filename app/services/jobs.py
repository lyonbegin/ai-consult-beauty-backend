from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.job import Job


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def claim_next_job(session: Session) -> Job | None:
    job = session.scalar(
        select(Job)
        .where(Job.status == "queued")
        .order_by(Job.created_at.asc())
        .with_for_update(skip_locked=True)
        .limit(1)
    )
    if job is None:
        session.rollback()
        return None

    job.status = "running"
    job.started_at = utcnow()
    session.commit()
    session.refresh(job)
    return job


def complete_job(session: Session, job: Job, result: dict) -> None:
    job.status = "succeeded"
    job.result = result
    job.error = None
    job.finished_at = utcnow()
    session.commit()


def fail_job(session: Session, job: Job, error: Exception) -> None:
    job.status = "failed"
    job.error = f"{type(error).__name__}: {error}"
    job.finished_at = utcnow()
    session.commit()
