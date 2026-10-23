#!/usr/bin/env python
"""Enumerate the public API surface of the pinned build123d oracle.

Writes a deterministic JSON inventory of ``build123d.__all__`` -- every exported
symbol with its kind, defining module, base classes, enum members and (for
classes) the public members defined directly on that class.

Usage::

    .venv/bin/python reference/build123d/scripts/inventory.py

Re-running on an unchanged environment MUST reproduce the file byte for byte:
nothing time-, path- or hash-dependent is recorded.
"""

from __future__ import annotations

import enum
import functools
import importlib
import importlib.metadata as metadata
import inspect
import json
import pkgutil
import re
import sys
import types
import typing
from pathlib import Path
from typing import Any

import build123d

# OCCT release that `cadquery-ocp-novtk` 8.0.1.1.0 wraps. The OCP wheel does not
# expose the upstream OCCT version at runtime (no `Standard_Version` binding),
# so the mapping is recorded here and must be updated alongside the pin.
OCCT_VERSION = "8.0.1"
OCP_DISTRIBUTION = "cadquery-ocp-novtk"

REPO_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_PATH = REPO_ROOT / "reference" / "build123d" / "inventory" / "symbols.json"

# Abstract bases that `__all__` never exports but whose members make up most of
# the inherited API of the exported topology classes.
CORE_INTERNALS = (
    "build123d.topology.shape_core:Shape",
    "build123d.topology.one_d:Mixin1D",
    "build123d.topology.two_d:Mixin2D",
    "build123d.topology.three_d:Mixin3D",
)

# Dunders that carry user-visible algebraic/semantic meaning in build123d and
# therefore belong in the inventory; every other `_`-prefixed name is dropped.
OPERATOR_DUNDERS = frozenset(
    """
    __add__ __sub__ __and__ __mul__ __matmul__ __mod__ __xor__ __neg__ __abs__
    __eq__ __iter__ __getitem__ __len__ __contains__ __enter__ __exit__
    __call__ __rshift__ __lshift__ __truediv__ __or__
    """.split()
)

ASSIGNMENT_RE_CACHE: dict[str, re.Pattern[str]] = {}


def _is_public(name: str) -> bool:
    return not name.startswith("_") or name in OPERATOR_DUNDERS


def _signature_of(obj: Any) -> str | None:
    try:
        return str(inspect.signature(obj))
    except (TypeError, ValueError):
        return None


def _summary_of(obj: Any) -> str | None:
    doc = inspect.getdoc(obj)
    if not doc:
        return None
    for line in doc.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return None


def _qualified(cls: type) -> str:
    module = getattr(cls, "__module__", None)
    qualname = getattr(cls, "__qualname__", getattr(cls, "__name__", repr(cls)))
    return f"{module}.{qualname}" if module else qualname


def _submodules() -> list[types.ModuleType]:
    """Every importable `build123d.*` module, sorted by dotted name."""
    modules: list[types.ModuleType] = []
    for info in pkgutil.walk_packages(build123d.__path__, prefix="build123d."):
        if "._dev" in info.name or info.name.endswith("._dev"):
            continue
        try:
            modules.append(importlib.import_module(info.name))
        except Exception:  # pragma: no cover - optional/broken extras
            continue
    modules.sort(key=lambda m: m.__name__)
    return modules


def _assignment_re(name: str) -> re.Pattern[str]:
    pattern = ASSIGNMENT_RE_CACHE.get(name)
    if pattern is None:
        pattern = re.compile(rf"^{re.escape(name)}\s*(?::[^=]+)?=", re.MULTILINE)
        ASSIGNMENT_RE_CACHE[name] = pattern
    return pattern


def _defining_module(name: str, obj: Any, modules: list[types.ModuleType]) -> str | None:
    """Module that owns `name`.

    Classes and functions carry `__module__`; constants and PEP 604 type aliases
    do not, so their home is located by finding the sorted-first `build123d.*`
    module whose source contains a top-level assignment to `name`.
    """
    declared = getattr(obj, "__module__", None)
    if isinstance(declared, str) and declared.startswith("build123d"):
        return declared

    fallback: str | None = None
    for module in modules:
        if name not in vars(module):
            continue
        if vars(module)[name] is not obj:
            continue
        fallback = fallback or module.__name__
        try:
            source = inspect.getsource(module)
        except (OSError, TypeError):  # pragma: no cover - namespace packages
            continue
        if _assignment_re(name).search(source):
            return module.__name__
    return fallback


def _kind_of(obj: Any) -> str:
    if isinstance(obj, type):
        if issubclass(obj, enum.Enum):
            return "enum"
        return "class"
    if inspect.isfunction(obj) or inspect.isbuiltin(obj) or inspect.ismethod(obj):
        return "function"
    if isinstance(obj, (types.UnionType, typing.TypeVar)) or typing.get_origin(obj) is not None:
        return "type alias"
    if getattr(obj, "__class__", None) is typing.NewType:
        return "type alias"
    if callable(obj) and not isinstance(obj, (int, float, str, bytes, tuple, list, dict, set)):
        return "function"
    return "constant"


def _member_kind(raw: Any) -> str | None:
    if isinstance(raw, property):
        return "property"
    if isinstance(raw, functools.cached_property):
        return "property"
    if isinstance(raw, classmethod):
        return "classmethod"
    if isinstance(raw, staticmethod):
        return "staticmethod"
    if isinstance(raw, (types.FunctionType, types.BuiltinFunctionType)):
        return "method"
    if isinstance(raw, functools.singledispatchmethod):
        return "method"
    return None


def _member_target(raw: Any) -> Any:
    if isinstance(raw, property):
        return raw.fget
    if isinstance(raw, functools.cached_property):
        return raw.func
    if isinstance(raw, (classmethod, staticmethod, functools.singledispatchmethod)):
        return raw.__func__
    return raw


def _class_members(cls: type) -> list[dict[str, Any]]:
    """Public members defined on `cls` itself (inherited members are excluded)."""
    members: list[dict[str, Any]] = []
    for name, raw in vars(cls).items():
        if not _is_public(name):
            continue
        kind = _member_kind(raw)
        if kind is None:
            continue
        target = _member_target(raw)
        members.append(
            {
                "name": name,
                "kind": kind,
                "signature": _signature_of(target) if target is not None else None,
                "doc": _summary_of(target) if target is not None else None,
                "abstract": bool(getattr(target, "__isabstractmethod__", False)),
            }
        )
    members.sort(key=lambda m: (m["name"], m["kind"]))
    return members


def _inherited_member_names(cls: type) -> list[str]:
    """Public member names reachable on `cls` but defined by a base class."""
    own = set(vars(cls))
    names = set()
    for base in cls.__mro__[1:]:
        if base is object:
            continue
        for name, raw in vars(base).items():
            if name in own or not _is_public(name):
                continue
            if _member_kind(raw) is None:
                continue
            names.add(name)
    return sorted(names)


def describe(name: str, obj: Any, modules: list[types.ModuleType]) -> dict[str, Any]:
    kind = _kind_of(obj)
    entry: dict[str, Any] = {
        "name": name,
        "kind": kind,
        "module": _defining_module(name, obj, modules),
        "doc": _summary_of(obj),
    }

    if kind in ("class", "enum"):
        cls = typing.cast(type, obj)
        entry["bases"] = [_qualified(base) for base in cls.__bases__ if base is not object]
        entry["mro"] = [_qualified(base) for base in cls.__mro__[1:] if base is not object]
        entry["abstract"] = bool(getattr(cls, "__abstractmethods__", frozenset()))
        if kind == "enum":
            entry["enum_members"] = [member.name for member in cls]  # declaration order
            entry["enum_values"] = {
                member.name: member.value
                for member in cls
                if isinstance(member.value, (int, float, str, bool))
            }
        else:
            entry["signature"] = _signature_of(cls)
        entry["members"] = _class_members(cls)
        entry["inherited_members"] = _inherited_member_names(cls)
    elif kind == "function":
        entry["signature"] = _signature_of(obj)
    elif kind == "type alias":
        entry["definition"] = str(obj)
    else:
        entry["value_type"] = type(obj).__name__
        entry["value"] = obj if isinstance(obj, (int, float, str, bool)) else repr(obj)

    return entry


def main() -> int:
    modules = _submodules()
    exported = sorted(build123d.__all__)

    symbols: dict[str, dict[str, Any]] = {}
    for name in exported:
        if not hasattr(build123d, name):
            raise SystemExit(f"build123d.__all__ advertises missing symbol: {name}")
        symbols[name] = describe(name, getattr(build123d, name), modules)

    non_exported: dict[str, dict[str, Any]] = {}
    for target in CORE_INTERNALS:
        module_name, _, attr = target.partition(":")
        cls = getattr(importlib.import_module(module_name), attr)
        non_exported[attr] = describe(attr, cls, modules)

    counts: dict[str, int] = {}
    for entry in symbols.values():
        counts[entry["kind"]] = counts.get(entry["kind"], 0) + 1

    document = {
        "header": {
            "generator": "reference/build123d/scripts/inventory.py",
            "build123d": metadata.version("build123d"),
            "occt": OCCT_VERSION,
            "ocp": {
                "distribution": OCP_DISTRIBUTION,
                "version": metadata.version(OCP_DISTRIBUTION),
            },
            "python": ".".join(str(part) for part in sys.version_info[:3]),
            "operator_dunders": sorted(OPERATOR_DUNDERS),
            "symbol_count": len(symbols),
            "kind_counts": dict(sorted(counts.items())),
            "non_exported_count": len(non_exported),
        },
        "__all__": exported,
        "symbols": symbols,
        "non_exported": non_exported,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(document, indent=2, sort_keys=True, ensure_ascii=False, default=repr)
    OUTPUT_PATH.write_text(text + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT_PATH.relative_to(REPO_ROOT)}: {len(symbols)} symbols {counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
