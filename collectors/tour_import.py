"""Migration entry point for selected data from the existing tour/touranal project."""

from typing import Any


def run_tour_import(params: dict[str, Any] | None = None) -> dict[str, Any]:
    params = params or {}
    mode = str(params.get("mode", "dry-run"))
    source = str(params.get("source", "")).strip()

    if mode == "dry-run":
        return {
            "collector": "tour-import",
            "status": "dry-run-ok",
            "source": source or None,
            "message": "Job pipeline is working. No source database was changed.",
        }

    if not source:
        raise RuntimeError("source is required for live tour import")

    return {
        "collector": "tour-import",
        "status": "source-received",
        "source": source,
        "message": "Source was accepted. Schema-specific import mapping is the next migration step.",
    }
