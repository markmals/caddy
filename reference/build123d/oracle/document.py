"""Fixture document assembly: version header, JSON validation, canonical text."""

from __future__ import annotations

import json
import math
import sys
from importlib import metadata
from pathlib import Path
from typing import Any

from .registry import Case, OracleError, active_case

# OCCT release wrapped by `cadquery-ocp-novtk`. The wheel exposes no OCCT version
# symbol at runtime, so the mapping is pinned here and asserted against the
# installed distribution version (8.0.1.x -> 8.0.1).
OCCT_VERSION = "8.0.1"
OCP_DISTRIBUTION = "cadquery-ocp-novtk"

# JSON numbers are IEEE-754 doubles on the TypeScript side; a larger integer would
# silently lose precision when the fixture is read back.
MAX_SAFE_INTEGER = 2**53 - 1


def reference_header() -> dict[str, str]:
    """Versions that define the acceptance criteria encoded by a fixture."""
    ocp_version = metadata.version(OCP_DISTRIBUTION)
    return {
        "build123d": metadata.version("build123d"),
        "ocp": ocp_version,
        "occt": _occt_version(ocp_version),
        "python": ".".join(str(part) for part in sys.version_info[:3]),
    }


def build_document(
    suite: str, cases: list[Case], output_root: Path
) -> tuple[dict[str, Any], list[Path]]:
    """Run every case of `suite`, writing its assets below `output_root`.

    Returns the fixture document and every asset file the cases produced.
    """
    if not cases:
        raise OracleError(f"suite {suite!r} registered no cases")

    serialized: dict[str, Any] = {}
    assets: list[Path] = []
    for entry in cases:
        with active_case(entry.suite, entry.name, output_root) as context:
            try:
                raw = entry.func()
            except Exception as error:
                raise OracleError(
                    f"case {suite}:{entry.name} raised {type(error).__name__}: {error}"
                ) from error
            assets.extend(context.assets)
        if not isinstance(raw, dict):
            raise OracleError(
                f"case {suite}:{entry.name} returned {type(raw).__name__}, expected a dict"
            )
        serialized[entry.name] = normalize(raw, f"{suite}:{entry.name}")

    document = {"suite": suite, "reference": reference_header(), "cases": serialized}
    return document, assets


def normalize(value: Any, path: str) -> Any:
    """Validate `value` is JSON-safe and return its canonical form.

    Rejects anything `json.dumps` would accept silently but a fixture must never
    contain: NaN/Infinity, non-string keys, integers beyond JS precision, and
    build123d objects that were not passed through a serializer.
    """
    if value is None or isinstance(value, str):
        return value
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        if abs(value) > MAX_SAFE_INTEGER:
            raise OracleError(f"{path}: integer {value} exceeds JS safe-integer range")
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise OracleError(f"{path}: non-finite float {value!r}")
        return float(value)
    if isinstance(value, dict):
        normalized: dict[str, Any] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise OracleError(f"{path}: key {key!r} is {type(key).__name__}, expected str")
            normalized[key] = normalize(item, f"{path}.{key}")
        return normalized
    if isinstance(value, (list, tuple)):
        return [normalize(item, f"{path}[{index}]") for index, item in enumerate(value)]
    raise OracleError(
        f"{path}: {type(value).__name__} is not JSON-serializable; "
        "wrap it with a serializer from `oracle` (vec, location, plane, shape_metrics, brep)"
    )


def dumps(document: dict[str, Any]) -> str:
    """Canonical fixture text: sorted keys, two-space indent, full float precision."""
    return (
        json.dumps(document, indent=2, sort_keys=True, ensure_ascii=False, allow_nan=False) + "\n"
    )


def _occt_version(ocp_version: str) -> str:
    runtime = _occt_version_from_ocp()
    if runtime is not None:
        return runtime
    derived = ".".join(ocp_version.split(".")[:3])
    if derived != OCCT_VERSION:
        raise OracleError(
            f"{OCP_DISTRIBUTION} {ocp_version} maps to OCCT {derived}, "
            f"but this oracle pins OCCT {OCCT_VERSION}; update OCCT_VERSION and the docs"
        )
    return OCCT_VERSION


def _occt_version_from_ocp() -> str | None:
    """OCP 8.0.1.1.0 binds no `Standard_Version`; newer wheels may expose one."""
    try:
        from OCP.Standard import Standard_Version  # pyright: ignore[reportAttributeAccessIssue]
    except ImportError:
        return None
    return str(Standard_Version)
