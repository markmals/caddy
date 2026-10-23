"""Harness self-test suite: exercises every oracle serializer and JSON shape.

These cases exist so the oracle machinery (registration, serialization, asset
writing, `--check` diffing, the TypeScript loader and its accessors) is covered
without depending on any Caddy API. Real coverage of build123d semantics lives
in the other suites.
"""

from __future__ import annotations

from typing import Any

from build123d import Box, Location, Plane, Vector, Vertex, Wire

from oracle import brep, case, location, plane, shape_metrics, vec


@case("serializer/vector")
def serializer_vector() -> dict[str, Any]:
    return {
        "from_vector": vec(Vector(1, 2, 3)),
        "from_tuple": vec((-0.5, 0.25, 1e-9)),
        "sum": vec(Vector(1, 2, 3) + Vector(4, 5, 6)),
        "length": Vector(1, 2, 3).length,
    }


@case("serializer/location")
def serializer_location() -> dict[str, Any]:
    return {"location": location(Location((1, 2, 3), (10, 20, 30)))}


@case("serializer/plane")
def serializer_plane() -> dict[str, Any]:
    return {"plane": plane(Plane.XY.offset(2).rotated((0, 0, 45)))}


@case("metrics/box")
def metrics_box() -> dict[str, Any]:
    return {"metrics": shape_metrics(Box(2, 3, 4))}


@case("metrics/wire")
def metrics_wire() -> dict[str, Any]:
    """A massless shape: zero volume/area, curved edge, no solids."""
    return {"metrics": shape_metrics(Wire.make_circle(2))}


@case("metrics/vertex")
def metrics_vertex() -> dict[str, Any]:
    """`Vertex.center()` takes no `CenterOf`, covering the fallback path."""
    return {"metrics": shape_metrics(Vertex(1, 2, 3))}


@case("assets/brep")
def assets_brep() -> dict[str, Any]:
    return {"brep": brep(Box(1, 1, 1))}


@case("scalars/mixed")
def scalars_mixed() -> dict[str, Any]:
    """Every JSON shape the TypeScript accessors have to validate."""
    return {
        "integer": 42,
        "float": 1 / 3,
        "negative_zero": -0.0,
        "true": True,
        "false": False,
        "string": "plane",
        "null": None,
        "numbers": [1.0, 2.5, -3.0],
        "matrix": [[1.0, 0.0, 0.0, 4.0], [0.0, 1.0, 0.0, 5.0], [0.0, 0.0, 1.0, 6.0]],
        "nested": {"origin": vec(Vector(0, 0, 1)), "label": "nested"},
    }
