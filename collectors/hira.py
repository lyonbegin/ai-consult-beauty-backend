"""HIRA hospital collector.

The job endpoint is live now. In dry-run mode it validates the job path without
calling HIRA. Live API mapping will be added once the HIRA key/endpoints are set.
"""

import os
from typing import Any


def run_hira_collection(params: dict[str, Any] | None = None) -> dict[str, Any]:
    params = params or {}
    mode = str(params.get("mode", "dry-run"))
    limit = int(params.get("limit", 100))

    if mode == "dry-run":
        return {
            "collector": "hira",
            "status": "dry-run-ok",
            "requested_limit": limit,
            "message": "Job pipeline is working. No external HIRA request was made.",
        }

    if not os.getenv("HIRA_API_KEY"):
        raise RuntimeError("HIRA_API_KEY is not configured for live collection")

    return {
        "collector": "hira",
        "status": "ready-for-endpoint-mapping",
        "requested_limit": limit,
        "message": "HIRA key is present; concrete endpoint mapping is the next collector step.",
    }
