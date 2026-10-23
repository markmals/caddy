"""Case registration and the per-case asset context for the build123d oracle.

Case modules live in `reference/build123d/cases/<suite>.py`; the suite name is the
file stem and is derived from the decorated function's source file, so a case
module can be imported under any module name without changing its suite.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

CaseFunction = Callable[[], dict[str, Any]]

REPO_ROOT = Path(__file__).resolve().parents[3]
REFERENCE_ROOT = REPO_ROOT / "reference" / "build123d"
CASES_DIR = REFERENCE_ROOT / "cases"
FIXTURES_DIR = REFERENCE_ROOT / "fixtures"

# Case names become JSON keys, test titles and asset file stems, so they are kept
# to a portable alphabet; `/` is allowed as a grouping separator.
CASE_NAME_RE = re.compile(r"\A[a-z0-9]+(?:[._-][a-z0-9]+)*(?:/[a-z0-9]+(?:[._-][a-z0-9]+)*)*\Z")


@dataclass(frozen=True)
class Case:
    """A single oracle case: a zero-argument function returning a JSON-safe dict."""

    suite: str
    name: str
    func: CaseFunction


@dataclass
class CaseContext:
    """Bookkeeping for the case currently being evaluated by the runner."""

    suite: str
    name: str
    # Stands in for `reference/build123d/fixtures`; `--check` points it at a temp dir.
    output_root: Path
    assets: list[Path] = field(default_factory=list)


_REGISTRY: dict[str, dict[str, Case]] = {}
_ACTIVE: CaseContext | None = None


class OracleError(RuntimeError):
    """Raised for any misuse of the oracle API; always fatal for the runner."""


def case(name: str) -> Callable[[CaseFunction], CaseFunction]:
    """Register `func` as oracle case `name` in the suite named after its file."""

    def decorate(func: CaseFunction) -> CaseFunction:
        if not CASE_NAME_RE.match(name):
            raise OracleError(
                f"invalid oracle case name {name!r}: expected lowercase "
                "[a-z0-9._-] segments separated by '/'"
            )
        suite = Path(func.__code__.co_filename).stem
        bucket = _REGISTRY.setdefault(suite, {})
        existing = bucket.get(name)
        if existing is not None:
            raise OracleError(
                f"duplicate oracle case {name!r} in suite {suite!r}: "
                f"{existing.func.__qualname__} and {func.__qualname__}"
            )
        bucket[name] = Case(suite=suite, name=name, func=func)
        return func

    return decorate


def registered_suites() -> list[str]:
    return sorted(_REGISTRY)


def registered_cases(suite: str) -> list[Case]:
    """Cases of `suite`, ordered by name."""
    return [_REGISTRY[suite][name] for name in sorted(_REGISTRY.get(suite, {}))]


@contextmanager
def active_case(suite: str, name: str, output_root: Path) -> Iterator[CaseContext]:
    global _ACTIVE
    if _ACTIVE is not None:
        raise OracleError(f"oracle case {_ACTIVE.suite}:{_ACTIVE.name} is already running")
    context = CaseContext(suite=suite, name=name, output_root=output_root)
    _ACTIVE = context
    try:
        yield context
    finally:
        _ACTIVE = None


def require_context() -> CaseContext:
    if _ACTIVE is None:
        raise OracleError("asset helpers may only be called while a case is running")
    return _ACTIVE
