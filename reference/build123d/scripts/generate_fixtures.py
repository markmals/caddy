#!/usr/bin/env python
"""Generate — or verify — the committed build123d oracle fixtures.

    uv run python reference/build123d/scripts/generate_fixtures.py [--suite NAME] [--check]

Every case module in `reference/build123d/cases/` is imported and executed; the
results are written to `reference/build123d/fixtures/<suite>.json` together with
any BREP assets under `fixtures/<suite>/`.

Nothing is ever skipped: an import failure, a raising case, a non-serializable
value, a duplicate case name or an empty suite aborts the run with a non-zero
exit status. `--check` regenerates into a temporary directory and diffs against
the committed fixtures, so a change to the reference cannot silently rewrite the
acceptance criteria that Caddy is tested against.
"""

from __future__ import annotations

import argparse
import difflib
import importlib.util
import json
import math
import sys
import tempfile
import traceback
from pathlib import Path

REFERENCE_ROOT = Path(__file__).resolve().parents[1]
if str(REFERENCE_ROOT) not in sys.path:
    sys.path.insert(0, str(REFERENCE_ROOT))

from oracle import (  # noqa: E402
    CASES_DIR,
    FIXTURES_DIR,
    REPO_ROOT,
    OracleError,
    registered_cases,
)
from oracle.document import build_document, dumps  # noqa: E402

# Unified diffs of a drifted fixture are for orientation, not for review.
MAX_DIFF_LINES = 40


def case_modules() -> dict[str, Path]:
    """Suite name -> case module path, for every `cases/<suite>.py`."""
    if not CASES_DIR.is_dir():
        raise OracleError(f"missing case directory {_rel(CASES_DIR)}")
    modules = {
        path.stem: path
        for path in sorted(CASES_DIR.glob("*.py"))
        if not path.name.startswith("_")
    }
    if not modules:
        raise OracleError(f"no case modules found in {_rel(CASES_DIR)}")
    return modules


def import_case_module(suite: str, path: Path) -> None:
    spec = importlib.util.spec_from_file_location(f"build123d_oracle_case_{suite}", path)
    if spec is None or spec.loader is None:
        raise OracleError(f"cannot load case module {_rel(path)}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    except Exception as error:
        raise OracleError(
            f"importing {_rel(path)} raised {type(error).__name__}: {error}"
        ) from error
    if not registered_cases(suite):
        raise OracleError(f"{_rel(path)} registered no cases; every suite must have at least one")


def generate(suites: list[str], output_root: Path) -> dict[str, int]:
    """Write each suite's fixture and assets below `output_root`, pruning stale assets."""
    counts: dict[str, int] = {}
    for suite in suites:
        cases = registered_cases(suite)
        document, assets = build_document(suite, cases, output_root)
        output_root.mkdir(parents=True, exist_ok=True)
        (output_root / f"{suite}.json").write_text(dumps(document), encoding="utf-8")
        _prune_assets(output_root / suite, {asset.resolve() for asset in assets})
        counts[suite] = len(cases)
    return counts


def prune_unknown_suites(known: set[str]) -> list[str]:
    """Delete committed fixtures whose case module no longer exists."""
    removed: list[str] = []
    if not FIXTURES_DIR.is_dir():
        return removed
    for path in sorted(FIXTURES_DIR.glob("*.json")):
        if path.stem in known:
            continue
        path.unlink()
        removed.append(_rel(path))
        removed.extend(_remove_tree(FIXTURES_DIR / path.stem))
    return removed


def compare(generated_root: Path, suites: list[str]) -> list[str]:
    """Human-readable drift between freshly generated files and the committed ones."""
    drift: list[str] = []
    for suite in suites:
        for relative in _suite_files(generated_root, suite) | _suite_files(FIXTURES_DIR, suite):
            expected = generated_root / relative
            committed = FIXTURES_DIR / relative
            if not committed.exists():
                drift.append(f"missing fixture file: {_rel(committed)}")
                continue
            if not expected.exists():
                drift.append(f"stale fixture file: {_rel(committed)}")
                continue
            if _equivalent(committed, expected):
                continue
            drift.append(f"fixture drift: {_rel(committed)}")
            drift.extend(_text_diff(committed, expected))
    return drift


# OCCT's parallel booleans and fillets (build123d enables them) reorder floating-point sums, so
# regenerated values can differ in the last bits (e.g. a centre of mass of -1.89e-15 vs -2.03e-15).
# Drift below these bounds is noise, far inside every tolerance in tolerances.ts.
NOISE_REL = 1e-9
NOISE_ABS = 1e-12


def _equivalent(committed: Path, expected: Path) -> bool:
    if expected.read_bytes() == committed.read_bytes():
        return True
    if committed.suffix == ".json":
        return _same_values(json.loads(committed.read_text()), json.loads(expected.read_text()))
    if committed.suffix == ".brep":
        return _same_tokens(committed.read_text().split(), expected.read_text().split())
    return False


def _close(a: float, b: float) -> bool:
    return math.isclose(a, b, rel_tol=NOISE_REL, abs_tol=NOISE_ABS)


def _same_values(a: object, b: object) -> bool:
    if isinstance(a, bool) or isinstance(b, bool):
        return a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return _close(float(a), float(b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(_same_values(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_same_values(x, y) for x, y in zip(a, b))
    return a == b


def _same_tokens(a: list[str], b: list[str]) -> bool:
    if len(a) != len(b):
        return False
    for x, y in zip(a, b):
        if x == y:
            continue
        try:
            if not _close(float(x), float(y)):
                return False
        except ValueError:
            return False
    return True


def run(suite_filter: list[str] | None, check: bool) -> int:
    modules = case_modules()
    if suite_filter is None:
        suites = sorted(modules)
    else:
        unknown = sorted(set(suite_filter) - set(modules))
        if unknown:
            raise OracleError(
                f"unknown suite(s) {', '.join(unknown)}; available: {', '.join(sorted(modules))}"
            )
        suites = sorted(set(suite_filter))

    for suite in suites:
        import_case_module(suite, modules[suite])

    if check:
        return _run_check(suites, set(modules), suite_filter is None)

    counts = generate(suites, FIXTURES_DIR)
    if suite_filter is None:
        for name in prune_unknown_suites(set(modules)):
            print(f"removed {name}")
    for suite, total in counts.items():
        print(f"wrote reference/build123d/fixtures/{suite}.json: {total} cases")
    return 0


def _run_check(suites: list[str], known: set[str], all_suites: bool) -> int:
    with tempfile.TemporaryDirectory(prefix="caddy-oracle-") as temporary:
        generate(suites, Path(temporary))
        drift = compare(Path(temporary), suites)

    if all_suites:
        for path in sorted(FIXTURES_DIR.glob("*.json")):
            if path.stem not in known:
                drift.append(f"stale fixture file: {_rel(path)} (no cases/{path.stem}.py)")

    if drift:
        print("fixtures are out of date:", file=sys.stderr)
        for line in drift:
            print(f"  {line}", file=sys.stderr)
        print("run `pnpm oracle:generate` and commit the result", file=sys.stderr)
        return 1

    print(f"fixtures up to date: {', '.join(suites)}")
    return 0


def _suite_files(root: Path, suite: str) -> set[str]:
    files = {f"{suite}.json"} if (root / f"{suite}.json").exists() else set()
    assets = root / suite
    if assets.is_dir():
        files |= {
            str(path.relative_to(root)) for path in sorted(assets.rglob("*")) if path.is_file()
        }
    return files


def _text_diff(committed: Path, expected: Path) -> list[str]:
    if committed.suffix != ".json":
        return []
    diff = difflib.unified_diff(
        committed.read_text(encoding="utf-8").splitlines(),
        expected.read_text(encoding="utf-8").splitlines(),
        fromfile="committed",
        tofile="generated",
        lineterm="",
    )
    lines = list(diff)
    head = [f"  {line}" for line in lines[:MAX_DIFF_LINES]]
    if len(lines) > MAX_DIFF_LINES:
        head.append(f"  ... {len(lines) - MAX_DIFF_LINES} more diff lines")
    return head


def _prune_assets(directory: Path, keep: set[Path]) -> None:
    if not directory.is_dir():
        return
    for path in sorted(directory.rglob("*")):
        if path.is_file() and path.resolve() not in keep:
            path.unlink()
    if not any(directory.iterdir()):
        directory.rmdir()


def _remove_tree(directory: Path) -> list[str]:
    if not directory.is_dir():
        return []
    removed = []
    for path in sorted(directory.rglob("*"), reverse=True):
        if path.is_file():
            path.unlink()
            removed.append(_rel(path))
        else:
            path.rmdir()
    directory.rmdir()
    return removed


def _rel(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--suite",
        action="append",
        metavar="NAME",
        help="only process this suite (repeatable); defaults to every cases/*.py",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="regenerate into a temp dir and fail if the committed fixtures differ",
    )
    arguments = parser.parse_args(argv)

    try:
        return run(arguments.suite, arguments.check)
    except OracleError as error:
        print(f"error: {error}", file=sys.stderr)
        cause = error.__cause__
        if cause is not None:
            traceback.print_exception(type(cause), cause, cause.__traceback__, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
