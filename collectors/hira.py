"""HIRA hospital master collector.

Official base endpoint:
https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList

The API is XML and requires a data.go.kr service key.
"""

import math
import os
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.models.hospital import Hospital, HospitalDepartment

HIRA_HOSPITAL_URL = (
    "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList"
)

BEAUTY_DEPARTMENT_CODES = {
    "08": "성형외과",
    "14": "피부과",
}


def _text(item: ET.Element, tag: str) -> str | None:
    node = item.find(tag)
    if node is None or node.text is None:
        return None
    value = node.text.strip()
    return value or None


def _as_int(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _as_float(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _item_dict(item: ET.Element) -> dict[str, str | None]:
    return {child.tag: (child.text.strip() if child.text else None) for child in item}


def _parse_response(content: bytes) -> tuple[list[dict[str, str | None]], int]:
    try:
        root = ET.fromstring(content)
    except ET.ParseError as exc:
        raise RuntimeError("HIRA returned a non-XML or malformed response") from exc

    result_code = (
        root.findtext(".//header/resultCode")
        or root.findtext(".//returnReasonCode")
        or ""
    ).strip()
    result_msg = (
        root.findtext(".//header/resultMsg")
        or root.findtext(".//returnAuthMsg")
        or root.findtext(".//errMsg")
        or ""
    ).strip()

    if result_code and result_code not in {"00", "0000"}:
        raise RuntimeError(f"HIRA API error {result_code}: {result_msg or 'unknown error'}")

    total_text = root.findtext(".//body/totalCount") or root.findtext(".//totalCount") or "0"
    try:
        total_count = int(total_text)
    except ValueError:
        total_count = 0

    items = [_item_dict(node) for node in root.findall(".//items/item")]
    return items, total_count


def _hospital_values(item: dict[str, str | None]) -> dict[str, Any]:
    return {
        "ykiho": item.get("ykiho"),
        "yadm_nm": item.get("yadmNm") or "",
        "cl_cd": item.get("clCd"),
        "cl_cd_nm": item.get("clCdNm"),
        "sido_cd": item.get("sidoCd"),
        "sido_cd_nm": item.get("sidoCdNm"),
        "sggu_cd": item.get("sgguCd"),
        "sggu_cd_nm": item.get("sgguCdNm"),
        "emdong_nm": item.get("emdongNm"),
        "post_no": item.get("postNo"),
        "addr": item.get("addr"),
        "telno": item.get("telno"),
        "hosp_url": item.get("hospUrl"),
        "estb_dd": item.get("estbDd"),
        "dr_tot_cnt": _as_int(item.get("drTotCnt")),
        "gdr_cnt": _as_int(item.get("gdrCnt")),
        "intn_cnt": _as_int(item.get("intnCnt")),
        "resdnt_cnt": _as_int(item.get("resdntCnt")),
        "sdr_cnt": _as_int(item.get("sdrCnt")),
        "x_pos": _as_float(item.get("XPos")),
        "y_pos": _as_float(item.get("YPos")),
        "raw": item,
        "active": True,
        "last_collected_at": datetime.now(timezone.utc),
    }


def _upsert_hospital(
    session: Session,
    item: dict[str, str | None],
    department_code: str | None,
) -> tuple[bool, bool]:
    ykiho = item.get("ykiho")
    if not ykiho:
        return False, False

    values = _hospital_values(item)
    existing = session.scalar(select(Hospital).where(Hospital.ykiho == ykiho))

    inserted = existing is None
    if existing is None:
        existing = Hospital(**values)
        session.add(existing)
    else:
        for key, value in values.items():
            setattr(existing, key, value)

    department_inserted = False
    if department_code:
        dep = session.scalar(
            select(HospitalDepartment).where(
                HospitalDepartment.ykiho == ykiho,
                HospitalDepartment.dgsbjt_cd == department_code,
            )
        )
        if dep is None:
            session.add(
                HospitalDepartment(
                    ykiho=ykiho,
                    dgsbjt_cd=department_code,
                    dgsbjt_cd_nm=BEAUTY_DEPARTMENT_CODES.get(department_code),
                    source="hira",
                )
            )
            department_inserted = True
        else:
            dep.collected_at = datetime.now(timezone.utc)
            if not dep.dgsbjt_cd_nm:
                dep.dgsbjt_cd_nm = BEAUTY_DEPARTMENT_CODES.get(department_code)

    return inserted, department_inserted


def _query_codes(params: dict[str, Any]) -> list[str | None]:
    preset = str(params.get("preset", "")).strip().lower()
    if preset == "beauty":
        return ["08", "14"]

    code = str(params.get("dgsbjt_cd", "")).strip()
    return [code or None]


def _request_filters(params: dict[str, Any], department_code: str | None) -> dict[str, str]:
    mapping = {
        "sido_cd": "sidoCd",
        "sggu_cd": "sgguCd",
        "emdong_nm": "emdongNm",
        "yadm_nm": "yadmNm",
        "cl_cd": "clCd",
    }
    filters: dict[str, str] = {}
    for source_key, hira_key in mapping.items():
        value = str(params.get(source_key, "")).strip()
        if value:
            filters[hira_key] = value
    if department_code:
        filters["dgsbjtCd"] = department_code
    return filters


def run_hira_collection(params: dict[str, Any] | None = None) -> dict[str, Any]:
    params = params or {}
    mode = str(params.get("mode", "dry-run")).strip().lower()
    limit_per_department = max(1, min(int(params.get("limit", 1000)), 100000))
    page_size = max(1, min(int(params.get("page_size", 1000)), 1000))
    department_codes = _query_codes(params)

    request_plan = [
        {
            "department_code": code,
            "department_name": BEAUTY_DEPARTMENT_CODES.get(code or ""),
            "filters": _request_filters(params, code),
            "limit": limit_per_department,
            "page_size": page_size,
        }
        for code in department_codes
    ]

    if mode == "dry-run":
        return {
            "collector": "hira",
            "status": "dry-run-ok",
            "endpoint": HIRA_HOSPITAL_URL,
            "service_key_configured": bool(os.getenv("HIRA_API_KEY")),
            "request_plan": request_plan,
        }

    if mode != "live":
        raise RuntimeError("mode must be dry-run or live")

    service_key = os.getenv("HIRA_API_KEY", "").strip()
    if not service_key:
        raise RuntimeError(
            "HIRA_API_KEY is not configured in Railway. "
            "Add a data.go.kr service key before running live collection."
        )

    total_fetched = 0
    total_inserted = 0
    total_updated = 0
    department_links_added = 0
    pages_requested = 0
    by_department: list[dict[str, Any]] = []

    with httpx.Client(timeout=40.0, follow_redirects=True) as client:
        for department_code in department_codes:
            fetched_for_code = 0
            inserted_for_code = 0
            updated_for_code = 0
            links_for_code = 0
            page = 1
            reported_total: int | None = None

            while fetched_for_code < limit_per_department:
                remaining = limit_per_department - fetched_for_code
                rows = min(page_size, remaining)

                request_params: dict[str, Any] = {
                    "serviceKey": service_key,
                    "pageNo": page,
                    "numOfRows": rows,
                }
                request_params.update(_request_filters(params, department_code))

                response = client.get(HIRA_HOSPITAL_URL, params=request_params)
                response.raise_for_status()
                pages_requested += 1

                items, total_count = _parse_response(response.content)
                reported_total = total_count

                if not items:
                    break

                with SessionLocal() as session:
                    for item in items:
                        inserted, link_added = _upsert_hospital(
                            session,
                            item,
                            department_code,
                        )
                        if inserted:
                            inserted_for_code += 1
                        else:
                            updated_for_code += 1
                        if link_added:
                            links_for_code += 1
                    session.commit()

                fetched_for_code += len(items)

                if fetched_for_code >= limit_per_department:
                    break
                if total_count and page * rows >= total_count:
                    break
                if len(items) < rows:
                    break
                page += 1

            total_fetched += fetched_for_code
            total_inserted += inserted_for_code
            total_updated += updated_for_code
            department_links_added += links_for_code
            by_department.append(
                {
                    "department_code": department_code,
                    "department_name": BEAUTY_DEPARTMENT_CODES.get(department_code or ""),
                    "reported_total": reported_total,
                    "fetched": fetched_for_code,
                    "inserted": inserted_for_code,
                    "updated": updated_for_code,
                    "department_links_added": links_for_code,
                }
            )

    return {
        "collector": "hira",
        "status": "completed",
        "pages_requested": pages_requested,
        "fetched": total_fetched,
        "inserted": total_inserted,
        "updated": total_updated,
        "department_links_added": department_links_added,
        "by_department": by_department,
    }
