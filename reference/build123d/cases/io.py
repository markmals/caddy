"""Oracle cases for file import and export.

Each case ships the input geometry as a BREP asset, round trips it through
build123d's exporter and importer, and records what survived: mass properties,
topology counts, and (for STEP) the product name and colour. The Caddy side
reads the same BREP, performs the same round trip through its own `exportCAD` /
`importCAD`, and has to land on the same numbers.
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from build123d import (
    Box,
    Color,
    Cylinder,
    Part,
    Pos,
    export_brep,
    export_step,
    export_stl,
    import_brep,
    import_step,
    import_stl,
)

from oracle import brep, case, shape_metrics, vec

STL_TOLERANCE = 1e-3
STL_ANGULAR_TOLERANCE = 0.1


def sample_part() -> Part:
    """A labelled, coloured solid with a curved face, so STEP has something to lose."""
    part = Box(12, 8, 5) - Pos(0, 0, 0) * Cylinder(2, 10)
    part.label = "bracket"
    part.color = Color(0.25, 0.5, 0.75, 1.0)
    return part


def color_tuple(shape: Any) -> list[float] | None:
    """build123d's `Color` iterates as sRGB channels; `to_tuple` was dropped in 0.13."""
    return None if shape.color is None else [float(channel) for channel in tuple(shape.color)]


@case("step/round-trip")
def step_round_trip() -> dict[str, Any]:
    """`export_step` then `import_step`: geometry, product name and colour."""
    part = sample_part()
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "part.step"
        export_step(part, path)
        imported = import_step(path)
    return {
        "source": brep(part),
        "label": part.label,
        "color": color_tuple(part),
        "imported_label": imported.label,
        "imported_color": color_tuple(imported),
        "shape": shape_metrics(imported),
    }


@case("step/unnamed-solid")
def step_unnamed_solid() -> dict[str, Any]:
    """A solid with no label or colour still round trips its geometry exactly."""
    part = Part() + Box(3, 4, 5)
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "plain.step"
        export_step(part, path)
        imported = import_step(path)
    return {
        "source": brep(part),
        "imported_color": color_tuple(imported),
        "shape": shape_metrics(imported),
    }


@case("brep/round-trip")
def brep_round_trip() -> dict[str, Any]:
    """BREP is lossless, so the imported shape matches the original bit for bit."""
    part = sample_part()
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "part.brep"
        export_brep(part, path)
        imported = import_brep(path)
    return {"source": brep(part), "shape": shape_metrics(imported)}


@case("stl/round-trip")
def stl_round_trip() -> dict[str, Any]:
    """`export_stl` then `import_stl`: one triangulated Face, so only area and bounds survive."""
    part = sample_part()
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "part.stl"
        export_stl(part, path, tolerance=STL_TOLERANCE, angular_tolerance=STL_ANGULAR_TOLERANCE)
        imported = import_stl(path)
    bounds = imported.bounding_box()
    return {
        "source": brep(part),
        "tolerance": STL_TOLERANCE,
        "angular_tolerance": STL_ANGULAR_TOLERANCE,
        "class_name": type(imported).__name__,
        "area": float(imported.area),
        "bounding_box": {"min": vec(bounds.min), "max": vec(bounds.max)},
    }


@case("tessellate/box")
def tessellate_box() -> dict[str, Any]:
    """`Shape.tessellate` vertex and triangle counts for a shape with exact flat faces."""
    part = Box(2, 3, 4)
    vertices, triangles = part.tessellate(STL_TOLERANCE, STL_ANGULAR_TOLERANCE)
    return {
        "source": brep(part),
        "tolerance": STL_TOLERANCE,
        "angular_tolerance": STL_ANGULAR_TOLERANCE,
        "vertex_count": len(vertices),
        "triangle_count": len(triangles),
        "bounding_box": {
            "min": [min(v.X for v in vertices), min(v.Y for v in vertices), min(v.Z for v in vertices)],
            "max": [max(v.X for v in vertices), max(v.Y for v in vertices), max(v.Z for v in vertices)],
        },
    }
