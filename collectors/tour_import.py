"""Migration entry point for selected data from the existing tour/touranal databases.

The importer is intentionally schema-neutral at this stage. The existing SQLite schemas
will be inspected before table mappings are implemented.
"""


def run_tour_import() -> dict:
    return {
        "collector": "tour-import",
        "status": "pending-schema-mapping",
    }
