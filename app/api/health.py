from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app.db.database import engine

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="database unavailable",
        ) from exc

    return {
        "ok": True,
        "service": "ai-consult-beauty-backend",
        "database": "ok",
    }
