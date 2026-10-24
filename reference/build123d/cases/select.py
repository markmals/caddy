"""Oracle cases for `Select`, the record an operation leaves of what it did to its inputs.

`Select.LAST` reports the sub-shapes of a result that the operation brought in or created,
`Select.NEW` only those that existed in no input at all, and `Select.ALL` (the default)
everything. OCCT's history tracks vertices, edges, faces and solids; wires, shells and
compounds are containers it says nothing about, so every one of those counts as last and as
new. The cases record that as it is rather than hiding it.
"""

from __future__ import annotations

from typing import Any

from build123d import (
    Align,
    Axis,
    Box,
    Curve,
    Cylinder,
    Edge,
    Line,
    Pos,
    Rectangle,
    Select,
    Shape,
    Solid,
    Sphere,
    Wire,
)

from oracle import case, vec


def counts(shape: Shape, select: Select) -> dict[str, int]:
    """How many sub-shapes of each kind `select` reports."""
    return {
        "vertices": len(shape.vertices(select)),
        "edges": len(shape.edges(select)),
        "wires": len(shape.wires(select)),
        "faces": len(shape.faces(select)),
        "shells": len(shape.shells(select)),
        "solids": len(shape.solids(select)),
    }


def every_select(shape: Shape) -> dict[str, Any]:
    """The sub-shape counts of all three selectors, for every shape type."""
    return {
        "class_name": type(shape).__name__,
        "all": counts(shape, Select.ALL),
        "last": counts(shape, Select.LAST),
        "new": counts(shape, Select.NEW),
    }


def standing_cylinder() -> Cylinder:
    """A cylinder standing on top of the ten-cube, overlapping nothing but its top face."""
    return Pos(Z=5) * Cylinder(2, 5, align=(Align.CENTER, Align.CENTER, Align.MIN))


@case("fuse/every-shape-type")
def fuse_every_shape_type() -> dict[str, Any]:
    """A cylinder fused onto a box: the two faces it brought are last, nothing is new."""
    return every_select(Box(10, 10, 10) + standing_cylinder())


@case("fuse/last-faces-sit-on-top")
def fuse_last_faces_sit_on_top() -> dict[str, Any]:
    """The faces the fuse brought in are the cylinder's, all above the box."""
    part = Box(10, 10, 10) + standing_cylinder()
    last = part.faces(Select.LAST)
    return {
        "count": len(last),
        "geom_types": sorted(face.geom_type.name for face in last),
        "above_the_box": all(face.center().Z > 5 for face in last),
        "areas": sorted(face.area for face in last),
    }


@case("fuse/crossed-sketches")
def fuse_crossed_sketches() -> dict[str, Any]:
    """Two crossing rectangles: the four points where the arms cross are new."""
    cross = Rectangle(8, 2) + Rectangle(2, 8)
    return {
        **every_select(cross),
        "new_vertices": sorted(vec(vertex.center()) for vertex in cross.vertices(Select.NEW)),
    }


@case("fuse/disjoint-pieces")
def fuse_disjoint_pieces() -> dict[str, Any]:
    """Boxes that do not touch stay two solids; the one brought in is last."""
    pieces = Box(10, 10, 10) + Pos(X=30) * Box(10, 10, 10)
    return {
        **every_select(pieces),
        "last_solid_centers": sorted(vec(solid.center()) for solid in pieces.solids(Select.LAST)),
    }


@case("fuse/self-was-there-before")
def fuse_self_was_there_before() -> dict[str, Any]:
    """A multi-piece left operand: none of its untouched pieces is last."""
    two = Rectangle(2, 2) + Pos(X=5) * Rectangle(2, 2)
    plus = two + Pos(X=5) * Rectangle(1, 4)
    return {"face_count": len(plus.faces()), "last_faces": len(plus.faces(Select.LAST))}


@case("fuse/chained-operations")
def fuse_chained_operations() -> dict[str, Any]:
    """Only the last operation is on record: the sphere's face, not the cylinder's."""
    three = (
        Box(10, 10, 10)
        + Pos(Z=5) * Cylinder(1, 5, align=(Align.CENTER, Align.CENTER, Align.MIN))
        + Pos(X=5) * Sphere(1)
    )
    last = three.faces(Select.LAST)
    return {"count": len(last), "geom_types": [face.geom_type.name for face in last]}


@case("cut/hole-through-a-box")
def cut_hole_through_a_box() -> dict[str, Any]:
    """Cutting a cylinder out leaves its wall as the one face the cut brought in."""
    holed = Box(10, 10, 10) - Cylinder(1, 20)
    return {
        **every_select(holed),
        "last_face_types": [face.geom_type.name for face in holed.faces(Select.LAST)],
        "new_edge_lengths": sorted(edge.length for edge in holed.edges(Select.NEW)),
    }


@case("intersect/overlapping-boxes")
def intersect_overlapping_boxes() -> dict[str, Any]:
    """The bar two boxes share: the four faces of the thin box are last, none is new."""
    return every_select(Box(10, 10, 10) & Box(30, 2, 2))


@case("cut/half-a-box")
def cut_half_a_box() -> dict[str, Any]:
    """Slicing the top off a box: the new top face is last, and nothing is new."""
    box = Box(10, 10, 10)
    half = box - Pos(Z=5) * Box(10, 10, 10)
    return {
        **every_select(half),
        "last_face_areas": sorted(face.area for face in half.faces(Select.LAST)),
    }


@case("clean/keeps-the-record")
def clean_keeps_the_record() -> dict[str, Any]:
    """A clean of its own is a record with no inputs, so everything counts as last and new."""
    return every_select(Solid.make_box(1, 1, 1).clean())


@case("clean/after-a-fuse")
def clean_after_a_fuse() -> dict[str, Any]:
    """Cleaning a fused shape again keeps answering for the fuse that made it."""
    part = (Box(10, 10, 10) + standing_cylinder()).clean()
    return {
        **every_select(part),
        "last_face_types": sorted(face.geom_type.name for face in part.faces(Select.LAST)),
    }


@case("select/all-is-the-default")
def select_all_is_the_default() -> dict[str, Any]:
    """Without a selector an accessor reports every sub-shape, record or no record."""
    box = Box(10, 10, 10)
    fused = box + standing_cylinder()
    return {
        "plain": counts(box, Select.ALL),
        "fused": counts(fused, Select.ALL),
        "default_matches_all": len(fused.faces()) == len(fused.faces(Select.ALL)),
    }


@case("select/sub-shapes-of-a-selected-face")
def select_sub_shapes_of_a_selected_face() -> dict[str, Any]:
    """A sub-shape taken out of a result is not itself the result of an operation."""
    part = Box(10, 10, 10) + standing_cylinder()
    top = part.faces().sort_by(Axis.Z)[-1]
    results: dict[str, Any] = {"face_edge_count": len(top.edges())}
    try:
        top.edges(Select.LAST)
    except ValueError:
        results["face_has_no_record"] = True
    return results


@case("errors/no-record")
def errors_no_record() -> dict[str, Any]:
    """A shape no recorded operation made cannot answer LAST or NEW, but still answers ALL."""
    rectangle = Rectangle(8, 2)
    results: dict[str, Any] = {"all_vertices": len(rectangle.vertices(Select.ALL))}
    for name, select in (("last", Select.LAST), ("new", Select.NEW)):
        try:
            rectangle.vertices(select)
        except ValueError:
            results[f"{name}_raises"] = True
    return results


@case("fillet/box-vertical-edges")
def fillet_box_vertical_edges() -> dict[str, Any]:
    """A fillet is not a boolean, but it still records: the four fillet faces were made from the
    edges they replaced, so they count as last, and every edge of the result that descends from no
    input edge is new."""
    box = Box(10, 10, 10)
    rounded = box.fillet(1, box.edges().filter_by(Axis.Z))
    return {
        **every_select(rounded),
        "last_face_types": sorted(face.geom_type.name for face in rounded.faces(Select.LAST)),
        "new_edge_lengths": sorted(edge.length for edge in rounded.edges(Select.NEW)),
    }


@case("chamfer/box-vertical-edges")
def chamfer_box_vertical_edges() -> dict[str, Any]:
    """The same record for a chamfer: four cut faces made from the edges they replaced."""
    box = Box(10, 10, 10)
    beveled = box.chamfer(1, None, box.edges().filter_by(Axis.Z))
    return {
        **every_select(beveled),
        "last_face_areas": sorted(face.area for face in beveled.faces(Select.LAST)),
    }


@case("fillet-2d/face-corners")
def fillet_2d_face_corners() -> dict[str, Any]:
    """Rounding the corners of a face collects what became of its wires but names no inputs that
    were already there, so everything the result holds counts as last and as new."""
    face = Rectangle(6, 4).face()
    return every_select(face.fillet_2d(1, face.vertices()))


@case("chamfer-2d/face-corners")
def chamfer_2d_face_corners() -> dict[str, Any]:
    """Cutting the corners of a face records the face it worked on, so the four sides it trimmed
    are not last and the face itself is neither last nor new."""
    face = Rectangle(6, 4).face()
    chamfered = face.chamfer_2d(1, 1, face.vertices())
    return {
        **every_select(chamfered),
        "last_edge_lengths": sorted(edge.length for edge in chamfered.edges(Select.LAST)),
    }


@case("fillet-2d/closed-wire-corners")
def fillet_2d_closed_wire_corners() -> dict[str, Any]:
    """A closed wire is rounded as the face it bounds; the arcs are last and new, the trimmed
    sides are neither."""
    wire = Rectangle(6, 4).wire()
    rounded = wire.fillet_2d(1, wire.vertices())
    return {
        **every_select(rounded),
        "last_edge_types": sorted(edge.geom_type.name for edge in rounded.edges(Select.LAST)),
    }


@case("fillet-2d/open-wire-corners")
def fillet_2d_open_wire_corners() -> dict[str, Any]:
    """An open wire is rebuilt corner by corner: the two arcs are last and new, the three lines
    beside them were rebuilt from the originals."""
    wire = Wire(
        [
            Edge.make_line((0, 0), (4, 0)),
            Edge.make_line((4, 0), (4, 3)),
            Edge.make_line((4, 3), (0, 3)),
        ]
    )
    corners = wire.vertices().sort_by(Axis.X)[-2:]
    rounded = wire.fillet_2d(1, corners)
    return {
        **every_select(rounded),
        "last_edge_types": sorted(edge.geom_type.name for edge in rounded.edges(Select.LAST)),
    }


@case("chamfer-2d/closed-wire-corners")
def chamfer_2d_closed_wire_corners() -> dict[str, Any]:
    """Cutting the corners of a closed wire records what became of its sides."""
    wire = Rectangle(6, 4).wire()
    return every_select(wire.chamfer_2d(1, 1, wire.vertices()))


@case("join/connected-lines")
def join_connected_lines() -> dict[str, Any]:
    """Connected edges are joined into a wire without a boolean; the join records too, so the
    line brought in is last and the vertex it shares with the old one is last as well."""
    bent = Line((0, 0), (1, 0)) + Line((1, 0), (1, 1))
    return {
        **every_select(bent),
        "last_edge_midpoints": sorted(vec(edge @ 0.5) for edge in bent.edges(Select.LAST)),
        "last_vertices": sorted(vec(vertex.center()) for vertex in bent.vertices(Select.LAST)),
    }


@case("join/collinear-lines")
def join_collinear_lines() -> dict[str, Any]:
    """Collinear lines are cleaned into one edge, which still carries the record of the join."""
    straight = Line((0, 0), (1, 0)) + Line((1, 0), (2, 0))
    return {
        **every_select(straight),
        "last_vertices": sorted(vec(vertex.center()) for vertex in straight.vertices(Select.LAST)),
    }


@case("join/onto-an-empty-curve")
def join_onto_an_empty_curve() -> dict[str, Any]:
    """Three edges joined onto an empty curve: everything was brought in, so every edge is last,
    and none is new because each one is still itself in the result."""
    chain = Curve() + [
        Line((0, 0), (1, 0)),
        Line((1, 0), (1, 1)),
        Line((1, 1), (0, 1)),
    ]
    return every_select(chain)


@case("join/disjoint-lines")
def join_disjoint_lines() -> dict[str, Any]:
    """Lines that do not connect cannot be joined into a wire, so the fuse takes over and its own
    record answers."""
    disjoint = Line((0, 0), (1, 0)) + Line((5, 0), (6, 0))
    return {
        **every_select(disjoint),
        "last_edge_midpoints": sorted(vec(edge @ 0.5) for edge in disjoint.edges(Select.LAST)),
    }
