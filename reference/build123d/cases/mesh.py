"""Oracle cases for `Shape.mesh` and `Shape.tessellate`.

A triangulation is only as stable as the mesher that produced it, so the cases record what the
triangle soup *means*: how many vertices and triangles it has, the box it spans, the area of
its triangles and the volume its winding encloses. The box case is small enough to record in
full, which pins the vertex order and the winding exactly.
"""

from __future__ import annotations

from typing import Any

from build123d import Box, Cylinder, Sphere
from build123d.geometry import Vector

from oracle import brep, case, vec

TOLERANCE = 1e-3
ANGULAR_TOLERANCE = 0.1

Triangles = list[tuple[int, int, int]]


def soup_area(vertices: list[Vector], triangles: Triangles) -> float:
    """Total area of the triangles, which approaches the shape's area as the mesh refines."""
    total = 0.0
    for first, second, third in triangles:
        edge1 = vertices[second] - vertices[first]
        edge2 = vertices[third] - vertices[first]
        total += edge1.cross(edge2).length / 2
    return total


def soup_volume(vertices: list[Vector], triangles: Triangles) -> float:
    """Signed volume of the closed soup; it is positive only when every triangle faces out."""
    total = 0.0
    for first, second, third in triangles:
        total += vertices[first].dot(vertices[second].cross(vertices[third]))
    return total / 6


def soup_metrics(vertices: list[Vector], triangles: Triangles) -> dict[str, Any]:
    return {
        "vertex_count": len(vertices),
        "triangle_count": len(triangles),
        "bounding_box": {
            "min": [min(v.X for v in vertices), min(v.Y for v in vertices), min(v.Z for v in vertices)],
            "max": [max(v.X for v in vertices), max(v.Y for v in vertices), max(v.Z for v in vertices)],
        },
        "area": soup_area(vertices, triangles),
        "volume": soup_volume(vertices, triangles),
    }


@case("tessellate/box")
def tessellate_box() -> dict[str, Any]:
    """Every vertex and triangle of a box, in the order `tessellate` produces them."""
    part = Box(2, 3, 4)
    vertices, triangles = part.tessellate(TOLERANCE, ANGULAR_TOLERANCE)
    return {
        "source": brep(part),
        "tolerance": TOLERANCE,
        "angular_tolerance": ANGULAR_TOLERANCE,
        "vertices": [vec(vertex) for vertex in vertices],
        "triangles": [list(triangle) for triangle in triangles],
        "metrics": soup_metrics(vertices, triangles),
    }


@case("tessellate/curved")
def tessellate_curved() -> dict[str, Any]:
    """A cylinder and a sphere: curved faces, so the deflection decides how many triangles."""
    cylinder = Cylinder(2, 5)
    sphere = Sphere(3)
    return {
        "cylinder": soup_metrics(*cylinder.tessellate(TOLERANCE, ANGULAR_TOLERANCE)),
        "cylinder_area": float(cylinder.area),
        "cylinder_volume": float(cylinder.volume),
        "sphere": soup_metrics(*sphere.tessellate(TOLERANCE, ANGULAR_TOLERANCE)),
    }


@case("tessellate/angular-tolerance")
def tessellate_angular_tolerance() -> dict[str, Any]:
    """A coarser angular tolerance means fewer segments around the same cylinder.

    Each tolerance gets its own cylinder: build123d leaves a triangulation on the shape it
    meshed, so reusing one here would answer the second call from the first call's mesh.
    """
    return {
        "fine": soup_metrics(*Cylinder(2, 5).tessellate(TOLERANCE, 0.1)),
        "coarse": soup_metrics(*Cylinder(2, 5).tessellate(TOLERANCE, 0.8)),
    }


@case("tessellate/reversed-faces")
def tessellate_reversed_faces() -> dict[str, Any]:
    """A cut solid has reversed faces; their triangles are wound back the other way."""
    part = Box(6, 6, 2) - Cylinder(2, 4)
    vertices, triangles = part.tessellate(TOLERANCE, ANGULAR_TOLERANCE)
    return {
        "source": brep(part),
        "metrics": soup_metrics(vertices, triangles),
        "volume": float(part.volume),
    }


@case("mesh/reuses-triangulation")
def mesh_reuses_triangulation() -> dict[str, Any]:
    """`mesh` leaves a triangulation behind, and a coarser request keeps it."""
    meshed = Cylinder(2, 5)
    meshed.mesh(1e-5, ANGULAR_TOLERANCE)
    fresh = Cylinder(2, 5)
    return {
        "fine": soup_metrics(*meshed.tessellate(1e-5, ANGULAR_TOLERANCE)),
        "reused": soup_metrics(*meshed.tessellate(1e-1, ANGULAR_TOLERANCE)),
        "fresh": soup_metrics(*fresh.tessellate(1e-1, ANGULAR_TOLERANCE)),
    }


@case("mesh/keeps-geometry")
def mesh_keeps_geometry() -> dict[str, Any]:
    """Meshing changes nothing about the shape itself."""
    part = Box(2, 3, 4) - Cylinder(0.5, 5)
    part.mesh(TOLERANCE, ANGULAR_TOLERANCE)
    bounds = part.bounding_box()
    return {
        "volume": float(part.volume),
        "area": float(part.area),
        "faces": len(part.faces()),
        "bounding_box": {"min": vec(bounds.min), "max": vec(bounds.max)},
    }
