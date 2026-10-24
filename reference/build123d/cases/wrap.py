"""Oracle cases for conforming planar geometry to curved surfaces.

`Face.wrap` lays a flat edge, wire or face onto the surface of a face; `Face.wrap_faces` lays a
row of faces along a path on that surface; `full_round` replaces an edge of a face with the arc of
the largest empty circle that fits inside it; `Compound.extrude` sweeps a shell into solids.

Every planar input is built from explicit edges in a fixed order: `wrap` walks a wire edge by edge
and rejoins the first and last one, so the order the perimeter is given in is part of the result.
"""

from __future__ import annotations

from typing import Any

from build123d import (
    Axis,
    Compound,
    Edge,
    Face,
    GeomType,
    Location,
    Plane,
    Rectangle,
    Solid,
    Trapezoid,
    Triangle,
    Wire,
    full_round,
)

from oracle import case, location, shape_metrics, vec

# ---- shapes under test ----


def _polygon_wire(points: list[tuple[float, float]]) -> Wire:
    """A closed wire through `points`, one edge per side, in the order given."""
    return Wire(
        [
            Edge.make_line(points[i], points[(i + 1) % len(points)])
            for i in range(len(points))
        ]
    )


def _rectangle_wire(width: float, height: float, offset_x: float = 0.0) -> Wire:
    """A rectangle walked anticlockwise from its top left corner."""
    return _polygon_wire(
        [
            (offset_x - width / 2, height / 2),
            (offset_x - width / 2, -height / 2),
            (offset_x + width / 2, -height / 2),
            (offset_x + width / 2, height / 2),
        ]
    )


def _cylinder() -> Face:
    """The lateral surface of a cylinder of radius 10, seam at +X."""
    return Solid.make_cylinder(10, 20).faces().filter_by(GeomType.CYLINDER)[0]


def _cylinder_location() -> Location:
    """Half way up the cylinder, a quarter turn away from its seam."""
    return Location(Plane(origin=(0, 10, 10), x_dir=(-1, 0, 0), z_dir=(0, 1, 0)))


def _cone() -> Face:
    return Solid.make_cone(10, 5, 20).faces().filter_by(GeomType.CONE)[0]


def _cone_location() -> Location:
    cone = _cone()
    point = cone.position_at(0.25, 0.5)
    return Location(Plane(origin=point, x_dir=(0, 0, 1), z_dir=cone.normal_at(point)))


# ---- serializers ----


def _vertices(value: Edge | Wire | Face | Any) -> list[list[float]]:
    """
    Vertices in a tolerance-stable order: symmetric corners can differ by an ulp in one
    coordinate, which an exact sort would let decide the whole ordering.
    """
    return sorted(
        (vec(vertex) for vertex in value.vertices()),
        key=lambda point: [round(coordinate, 9) for coordinate in point],
    )


def curve(value: Edge | Wire) -> dict[str, Any]:
    """Metrics plus the length and the sorted vertices that fix a wrapped curve."""
    return {
        "shape": shape_metrics(value),
        "length": float(value.length),
        "edge_lengths": sorted(float(edge.length) for edge in value.edges()),
        "vertices": _vertices(value),
    }


def edge_samples(value: Edge) -> dict[str, Any]:
    """A single wrapped edge, sampled along its length."""
    return curve(value) | {"samples": [vec(value.position_at(i / 8)) for i in range(9)]}


def surface(value: Face) -> dict[str, Any]:
    """Metrics plus the area, normal and boundary of a wrapped face."""
    return {
        "shape": shape_metrics(value),
        "area": float(value.area),
        "normal": vec(value.normal_at()),
        "edge_lengths": sorted(float(edge.length) for edge in value.edges()),
        "vertices": _vertices(value),
    }


# ---------------------------------------------------------------------------
# Face.wrap
# ---------------------------------------------------------------------------


@case("wrap/surface-location")
def wrap_surface_location():
    """The frames the wrapped shapes start from, so a divergence there is reported there."""
    return {
        "cylinder": location(_cylinder_location()),
        "cone": location(_cone_location()),
        "cone_normal": vec(_cone().normal_at(_cone().position_at(0.25, 0.5))),
    }


@case("wrap/edge-line")
def wrap_edge_line():
    return edge_samples(_cylinder().wrap(Edge.make_line((0, 0), (5, 0)), _cylinder_location()))


@case("wrap/edge-arc")
def wrap_edge_arc():
    arc = Edge.make_three_point_arc((0, 0), (2, 1), (4, 0))
    return edge_samples(_cylinder().wrap(arc, _cylinder_location())) | {
        "planar_length": float(arc.length)
    }


@case("wrap/edge-offset-start")
def wrap_edge_offset_start():
    """An edge that does not start at the origin is reached by a wrapped construction line."""
    return edge_samples(
        _cylinder().wrap(Edge.make_line((2, 1), (5, 1)), _cylinder_location())
    )


@case("wrap/wire-open")
def wrap_wire_open():
    open_wire = Wire([Edge.make_line((0, 0), (4, 0)), Edge.make_line((4, 0), (4, 3))])
    return curve(_cylinder().wrap(open_wire, _cylinder_location()))


@case("wrap/wire-closed")
def wrap_wire_closed():
    return curve(_cylinder().wrap(_rectangle_wire(6, 4), _cylinder_location()))


@case("wrap/face")
def wrap_face():
    return surface(_cylinder().wrap(Face(_rectangle_wire(6, 4)), _cylinder_location()))


@case("wrap/face-with-hole")
def wrap_face_with_hole():
    holed = Face(_rectangle_wire(6, 4), [_rectangle_wire(2, 1)])
    return surface(_cylinder().wrap(holed, _cylinder_location()))


@case("wrap/face-on-cone")
def wrap_face_on_cone():
    return surface(_cone().wrap(Face(_rectangle_wire(4, 3)), _cone_location()))


@case("wrap/faces-along-path")
def wrap_faces_along_path():
    path = Edge.make_circle(10, Plane(origin=(0, 0, 10)))
    faces = [Face(_rectangle_wire(3, 2)), Face(_rectangle_wire(3, 2, offset_x=6))]
    wrapped = _cylinder().wrap_faces(faces, path, start=0.1)
    return {
        "count": len(wrapped),
        "faces": [surface(face) for face in wrapped],
        "path_length": float(path.length),
    }


# ---------------------------------------------------------------------------
# Compound.extrude
# ---------------------------------------------------------------------------


@case("compound/extrude-shell")
def compound_extrude_shell():
    shell = Solid.make_box(2, 3, 1).shells()[0]
    extruded = Compound.extrude(shell, (0, 0, 4))
    return {
        "shape": shape_metrics(extruded),
        "volume": float(extruded.volume),
        "solid_volumes": sorted(float(solid.volume) for solid in extruded.solids()),
    }


# ---------------------------------------------------------------------------
# full_round
# ---------------------------------------------------------------------------


def rounded(value: Any) -> dict[str, Any]:
    """Metrics plus the area, vertices and edge lengths of a rounded sketch."""
    return {
        "shape": shape_metrics(value),
        "area": float(value.area),
        "normal": vec(value.faces()[0].normal_at()),
        "vertices": _vertices(value),
        "edge_lengths": sorted(float(edge.length) for edge in value.edges()),
    }


def _trapezoid() -> Face:
    return Trapezoid(0.5, 1, 90 - 8).face()


@case("full-round/trapezoid")
def full_round_trapezoid():
    trapezoid = _trapezoid()
    return rounded(full_round(trapezoid.edges().sort_by(Axis.Y)[-1]))


@case("full-round/trapezoid-inverted")
def full_round_trapezoid_inverted():
    trapezoid = _trapezoid()
    return rounded(full_round(trapezoid.edges().sort_by(Axis.Y)[-1], invert=True))


@case("full-round/trapezoid-coarse")
def full_round_trapezoid_coarse():
    """Fewer samples move the Voronoi candidates, and with them the arc.

    The quadrilateral is lopsided on purpose: in a symmetric one the fortieth sample leaves two
    mirrored candidates equally far from the three edges, and which of the two is kept comes down
    to the order Qhull happens to report its facets in.
    """
    lopsided = Face(_polygon_wire([(-1, -0.5), (1, -0.5), (0.4, 0.5), (-0.15, 0.5)]))
    return rounded(
        full_round(lopsided.edges().sort_by(Axis.Y)[-1], voronoi_point_count=40)
    )


@case("full-round/rectangle")
def full_round_rectangle():
    rectangle = Rectangle(34, 10).face()
    return rounded(full_round((rectangle.edges() << Axis.X)[0]))


@case("full-round/rectangle-inverted")
def full_round_rectangle_inverted():
    rectangle = Rectangle(34, 10).face()
    return rounded(full_round((rectangle.edges() << Axis.X)[0], invert=True))


@case("full-round/triangle")
def full_round_triangle():
    """A scalene triangle: an equilateral one ties three candidates for the best two slots."""
    triangle = Face(_polygon_wire([(0, 0), (10, 0), (3, 6)]))
    return rounded(full_round(triangle.edges().sort_by(Axis.X)[0]))


@case("full-round/flipped-face")
def full_round_flipped_face():
    """The rounded face keeps the normal of the face the edge was selected from."""
    flipped = -Face.make_rect(34, 10)
    return rounded(full_round((flipped.edges() << Axis.X)[0]))
