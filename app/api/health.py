from fastapi import APIRouter
from sqlalchemy import text

from app.db.database import engine

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    return {
        "ok": True,
        "service": "ai-consult-beauty-backend",
        "database": "ok" if db_ok else "unavailable",
    }
