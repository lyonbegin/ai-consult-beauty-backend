from collections.abc import Callable
from typing import Any

from collectors.hira import run_hira_collection
from collectors.tour_import import run_tour_import

JobRunner = Callable[[dict[str, Any]], dict[str, Any]]


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
        "label": "HIRA hospital collection",
        "description": "Collect official hospital data from HIRA. Requires HIRA_API_KEY for live mode.",
        "params": {
            "mode": {"type": "select", "options": ["dry-run", "live"], "default": "dry-run"},
            "limit": {"type": "number", "default": 100, "min": 1, "max": 10000},
        },
    },
    {
        "id": "tour_import",
        "label": "Existing tour data import",
        "description": "Import selected tour/touranal data after a source database/file is mounted or uploaded.",
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
