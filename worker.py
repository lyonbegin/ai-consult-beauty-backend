import logging
import os
import time

from app.db.database import Base, SessionLocal, engine
from app.models import Job  # noqa: F401
from app.services.jobs import claim_next_job, complete_job, fail_job
from collectors.registry import run_registered_job

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("beauty-worker")

poll_seconds = max(1, int(os.getenv("WORKER_POLL_SECONDS", "2")))

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    log.info("beauty worker started; poll=%ss", poll_seconds)

    while True:
        with SessionLocal() as session:
            job = claim_next_job(session)
            if job is None:
                time.sleep(poll_seconds)
                continue

            log.info("job started id=%s type=%s params=%s", job.id, job.job_type, job.params)
            try:
                result = run_registered_job(job.job_type, job.params or {})
                complete_job(session, job, result)
                log.info("job succeeded id=%s result=%s", job.id, result)
            except Exception as exc:
                fail_job(session, job, exc)
                log.exception("job failed id=%s type=%s", job.id, job.job_type)
