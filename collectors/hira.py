"""HIRA hospital collector entry point.

The concrete API mapping will be added after the Railway/PostgreSQL baseline is live.
"""


def run_hira_collection() -> dict:
    return {
        "collector": "hira",
        "status": "not-configured",
        "message": "Set HIRA_API_KEY and implement the selected HIRA endpoints.",
    }
