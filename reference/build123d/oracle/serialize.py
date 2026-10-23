"""Deterministic serializers turning build123d values into JSON-safe fixtures.

Every float is emitted as a plain Python float; `json.dumps` then uses `repr`,
which round-trips the exact IEEE-754 double. No rounding happens anywhere here.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

from build123d import BoundBox, CenterOf, Location, Plane, Shape, Vector, VectorLike, export_brep

from .registry import OracleError, require_context

SLUG_RE = re.compile(r"[^a-z0-9]+")


def vec(value: VectorLike) -> list[float]:
    """`[x, y, z]` for a Vector or anything `Vector()` accepts."""
    vector = value if isinstance(value, Vector) else Vector(value)
    return [float(vector.X), float(vector.Y), float(vector.Z)]


def location(value: Location) -> dict[str, Any]:
    """Position, intrinsic XYZ orientation (degrees) and the raw 3x4 transform."""
    if value.wrapped is None:
        raise OracleError("cannot serialize a Location with no underlying TopLoc_Location")
    transformation = value.wrapped.Transformation()
    return {
        "position": vec(value.position),
        "orientation": vec(value.orientation),
        # Row-major 3x4: the rotation/scale block followed by the translation column.
        "matrix": [
            float(transformation.Value(row, column))
            for row in range(1, 4)
            for column in range(1, 5)
        ],
    }


def plane(value: Plane) -> dict[str, Any]:
    return {
        "origin": vec(value.origin),
        "x_dir": vec(value.x_dir),
        "y_dir": vec(value.y_dir),
        "z_dir": vec(value.z_dir),
    }


def shape_metrics(shape: Shape) -> dict[str, Any]:
    """Topology- and mass-level invariants of `shape`, independent of tessellation."""
    return {
        "class_name": type(shape).__name__,
        "shape_type": shape.wrapped.ShapeType().name.removeprefix("TopAbs_")
        if shape.wrapped is not None
        else None,
        "is_valid": bool(shape.is_valid),
        # `bounding_box()` already defaults to `optimal=True` in build123d 0.13.0; the
        # coarse variant is the plain `BRepBndLib::Add` box most ports implement first.
        "bounding_box": _bounds(shape.bounding_box()),
        "bounding_box_coarse": _bounds(shape.bounding_box(optimal=False)),
        "volume": float(shape.volume),
        "area": float(shape.area),
        "center_of_mass": _center_of_mass(shape),
        "counts": {
            "solids": len(shape.solids()),
            "shells": len(shape.shells()),
            "faces": len(shape.faces()),
            "wires": len(shape.wires()),
            "edges": len(shape.edges()),
            "vertices": len(shape.vertices()),
        },
        "face_geom_types": _geom_types(shape.faces()),
        "edge_geom_types": _geom_types(shape.edges()),
    }


def brep(shape: Shape) -> str:
    """Write `shape` beside the suite fixture and return its repo-relative path."""
    context = require_context()
    index = len(context.assets) + 1
    filename = f"{_slug(context.name)}-{index}.brep"
    destination = context.output_root / context.suite / filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not export_brep(shape, destination):
        raise OracleError(f"export_brep failed for case {context.suite}:{context.name}")
    context.assets.append(destination)
    return f"reference/build123d/fixtures/{context.suite}/{filename}"


def _bounds(box: BoundBox) -> dict[str, list[float]]:
    return {"min": vec(box.min), "max": vec(box.max)}


def _center_of_mass(shape: Shape) -> list[float] | None:
    """Centre of mass, or `None` for shapes whose `center()` takes no `CenterOf`."""
    try:
        return vec(shape.center(CenterOf.MASS))
    except TypeError:
        pass
    try:
        return vec(shape.center())
    except (TypeError, ValueError):
        return None


def _geom_types(shapes: list[Any]) -> dict[str, int]:
    histogram = Counter(entity.geom_type.name for entity in shapes)
    return dict(sorted(histogram.items()))


def _slug(name: str) -> str:
    return SLUG_RE.sub("-", name.lower()).strip("-")
