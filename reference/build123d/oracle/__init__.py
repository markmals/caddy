"""Shared helpers for Caddy's pinned build123d fixture oracle.

Case modules (`reference/build123d/cases/<suite>.py`) import from here:

    from oracle import case, shape_metrics, vec

    @case("vector/add")
    def vector_add() -> dict:
        return {"result": vec(Vector(1, 2, 3) + Vector(4, 5, 6))}

`reference/build123d/scripts/generate_fixtures.py` puts `reference/build123d` on
`sys.path`, so `oracle` is importable as a top-level package without making
`reference/build123d` itself a package (which would shadow the real `build123d`).
"""

from __future__ import annotations

from .fonts import FONTS_DIR, SINGLE_LINE_FONT, TEST_FONT, TEST_FONT_NAME
from .registry import (
    CASES_DIR,
    FIXTURES_DIR,
    REFERENCE_ROOT,
    REPO_ROOT,
    Case,
    CaseContext,
    OracleError,
    active_case,
    case,
    registered_cases,
    registered_suites,
    require_context,
)
from .serialize import brep, location, plane, shape_metrics, vec

__all__ = [
    "CASES_DIR",
    "FIXTURES_DIR",
    "FONTS_DIR",
    "REFERENCE_ROOT",
    "REPO_ROOT",
    "SINGLE_LINE_FONT",
    "TEST_FONT",
    "TEST_FONT_NAME",
    "Case",
    "CaseContext",
    "OracleError",
    "active_case",
    "brep",
    "case",
    "location",
    "plane",
    "registered_cases",
    "registered_suites",
    "require_context",
    "shape_metrics",
    "vec",
]
