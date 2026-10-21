from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Hospital(Base):
    __tablename__ = "hospitals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ykiho: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    yadm_nm: Mapped[str] = mapped_column(String(300), index=True)
    cl_cd: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    cl_cd_nm: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sido_cd: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    sido_cd_nm: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    sggu_cd: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    sggu_cd_nm: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    emdong_nm: Mapped[str | None] = mapped_column(String(100), nullable=True)
    post_no: Mapped[str | None] = mapped_column(String(20), nullable=True)
    addr: Mapped[str | None] = mapped_column(Text, nullable=True)
    telno: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hosp_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    estb_dd: Mapped[str | None] = mapped_column(String(20), nullable=True)
    dr_tot_cnt: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gdr_cnt: Mapped[int | None] = mapped_column(Integer, nullable=True)
    intn_cnt: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resdnt_cnt: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sdr_cnt: Mapped[int | None] = mapped_column(Integer, nullable=True)
    x_pos: Mapped[float | None] = mapped_column(Float, nullable=True)
    y_pos: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw: Mapped[dict] = mapped_column(JSON, default=dict)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    first_collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, index=True
    )


class HospitalDepartment(Base):
    __tablename__ = "hospital_departments"
    __table_args__ = (
        UniqueConstraint("ykiho", "dgsbjt_cd", name="uq_hospital_department"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ykiho: Mapped[str] = mapped_column(String(200), index=True)
    dgsbjt_cd: Mapped[str] = mapped_column(String(20), index=True)
    dgsbjt_cd_nm: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source: Mapped[str] = mapped_column(String(40), default="hira")
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
