from collections.abc import Callable
from typing import Any

from collectors.hira import run_hira_collection
from collectors.tour_import import run_tour_import

JobRunner = Callable[[dict[str, Any]], dict[str, Any]]

BEAUTY_DEPARTMENTS = [
    {"code": "08", "name": "성형외과"},
    {"code": "14", "name": "피부과"},
]


def _run_hira(params: dict[str, Any]) -> dict[str, Any]:
    return run_hira_collection(params)


def _run_tour_import(params: dict[str, Any]) -> dict[str, Any]:
    return run_tour_import(params)


JOB_REGISTRY: dict[str, JobRunner] = {
    "hira_collect": _run_hira,
    "tour_import": _run_tour_import,
}


JOB_TYPES = [
    {
        "id": "hira_collect",
        "label": "HIRA 병원 수집",
        "description": "심평원 병원정보서비스에서 병원 Master를 수집해 PostgreSQL에 upsert합니다.",
        "params": {
            "mode": {"type": "select", "options": ["dry-run", "live"], "default": "dry-run"},
            "preset": {"type": "select", "options": ["beauty", "single"], "default": "beauty"},
            "dgsbjt_cd": {"type": "text", "default": ""},
            "sido_cd": {"type": "text", "default": ""},
            "sggu_cd": {"type": "text", "default": ""},
            "yadm_nm": {"type": "text", "default": ""},
            "limit": {"type": "number", "default": 1000, "min": 1, "max": 100000},
        },
    },
    {
        "id": "tour_import",
        "label": "기존 Tour 데이터 이관",
        "description": "기존 tour/touranal 원본이 연결되면 상품·숙박·주문 데이터를 이관합니다.",
        "params": {
            "mode": {"type": "select", "options": ["dry-run", "live"], "default": "dry-run"},
            "source": {"type": "text", "default": ""},
        },
    },
]


def run_registered_job(job_type: str, params: dict[str, Any]) -> dict[str, Any]:
    runner = JOB_REGISTRY.get(job_type)
    if runner is None:
        raise ValueError(f"unknown job type: {job_type}")
    return runner(params)
