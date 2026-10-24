"""Oracle cases for members the per-area suites left uncovered.

This suite is a catch-all, not a theme: every case here pins one member that the suite covering
its area did not reach — the enums that only ever appear as an option (`Convexity`, `PageSize`,
`PrecisionMode`), the type aliases that describe what a parameter accepts (`RotationLike`,
`VectorLike`), the base behaviour of `Joint`, `DraftAngleError`'s contents, the file-path form of
the 2D importers, and a handful of `Edge`, `Face`, `Shape` and `Vertex` members.

Two cases record less than the shape they build:

* `face/surface-patch` compares only topology and bounds. OCCT's plate solver converges
  slightly differently in the OCP wheel's kernel than in Caddy's own OCCT build, so the patch's
  area differs by 2.2e-5 relative from identical inputs (see the note in `faces.py`); its face
  count, edge count and bounding box do agree.
* `enums/convexity` records the member *names*. build123d's `Convexity` is an `auto()` `Enum`
  whose numbers carry no meaning, so — like every other ported enum — Caddy uses the names as
  the values.
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from build123d import (
    Axis,
    Box,
    Convexity,
    Edge,
    Extrinsic,
    Face,
    Location,
    PageSize,
    Plane,
    PrecisionMode,
    RigidJoint,
    Rotation,
    Solid,
    Sphere,
    Torus,
    Vector,
    Vertex,
    Wire,
    extrude,
    import_dxf,
    import_svg,
)
from build123d.drafting import TechnicalDrawing
from build123d.topology import Shape
from build123d.topology.three_d import DraftAngleError

from oracle import case, location, shape_metrics, vec

SVG_FILE = """<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="80mm" viewBox="0 0 100 80">
  <rect id="plate" x="10" y="10" width="40" height="20"/>
  <circle id="hole" cx="70" cy="20" r="8" fill="none" stroke="black"/>
</svg>"""

DXF_FILE = "\n".join(
    [
        "0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1024", "0", "ENDSEC",
        "0", "SECTION", "2", "ENTITIES",
        "0", "LINE", "100", "AcDbEntity", "8", "0", "100", "AcDbLine",
        "10", "0.0", "20", "0.0", "30", "0.0", "11", "10.0", "21", "5.0", "31", "0.0",
        "0", "ARC", "100", "AcDbEntity", "8", "0", "100", "AcDbCircle",
        "10", "20.0", "20", "0.0", "30", "0.0", "40", "5.0",
        "100", "AcDbArc", "50", "30.0", "51", "150.0",
        "0", "CIRCLE", "100", "AcDbEntity", "8", "0", "100", "AcDbCircle",
        "10", "40.0", "20", "0.0", "30", "0.0", "40", "4.0",
        "0", "ENDSEC", "0", "EOF",
    ]
) + "\n"


def imported(shape: Any) -> dict[str, Any]:
    """The same record the `imports` suite keeps for an imported shape."""
    box = shape.bounding_box()
    return {
        "class_name": type(shape).__name__,
        "label": shape.label,
        "color": None if shape.color is None else [float(c) for c in tuple(shape.color)],
        "is_valid": bool(shape.is_valid),
        "area": float(shape.area),
        "volume": float(shape.volume),
        "min": vec(box.min),
        "max": vec(box.max),
        "counts": {
            "faces": len(shape.faces()),
            "wires": len(shape.wires()),
            "edges": len(shape.edges()),
        },
        "edges": [
            {
                "geom_type": edge.geom_type.name,
                "length": float(edge.length),
                "start": vec(edge.start_point()),
                "end": vec(edge.end_point()),
            }
            for edge in shape.edges()
        ],
    }


def curve_points(edge: Edge, count: int = 5) -> list[list[float]]:
    """`count` points spread over the edge, start and end included."""
    return [vec(edge.position_at(index / (count - 1))) for index in range(count)]


def edge_record(edge: Edge) -> dict[str, Any]:
    """An edge's kind, size, ends and sampled shape."""
    box = edge.bounding_box()
    return {
        "geom_type": edge.geom_type.name,
        "length": float(edge.length),
        "is_closed": bool(edge.is_closed),
        "start": vec(edge.start_point()),
        "end": vec(edge.end_point()),
        "min": vec(box.min),
        "max": vec(box.max),
        "points": curve_points(edge),
    }


# ---- enums ----


@case("enums/convexity")
def enums_convexity() -> dict[str, Any]:
    """`Convexity`'s members, in declaration order."""
    return {"names": [member.name for member in Convexity]}


@case("enums/page-size")
def enums_page_size() -> dict[str, Any]:
    """`PageSize`'s members and the landscape page they stand for, in millimetres."""
    return {
        "names": [member.name for member in PageSize],
        "sizes": {
            member.name: [float(size) for size in TechnicalDrawing.page_sizes[member]]
            for member in PageSize
        },
    }


@case("enums/precision-mode")
def enums_precision_mode() -> dict[str, Any]:
    """`PrecisionMode`'s members and their values, which are OCCT's own `write.precision.mode`."""
    return {
        "names": [member.name for member in PrecisionMode],
        "values": [int(member.value) for member in PrecisionMode],
    }


# ---- errors ----


def draft_failure(selection: str, neutral: str, angle: float) -> dict[str, Any]:
    """The contents of the `DraftAngleError` that drafting `selection` raises."""
    box = Box(10, 10, 10).solid()
    bottom = box.faces().sort_by(Axis.Z)[0]
    faces = (
        box.faces().filter_by(Axis.Z, reverse=True) if selection == "sides" else [bottom]
    )
    neutral_plane = Plane(bottom) if neutral == "bottom" else Plane.XZ
    try:
        box.draft(faces, neutral_plane, angle)
    except DraftAngleError as error:
        problematic = Shape.cast(error.problematic_shape)
        failed = error.face
        return {
            "error": type(error).__name__,
            "message": str(error),
            "failed_index": [
                index for index, face in enumerate(faces) if face.is_same(failed)
            ][0],
            "face": {"area": float(failed.area), "center": vec(failed.center())},
            "problematic": {
                "class_name": type(problematic).__name__,
                "shape_type": problematic.wrapped.ShapeType().name.removeprefix("TopAbs_"),
                "area": float(problematic.area),
                "center": vec(problematic.center()),
                "face_count": len(problematic.faces()),
                "is_failed_face": bool(problematic.is_same(failed)),
            },
        }
    raise AssertionError("the draft was expected to fail")


@case("errors/draft-angle")
def errors_draft_angle() -> dict[str, Any]:
    """Three drafts OCCT refuses, each naming the face it gave up on.

    build123d's own tests reach `DraftAngleError` by mocking `BRepOffsetAPI_DraftAngle`; these
    reach it through the kernel: pulling a face along its own normal, pulling the sides along a
    direction that lies in them, and a right-angle taper. The error carries the face it failed
    on and the shape OCCT blamed, which here is always that same face.
    """
    return {
        "neutral_plane_face": draft_failure("bottom", "bottom", 5),
        "sides_in_neutral_plane": draft_failure("sides", "xz", 5),
        "right_angle": draft_failure("sides", "bottom", 90),
    }


# ---- joints ----


@case("joint/base")
def joint_base() -> dict[str, Any]:
    """What every joint inherits: a label, a parent it moves with, and the joint it connects to.

    build123d's `Joint.connect_to` relocates the *other* joint's parent in place and records it
    in `connected_to`; Caddy returns the relocated copy instead, so the same three facts are read
    off the shape that comes back.
    """
    base = Box(10, 10, 2).solid()
    arm = Box(2, 2, 6).solid()
    socket = RigidJoint("socket", base, Location((0, 0, 1)))
    stem = RigidJoint("stem", arm, Location((0, 0, -3)))

    before = {
        "label": socket.label,
        "parent_labels": sorted(base.joints),
        "connected_to": None if socket.connected_to is None else socket.connected_to.label,
        "location": location(socket.location),
    }
    socket.connect_to(stem)
    after = {
        "connected_to": socket.connected_to.label,
        "moved": shape_metrics(arm),
        "stem_location": location(stem.location),
    }

    # A joint is stored relative to its parent, so relocating the parent carries it along.
    base.locate(Location((5, 0, 0), (0, 0, 90)))
    return {
        "before": before,
        "after": after,
        "relocated": location(socket.location),
        "relative_location": location(socket.relative_location),
    }


# ---- type aliases ----


@case("types/rotation-like")
def types_rotation_like() -> dict[str, Any]:
    """Everything `RotationLike` admits: a 2- or 3-tuple, a `Vector`, or another `Rotation`."""
    angles = (10, 20, 30)
    return {
        "from_angles": location(Rotation(*angles)),
        "from_tuple": location(Rotation(angles)),
        "from_two_tuple": location(Rotation((10, 20))),
        "from_vector": location(Rotation(Vector(*angles))),
        "from_rotation": location(Rotation(Rotation(*angles))),
        "extrinsic": location(Rotation(angles, Extrinsic.XYZ)),
        "applied": location(Rotation(angles) * Location((1, 0, 0))),
    }


@case("types/vector-like")
def types_vector_like() -> dict[str, Any]:
    """Everything `VectorLike` admits, and a maker reading its points through it."""
    return {
        "from_two_tuple": vec((1, 2)),
        "from_three_tuple": vec((1, 2, 3)),
        "from_vector": vec(Vector(1, 2, 3)),
        "line_from_two_tuples": edge_record(Edge.make_line((0, 0), (3, 4))),
        "polygon_from_mixed": shape_metrics(
            Wire.make_polygon([Vector(0, 0), (4, 0), (4, 3, 0)])
        ),
    }


# ---- importers reading a file ----


@case("import/svg-file")
def import_svg_file() -> dict[str, Any]:
    """`import_svg` reading a path, rather than the text of the document."""
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "drawing.svg"
        path.write_text(SVG_FILE, encoding="utf-8")
        shapes = import_svg(path)
    return {"source": SVG_FILE, "shapes": [imported(shape) for shape in shapes]}


@case("import/dxf-file")
def import_dxf_file() -> dict[str, Any]:
    """`import_dxf` reading a path, rather than the text of the drawing."""
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "drawing.dxf"
        path.write_text(DXF_FILE, encoding="latin-1")
        shapes = import_dxf(path)
    return {"source": DXF_FILE, "shapes": [imported(shape) for shape in shapes]}


# ---- Edge makers ----


@case("edge/bezier")
def edge_bezier() -> dict[str, Any]:
    """A cubic Bézier, and the same control net made rational by its weights."""
    points = [(0, 0), (0, 1), (1, 1), (1, 0)]
    plain = Edge.make_bezier(*points)
    weighted = Edge.make_bezier(*points, weights=[1.0, 3.0, 3.0, 1.0])
    return {"plain": edge_record(plain), "weighted": edge_record(weighted)}


@case("edge/bspline")
def edge_bspline() -> dict[str, Any]:
    """A quadratic B-spline from control points and knots, plain and rational."""
    control_points = [(0, 0), (1, 1), (2, 0)]
    knots = [0.0, 0.0, 0.0, 1.0, 1.0, 1.0]
    plain = Edge.make_bspline(control_points, knots, degree=2)
    weighted = Edge.make_bspline(control_points, knots, degree=2, weights=[1.0, 2.0, 1.0])
    return {"plain": edge_record(plain), "weighted": edge_record(weighted)}


@case("edge/helix")
def edge_helix() -> dict[str, Any]:
    """A right-handed cylindrical helix, and the left-handed conical one about -X."""
    cylindrical = Edge.make_helix(1, 4, 1)
    conical = Edge.make_helix(1, 4, 1, normal=(-1, 0, 0), angle=10, lefthand=True)
    return {
        "cylindrical": edge_record(cylindrical),
        "conical": edge_record(conical),
        "centered": edge_record(Edge.make_helix(2, 6, 1, center=(1, 2, 3))),
    }


@case("edge/three-point-arc")
def edge_three_point_arc() -> dict[str, Any]:
    """The circular arc through three points, including one that is not in the XY plane."""
    flat = Edge.make_three_point_arc((1, 0), (0, 1), (-1, 0))
    tilted = Edge.make_three_point_arc((1, 0, 0), (0, 0, 1), (-1, 0, 0))
    return {
        "flat": edge_record(flat),
        "flat_radius": float(flat.radius),
        "flat_center": vec(flat.arc_center),
        "tilted": edge_record(tilted),
        "tilted_radius": float(tilted.radius),
    }


# ---- Edge.trim_to_other ----


def trim_targets() -> dict[str, Any]:
    """The shapes, axis and plane an arc is trimmed against, as build123d's own test uses them."""
    corners = [(0, 0, 0), (-1, 0, 0), (-1, 1, 0), (0, 1, 0)]
    wire = Wire.make_polygon(corners).rotate(Axis.Z, -45)
    face = Face(Wire.make_polygon(corners)).rotate(Axis.Z, -45)
    return {
        "edge": Edge.make_line((0, 0), (1, 1)),
        "arc": Edge.make_circle(1, start_angle=45, end_angle=90),
        "wire": wire,
        "face": face,
        "solid": extrude(face, amount=1, both=True).solid(),
        "axis": Axis((0, 0, 0), (1, 1, 0)),
        "plane": Plane((0, 0, 0), (1, 1, 0), (-1, 1, 0)),
        "missing": Edge.make_line((5, 5), (6, 6)),
    }


def trimmed(edge: Edge) -> dict[str, Any]:
    """What `edge` trims to against each target: `None`, or the piece that survives."""
    results: dict[str, Any] = {}
    for name, other in trim_targets().items():
        piece = edge.trim_to_other(other)
        results[name] = (
            None
            if piece is None
            else {"length": float(piece.length), "end": vec(piece.end_point())}
        )
    return results


@case("edge/trim-to-other")
def edge_trim_to_other() -> dict[str, Any]:
    """An open and a closed arc trimmed to every kind of object `trim_to_other` accepts."""
    return {
        "half_circle": trimmed(Edge.make_circle(1, start_angle=0, end_angle=180)),
        "full_circle": trimmed(Edge.make_circle(1)),
    }


# ---- Face members ----


@case("face/is-coplanar")
def face_is_coplanar() -> dict[str, Any]:
    """A planar face lies in its own plane whichever way it faces; a curved one lies in none."""
    square = Face.make_rect(1, 1, plane=Plane.XZ)
    sphere = Solid.make_sphere(1).faces()[0]
    return {
        "square_in_xz": bool(square.is_coplanar(Plane.XZ)),
        "reversed_in_xz": bool((-square).is_coplanar(Plane.XZ)),
        "square_in_xy": bool(square.is_coplanar(Plane.XY)),
        "square_in_offset_xz": bool(square.is_coplanar(Plane.XZ.offset(0.5))),
        "sphere_in_xy": bool(sphere.is_coplanar(Plane.XY)),
    }


def net_exterior() -> Wire:
    """build123d's `test_make_surface` boundary: three straight sides and an arc that dips."""
    corners = [Vector(x, y) for x in [-50.5, 50.5] for y in [-24.5, 24.5]]
    return Wire(
        [
            Edge.make_line(corners[3], corners[1]),
            Edge.make_line(corners[1], corners[0]),
            Edge.make_line(corners[0], corners[2]),
            Edge.make_three_point_arc(
                corners[2], (corners[2] + corners[3]) / 2 - Vector(0, 0, 3), corners[3]
            ),
        ]
    )


@case("face/make-surface")
def face_make_surface() -> dict[str, Any]:
    """A surface through a boundary wire, pulled through a point, pierced, and from edges."""
    exterior = net_exterior()
    plain = Face.make_surface(exterior)
    pulled = Face.make_surface(exterior, surface_points=[Vector(0, 0, -5)])
    hole = Wire.make_circle(10).project_to_shape(pulled, (0, 0, -1))[0]
    pierced = Face.make_surface(
        exterior, surface_points=[Vector(0, 0, -5)], interior_wires=[hole]
    )
    from_edges = Face.make_surface([Edge.make_circle(50)], surface_points=[(0, 0, -5)])
    return {
        "plain": shape_metrics(plain),
        "pulled": shape_metrics(pulled),
        "pierced": shape_metrics(pierced),
        "from_edges": shape_metrics(from_edges),
    }


@case("face/radii")
def face_radii() -> dict[str, Any]:
    """Only a toroidal face has a major and a minor radius."""
    torus = Torus(5, 1).face()
    return {
        "torus": [float(value) for value in torus.radii],
        "sphere": Sphere(1).face().radii,
        "cylinder": Solid.make_cylinder(2, 4).faces().sort_by(Axis.Z)[1].radii,
        "planar": Face.make_rect(1, 1).radii,
    }


@case("face/surface-patch")
def face_surface_patch() -> dict[str, Any]:
    """A filled patch bounded by three splines, recorded without its area.

    OCCT's plate solver lands on a slightly different surface in the OCP wheel than in Caddy's
    own OCCT build: with identical boundary edges the raw filling measures 696.3374116206876
    there and 696.3529294304421 here, 2.2e-5 relative apart — far outside any fitted-geometry
    tolerance, and the reason `faces.py` leaves `make_surface_patch` out. What does agree
    exactly is the topology the patch is built with, and its bounding box to a micron.
    """
    first = Edge.make_spline([(0, 0, 0), (1, 0, 0), (10, 0, -10)])
    second = Edge.make_spline([(0, 0, 0), (0, 1, 0), (0, 10, -10)])
    third = Edge.make_spline([first @ 1, (7, 7, -10), second @ 1])
    patch = Face.make_surface_patch(edge_constraints=[first, second, third])
    box = patch.bounding_box()
    return {
        "class_name": type(patch).__name__,
        "is_valid": bool(patch.is_valid),
        "geom_type": patch.geom_type.name,
        "face_count": len(patch.faces()),
        "edge_count": len(patch.edges()),
        "vertex_count": len(patch.vertices()),
        "min": vec(box.min),
        "max": vec(box.max),
        "boundary_lengths": sorted(float(edge.length) for edge in patch.edges()),
    }


# ---- Shape members ----


@case("shape/distance-to-with-closest-points")
def shape_distance_to_with_closest_points() -> dict[str, Any]:
    """The gap between two shapes, and the pair of points that measures it."""

    def record(first: Shape, second: Any) -> dict[str, Any]:
        distance, mine, theirs = first.distance_to_with_closest_points(second)
        return {"distance": float(distance), "mine": vec(mine), "theirs": vec(theirs)}

    apart = Solid.make_sphere(1).locate(Location((0, 2.1, 0)))
    return {
        "spheres": record(apart, Solid.make_sphere(1)),
        "point": record(apart, (0, 0, 0)),
        "crossing": record(
            Edge.make_line((-1, 0, 0), (1, 0, 0)), Edge.make_line((0, -1, 1), (0, 1, 1))
        ),
        "touching": record(Solid.make_box(1, 1, 1), Solid.make_box(1, 1, 1).locate(Location((1, 0, 0)))),
    }


@case("shape/is-null")
def shape_is_null() -> dict[str, Any]:
    """A shape is null once it has let go of its native handle."""
    edge = Edge.make_line((0, 0), (1, 1))
    live = bool(edge.is_null)
    edge.wrapped = None
    return {"class_name": "Edge", "live": live, "emptied": bool(edge.is_null)}


@case("shape/topo-owner-and-parent")
def shape_topo_owner_and_parent() -> dict[str, Any]:
    """Selecting a sub-shape records the route it came by: its owner, and the shape at the top."""
    box = Solid.make_box(1, 1, 1)
    face = box.faces().sort_by(Axis.X)[-1]
    edge = face.edges().sort_by(Axis.Y)[0]
    vertex = edge.vertices()[0]
    return {
        "box": {"owner": None, "parent": None, "path": []},
        "face": {
            "owner": "Solid",
            "parent": "Solid",
            "path": [type(step).__name__ for step in face.topo_path],
            "owner_is_box": face.topo_owner is box,
            "parent_is_box": face.topo_parent is box,
        },
        "edge": {
            "owner": "Face",
            "parent": "Solid",
            "path": [type(step).__name__ for step in edge.topo_path],
            "owner_is_face": edge.topo_owner is face,
            "parent_is_box": edge.topo_parent is box,
        },
        "vertex": {
            "owner": "Edge",
            "parent": "Solid",
            "path": [type(step).__name__ for step in vertex.topo_path],
            "owner_is_edge": vertex.topo_owner is edge,
            "parent_is_box": vertex.topo_parent is box,
        },
        "top_level_owner_is_none": box.topo_owner is None,
        "top_level_parent_is_none": box.topo_parent is None,
    }


# ---- Vertex members ----


@case("vertex/to-array")
def vertex_to_array() -> dict[str, Any]:
    """Iterating a vertex gives its coordinates, location included."""
    moved = Solid.make_box(1, 2, 3).locate(Location((1, 1, 1), (0, 0, 45)))
    return {
        "single": list(Vertex(1, 2, 3)),
        "box": sorted(list(vertex) for vertex in moved.vertices()),
    }
