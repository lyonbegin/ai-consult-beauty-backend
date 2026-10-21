import os

from fastapi import APIRouter, Query
from sqlalchemy import exists, func, or_, select

from app.db.database import SessionLocal
from app.models.hospital import Hospital, HospitalDepartment

router = APIRouter(prefix="/api/hospitals", tags=["hospitals"])


@router.get("/config")
def hospital_config() -> dict:
    return {
        "hira_service_key_configured": bool(os.getenv("HIRA_API_KEY")),
        "hira_endpoint": "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList",
        "beauty_departments": {
            "08": "성형외과",
            "14": "피부과",
        },
    }


@router.get("/stats")
def hospital_stats() -> dict:
    with SessionLocal() as session:
        total = session.scalar(select(func.count()).select_from(Hospital)) or 0
        plastic = (
            session.scalar(
                select(func.count(func.distinct(HospitalDepartment.ykiho))).where(
                    HospitalDepartment.dgsbjt_cd == "08"
                )
            )
            or 0
        )
        dermatology = (
            session.scalar(
                select(func.count(func.distinct(HospitalDepartment.ykiho))).where(
                    HospitalDepartment.dgsbjt_cd == "14"
                )
            )
            or 0
        )
        beauty = (
            session.scalar(
                select(func.count(func.distinct(HospitalDepartment.ykiho))).where(
                    HospitalDepartment.dgsbjt_cd.in_(["08", "14"])
                )
            )
            or 0
        )

    return {
        "total_hospitals": total,
        "beauty_hospitals": beauty,
        "plastic_surgery": plastic,
        "dermatology": dermatology,
    }


@router.get("")
def list_hospitals(
    q: str = "",
    sido_cd: str = "",
    sggu_cd: str = "",
    department_code: str = "",
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict:
    stmt = select(Hospital)

    q = q.strip()
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Hospital.yadm_nm.ilike(like), Hospital.addr.ilike(like)))

    if sido_cd.strip():
        stmt = stmt.where(Hospital.sido_cd == sido_cd.strip())
    if sggu_cd.strip():
        stmt = stmt.where(Hospital.sggu_cd == sggu_cd.strip())

    department_code = department_code.strip()
    if department_code:
        stmt = stmt.where(
            exists(
                select(HospitalDepartment.id).where(
                    HospitalDepartment.ykiho == Hospital.ykiho,
                    HospitalDepartment.dgsbjt_cd == department_code,
                )
            )
        )

    stmt = stmt.order_by(Hospital.yadm_nm.asc()).offset(offset).limit(limit)

    with SessionLocal() as session:
        hospitals = list(session.scalars(stmt))

    return {
        "items": [
            {
                "ykiho": h.ykiho,
                "name": h.yadm_nm,
                "type_code": h.cl_cd,
                "type_name": h.cl_cd_nm,
                "sido_code": h.sido_cd,
                "sido_name": h.sido_cd_nm,
                "sggu_code": h.sggu_cd,
                "sggu_name": h.sggu_cd_nm,
                "address": h.addr,
                "phone": h.telno,
                "website": h.hosp_url,
                "x": h.x_pos,
                "y": h.y_pos,
            }
            for h in hospitals
        ],
        "limit": limit,
        "offset": offset,
    }
