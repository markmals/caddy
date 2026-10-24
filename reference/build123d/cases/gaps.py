"""Oracle cases for the members Caddy was missing: the radius, length and width of a face, the
normal and radius of a line, closing an edge or a wire, `Plane.__mul__` and `trim_to_other`.

`Face.radius` reads the surface a face sits on *without* peeling a
`Geom_RectangularTrimmedSurface` off it, so an offset solid - whose rounded edges are trimmed
cylinders - reports no radius for them at all while its spherical corners still do.
`Mixin1D.normal` is the normal of the plane `BRepLib_FindSurface` fits to the curve, which is not
the plane `common_plane` finds: for the same planar polyline the two face opposite ways.

The last case pins the order build123d's `Rectangle`, `RectangleRounded` and `Polygon` leave their
edges and vertices in, which is the order every selector downstream of them inherits.
"""

from __future__ import annotations

from typing import Any

from build123d import (
    Axis,
    Box,
    Cylinder,
    Edge,
    Face,
    GeomType,
    Location,
    Plane,
    Polygon,
    Rectangle,
    RectangleRounded,
    Shape,
    Sphere,
    Torus,
    Wire,
    offset,
)

from oracle import case, location, shape_metrics, vec


def ends(shape: Shape) -> dict[str, list[list[float]]]:
    """Where each edge of `shape` starts and ends, in wire order."""
    edges = shape.edges()
    return {
        "starts": [vec(edge.start_point()) for edge in edges],
        "ends": [vec(edge.end_point()) for edge in edges],
    }


def corners(shape: Shape) -> list[list[float]]:
    """The positions of a shape's vertices, in the order the explorer reports them."""
    return [vec((vertex.X, vertex.Y, vertex.Z)) for vertex in shape.vertices()]


def extents(face: Face) -> dict[str, Any]:
    """How far a face reaches along each axis of its own plane, or nothing when it curves."""
    return {"length": face.length, "width": face.width}


def outline(sketch: Any) -> dict[str, Any]:
    """The edge and vertex order of a sketch outline: geometry types, ends and corners."""
    wire = sketch.wire()
    return {
        "edge_geom_types": [edge.geom_type.name for edge in wire.edges()],
        **ends(wire),
        "wire_vertices": corners(wire),
        "face_vertices": corners(sketch.face()),
    }


def closed(shape: Shape) -> dict[str, Any]:
    """What `close()` answered: its class, whether it closes, and the edges it is made of."""
    return {
        "class_name": type(shape).__name__,
        "is_closed": shape.is_closed,
        "edge_count": len(shape.edges()),
        "length": shape.length,
        "edge_geom_types": [edge.geom_type.name for edge in shape.edges()],
        **ends(shape),
    }


def polyline() -> Wire:
    """An open right-angled polyline, as a wire of two straight edges."""
    return Wire([Edge.make_line((0, 0), (4, 0)), Edge.make_line((4, 0), (4, 3))])


def zigzag() -> Wire:
    """A V crossing the X axis twice, at x = 2.5 and x = 3.5."""
    return Wire(
        [Edge.make_line((2, -1, 0), (3, 1, 0)), Edge.make_line((3, 1, 0), (4, -1, 0))]
    )


def trimmed(edge: Edge, other: Any) -> dict[str, Any] | None:
    """The piece `trim_to_other` kept, or `None` when the two never meet."""
    piece = edge.trim_to_other(other)
    return None if piece is None else {"length": piece.length, **ends(piece)}


@case("face/radius")
def face_radius() -> dict[str, Any]:
    """Only a cylinder and a sphere have a radius; a torus reports two, a plane none."""
    torus_wall = Torus(10, 2).faces().filter_by(GeomType.TORUS)[0]
    return {
        "cylinder": Cylinder(1.5, 2).faces().filter_by(GeomType.CYLINDER)[0].radius,
        "sphere": Sphere(3).faces().filter_by(GeomType.SPHERE)[0].radius,
        "torus": torus_wall.radius,
        "torus_radii": list(torus_wall.radii),
        "plane": Box(1, 1, 1).faces()[0].radius,
    }


@case("face/radius-of-a-trimmed-surface")
def face_radius_of_a_trimmed_surface() -> dict[str, Any]:
    """An offset box rounds its edges on trimmed cylinders, which report no radius."""
    grown = offset(Box(10, 10, 10), 1)
    cylinders = grown.faces().filter_by(GeomType.CYLINDER)
    spheres = grown.faces().filter_by(GeomType.SPHERE)
    return {
        "cylinder_count": len(cylinders),
        "cylinder_radii": [face.radius for face in cylinders],
        "sphere_count": len(spheres),
        "sphere_radii": sorted(face.radius for face in spheres),
    }


@case("face/length-and-width")
def face_length_and_width() -> dict[str, Any]:
    """Length and width are a planar face's extents in its own plane; a wall has neither."""
    box = Box(3, 5, 7)
    top = box.faces().sort_by(Axis.Z)[-1]
    side = box.faces().sort_by(Axis.Y)[0]
    triangle = Polygon((0, 0), (4, 0), (4, 3)).face()
    wall = Cylinder(2, 5).faces().filter_by(GeomType.CYLINDER)[0]
    rect = Face.make_rect(8, 10, Plane.XZ)
    return {
        "rect_xz": extents(rect),
        "box_top": extents(top),
        "box_side": extents(side),
        "triangle": extents(triangle),
        "cylinder_wall": extents(wall),
    }


@case("line/normal")
def line_normal() -> dict[str, Any]:
    """A conic answers with its axis, anything else with the plane OCCT fits to it."""
    tilted = Plane(origin=(1, 2, 3), z_dir=(1, 1, 1)) * polyline().close()
    return {
        "circle_xy": vec(Edge.make_circle(2).normal()),
        "circle_xz": vec(Edge.make_circle(2, Plane.XZ).normal()),
        "ellipse_yz": vec(Edge.make_ellipse(3, 1, Plane.YZ).normal()),
        "arc": vec(Edge.make_circle(2, start_angle=0, end_angle=120).normal()),
        "polyline": vec(polyline().normal()),
        "polyline_common_plane_z_dir": vec(polyline().common_plane().z_dir),
        "closed_polyline": vec(polyline().close().normal()),
        "tilted_polyline": vec(tilted.normal()),
    }


@case("line/normal-errors")
def line_normal_errors() -> dict[str, Any]:
    """A curve that lies in no plane has no normal."""
    results: dict[str, Any] = {}
    try:
        Edge.make_line((0, 0, 0), (1, 1, 1)).normal()
    except ValueError:
        results["line_raises"] = True
    try:
        Edge.make_helix(1, 4, 1).normal()
    except ValueError:
        results["helix_raises"] = True
    return results


@case("line/radius")
def line_radius() -> dict[str, Any]:
    """An edge answers with its own circle, a wire with its first edge's."""
    results: dict[str, Any] = {
        "circle_edge": Edge.make_circle(2.5).radius,
        "arc_edge": Edge.make_circle(2.5, start_angle=20, end_angle=140).radius,
        "circle_wire": Wire.make_circle(2.5).radius,
    }
    try:
        Edge.make_line((0, 0, 0), (1, 0, 0)).radius
    except ValueError:
        results["line_raises"] = True
    try:
        polyline().radius
    except ValueError:
        results["polyline_raises"] = True
    return results


@case("line/close")
def line_close() -> dict[str, Any]:
    """An open line closes into a wire; one that already closes answers with itself."""
    arc = Edge.make_circle(2, start_angle=0, end_angle=180)
    circle = Edge.make_circle(2)
    open_wire = polyline()
    closed_wire = Wire.make_circle(2)
    return {
        "open_edge": closed(arc.close()),
        "closed_edge": closed(circle.close()),
        "closed_edge_is_self": circle.close() is circle,
        "open_wire": closed(open_wire.close()),
        "closed_wire": closed(closed_wire.close()),
        "closed_wire_is_self": closed_wire.close() is closed_wire,
    }


@case("plane/transform")
def plane_transform() -> dict[str, Any]:
    """`plane * other`: a composed location for a location or a plane, a moved copy for a shape."""
    source = Plane(origin=(1, 2, 3), x_dir=(0, 1, 0), z_dir=(1, 0, 0))
    by_list = source * [Location((1, 0, 0)), Plane.XZ]
    return {
        "by_location": location(source * Location((1, 0, 0), (0, 0, 45))),
        "by_plane": location(source * Plane.YZ),
        "by_list_count": len(by_list),
        "by_list_location": location(by_list[0]),
        "by_list_plane": location(by_list[1]),
        "by_shape": shape_metrics(source * Box(1, 2, 3)),
        "by_shape_center": vec((source * Box(1, 2, 3)).center()),
    }


@case("edge/trim-to-other")
def edge_trim_to_other() -> dict[str, Any]:
    """The shortest piece reaching a shape, an axis, a plane, a location or a bare point."""
    base = Edge.make_line((0, 0, 0), (10, 0, 0))
    return {
        "shape": trimmed(base, Edge.make_line((4, -2, 0), (4, 2, 0))),
        "axis": trimmed(base, Axis((3, -1, 0), (0, 1, 0))),
        "plane": trimmed(base, Plane.YZ.offset(6)),
        "location": trimmed(base, Location((5, 0, 0))),
        "point": trimmed(base, (2, 0, 0)),
        "two_crossings": trimmed(base, zigzag()),
        "missed_point": trimmed(base, (2, 5, 0)),
        "missed_plane": trimmed(base, Plane.YZ.offset(60)),
    }


@case("sketch/outline-order")
def sketch_outline_order() -> dict[str, Any]:
    """A rectangle runs anticlockwise from its top left corner, as its rounded form does."""
    return {
        "rectangle": outline(Rectangle(6, 4)),
        "rectangle_rounded": outline(RectangleRounded(6, 4, 1)),
        "polygon": outline(Polygon((0, 0), (4, 0), (4, 3))),
    }
