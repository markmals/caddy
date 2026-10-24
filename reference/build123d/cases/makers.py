"""Maker oracle: the `Solid`/`Shell` classmethod factories (primitives, loft, revolve, sweep,
extrusion variants) and the `Wire` repairs and queries that `packages/caddy/src/topology`
exposes as static and instance members.

Every shape is built from a primitive maker or an explicit wire, so the TypeScript side can
reproduce it through the same Caddy members without reaching for the part or sketch libraries.
"""

from __future__ import annotations

from build123d import (
    Axis,
    Edge,
    Face,
    Plane,
    Pos,
    Solid,
    Shell,
    Transition,
    Until,
    Vector,
    Vertex,
    Wire,
)

from oracle import case, shape_metrics, vec


# ---- shapes under test ----


def _plate_with_hole() -> Face:
    return Face(Wire.make_rect(10, 10), [Wire.make_circle(2)])


def _corner_path() -> Wire:
    return Wire.make_polygon([(0, 0, 0), (10, 0, 0), (16, 6, 0)], close=False)


def _spline_path() -> Wire:
    return Wire([Edge.make_spline([(0, 0, 0), (5, 3, 2), (10, 0, 5)])])


def _open_polyline() -> Wire:
    return Wire.make_polygon([(0, 0, 0), (10, 0, 0), (10, 6, 0)], close=False)


def _degenerate_wire() -> Wire:
    """A rectangle whose bottom edge is split in two by a corner 0.4 µm away from it."""
    return Wire.make_polygon(
        [(0, 0, 0), (10, 0, 0), (10.0004, 0, 0), (10, 6, 0), (0, 6, 0)], close=True
    )


# ---- serializers ----


def _edge_report(wire: Wire) -> dict:
    edges = wire.order_edges()
    return {
        "count": len(edges),
        "starts": [vec(edge @ 0) for edge in edges],
        "ends": [vec(edge @ 1) for edge in edges],
        "lengths": [edge.length for edge in edges],
    }


# ---- solid primitives ----


@case("box/default")
def box_default() -> dict:
    return {"shape": shape_metrics(Solid.make_box(10, 6, 4))}


@case("box/plane")
def box_plane() -> dict:
    return {"shape": shape_metrics(Solid.make_box(10, 6, 4, plane=Plane.YZ))}


@case("cone/full")
def cone_full() -> dict:
    return {"shape": shape_metrics(Solid.make_cone(5, 2, 8))}


@case("cone/partial")
def cone_partial() -> dict:
    return {"shape": shape_metrics(Solid.make_cone(5, 0, 8, angle=120))}


@case("cylinder/full")
def cylinder_full() -> dict:
    return {"shape": shape_metrics(Solid.make_cylinder(3, 10))}


@case("cylinder/partial-plane")
def cylinder_partial_plane() -> dict:
    return {"shape": shape_metrics(Solid.make_cylinder(3, 10, Plane.XZ, angle=90))}


@case("sphere/full")
def sphere_full() -> dict:
    return {"shape": shape_metrics(Solid.make_sphere(5))}


@case("sphere/partial")
def sphere_partial() -> dict:
    sphere = Solid.make_sphere(5, angle1=-30, angle2=60, angle3=210)
    return {"shape": shape_metrics(sphere)}


@case("torus/full")
def torus_full() -> dict:
    return {"shape": shape_metrics(Solid.make_torus(8, 2))}


@case("torus/partial")
def torus_partial() -> dict:
    torus = Solid.make_torus(8, 2, start_angle=0, end_angle=180, major_angle=270)
    return {"shape": shape_metrics(torus)}


@case("wedge/default")
def wedge_default() -> dict:
    return {"shape": shape_metrics(Solid.make_wedge(10, 8, 6, 2, 1, 8, 5))}


@case("wedge/plane")
def wedge_plane() -> dict:
    wedge = Solid.make_wedge(10, 8, 6, 2, 1, 8, 5, plane=Plane.XZ)
    return {"shape": shape_metrics(wedge)}


@case("from-bounding-box/rotated-cone")
def from_bounding_box_rotated_cone() -> dict:
    cone = Solid.make_cone(5, 2, 8, plane=Plane.XZ)
    return {"shape": shape_metrics(Solid.from_bounding_box(cone.bounding_box()))}


@case("from-bounding-box/oriented")
def from_bounding_box_oriented() -> dict:
    wedge = Solid.make_wedge(10, 8, 6, 2, 1, 8, 5).rotate(Axis.Z, 35)
    oriented = Solid.from_bounding_box(wedge.oriented_bounding_box())
    return {"shape": shape_metrics(oriented)}


# ---- loft ----


@case("loft/wires")
def loft_wires() -> dict:
    sections = [Wire.make_rect(10, 6), Wire.make_circle(3, Plane(origin=(0, 0, 8)))]
    return {"shape": shape_metrics(Solid.make_loft(sections))}


@case("loft/ruled-to-vertex")
def loft_ruled_to_vertex() -> dict:
    sections = [Wire.make_rect(10, 6), Wire.make_rect(4, 3, Plane(origin=(0, 0, 5))), Vertex(0, 0, 9)]
    return {"shape": shape_metrics(Solid.make_loft(sections, ruled=True))}


@case("loft/shell-open-wires")
def loft_shell_open_wires() -> dict:
    sections = [
        Wire.make_polygon([(0, 0, 0), (6, 0, 0), (6, 4, 0)], close=False),
        Wire.make_polygon([(0, 0, 5), (3, 0, 5), (3, 2, 5)], close=False),
    ]
    return {"shape": shape_metrics(Shell.make_loft(sections))}


# ---- revolve ----


@case("revolve/face")
def revolve_face() -> dict:
    profile = Face.make_rect(4, 6, Plane.XZ).moved(Pos(5, 0, 0))
    return {"shape": shape_metrics(Solid.revolve(profile, 270, Axis.Z))}


@case("revolve/wire-with-hole")
def revolve_wire_with_hole() -> dict:
    outer = Wire.make_rect(4, 6, Plane.XZ).moved(Pos(8, 0, 0))
    inner = Wire.make_circle(1, Plane.XZ).moved(Pos(8, 0, 0))
    revolved = Solid.revolve(outer, 180, Axis.Z, inner_wires=[inner])
    return {"shape": shape_metrics(revolved)}


@case("revolve/shell")
def revolve_shell() -> dict:
    profile = Wire.make_polygon([(4, 0, 0), (6, 0, 2), (6, 0, 6)], close=False)
    return {"shape": shape_metrics(Shell.revolve(profile, 220, Axis.Z))}


# ---- sweep ----


@case("sweep/face-along-corner")
def sweep_face_along_corner() -> dict:
    section = Face.make_rect(2, 2, Plane.YZ)
    return {"shape": shape_metrics(Solid.sweep(section, _corner_path()))}


@case("sweep/face-with-hole")
def sweep_face_with_hole() -> dict:
    section = Face(Wire.make_rect(4, 4, Plane.YZ), [Wire.make_circle(1, Plane.YZ)])
    path = Wire([Edge.make_line((0, 0, 0), (10, 0, 0))])
    return {"shape": shape_metrics(Solid.sweep(section, path))}


@case("sweep/frenet")
def sweep_frenet() -> dict:
    section = Face.make_rect(2, 1, Plane.YZ)
    return {"shape": shape_metrics(Solid.sweep(section, _spline_path(), is_frenet=True))}


@case("sweep/binormal-wire")
def sweep_binormal_wire() -> dict:
    section = Face.make_rect(2, 1, Plane.YZ)
    binormal = Wire([Edge.make_line((0, 2, 0), (10, 2, 5))])
    swept = Solid.sweep(section, _spline_path(), mode=binormal)
    return {"shape": shape_metrics(swept)}


@case("sweep/binormal-vector")
def sweep_binormal_vector() -> dict:
    section = Face.make_rect(2, 1, Plane.YZ)
    swept = Solid.sweep(section, _spline_path(), mode=Vector(0, 1, 1))
    return {"shape": shape_metrics(swept)}


@case("sweep/wire-section-shell")
def sweep_wire_section_shell() -> dict:
    section = Wire.make_rect(2, 2, Plane.YZ)
    swept = Solid.sweep(section, _corner_path(), make_solid=False)
    return {"shape": shape_metrics(swept)}


@case("sweep/transition-right")
def sweep_transition_right() -> dict:
    section = Face.make_rect(2, 2, Plane.YZ)
    swept = Solid.sweep(section, _corner_path(), transition=Transition.RIGHT)
    return {"shape": shape_metrics(swept)}


@case("sweep-multi/two-sections")
def sweep_multi_two_sections() -> dict:
    path = Wire([Edge.make_line((0, 0, 0), (10, 0, 0))])
    profiles = [
        Wire.make_circle(2, Plane.YZ),
        Wire.make_circle(1, Plane(origin=(10, 0, 0), z_dir=(1, 0, 0))),
    ]
    return {"shape": shape_metrics(Solid.sweep_multi(profiles, path))}


@case("sweep-multi/faces")
def sweep_multi_faces() -> dict:
    path = Wire([Edge.make_line((0, 0, 0), (10, 0, 0))])
    profiles = [
        Face.make_rect(4, 4, Plane.YZ),
        Face.make_rect(2, 2, Plane(origin=(10, 0, 0), z_dir=(1, 0, 0))),
    ]
    return {"shape": shape_metrics(Solid.sweep_multi(profiles, path))}


@case("sweep/shell-profile-along-path")
def sweep_shell_profile_along_path() -> dict:
    profile = Wire.make_polygon([(0, -2, 0), (0, 2, 0)], close=False)
    return {"shape": shape_metrics(Shell.sweep(profile, _corner_path()))}


# ---- extrusion ----


@case("extrude/vertex-to-edge")
def extrude_vertex_to_edge() -> dict:
    return {"shape": shape_metrics(Edge.extrude(Vertex(1, 2, 3), (0, 0, 5)))}


@case("extrude/wire-to-shell")
def extrude_wire_to_shell() -> dict:
    return {"shape": shape_metrics(Shell.extrude(_open_polyline(), (0, 0, 4)))}


@case("extrude/face-to-solid")
def extrude_face_to_solid() -> dict:
    return {"shape": shape_metrics(Solid.extrude(_plate_with_hole(), (0, 0, 4)))}


@case("extrude-linear-with-rotation/face")
def extrude_linear_with_rotation_face() -> dict:
    twisted = Solid.extrude_linear_with_rotation(
        Face.make_rect(6, 4), (0, 0, 0), (0, 0, 10), 45
    )
    return {"shape": shape_metrics(twisted)}


@case("extrude-linear-with-rotation/face-with-hole")
def extrude_linear_with_rotation_face_with_hole() -> dict:
    twisted = Solid.extrude_linear_with_rotation(
        _plate_with_hole(), (0, 0, 0), (0, 0, 8), 30
    )
    return {"shape": shape_metrics(twisted)}


@case("extrude-taper/prism")
def extrude_taper_prism() -> dict:
    tapered = Solid.extrude_taper(Face.make_rect(10, 10), (0, 0, 5), 10)
    return {"shape": shape_metrics(tapered)}


@case("extrude-taper/hole-flipped")
def extrude_taper_hole_flipped() -> dict:
    tapered = Solid.extrude_taper(_plate_with_hole(), (0, 0, 5), 10)
    return {"shape": shape_metrics(tapered)}


@case("extrude-taper/hole-unflipped")
def extrude_taper_hole_unflipped() -> dict:
    tapered = Solid.extrude_taper(_plate_with_hole(), (0, 0, 5), 10, flip_inner=False)
    return {"shape": shape_metrics(tapered)}


@case("extrude-until/next")
def extrude_until_next() -> dict:
    target = Pos(-5, -5, 5) * Solid.make_box(10, 10, 2)
    extruded = Solid.extrude_until(Face.make_rect(4, 4), target, (0, 0, 1), Until.NEXT)
    return {"shape": shape_metrics(extruded)}


@case("extrude-until/last")
def extrude_until_last() -> dict:
    target = Pos(-5, -5, 5) * Solid.make_box(10, 10, 2)
    extruded = Solid.extrude_until(Face.make_rect(4, 4), target, (0, 0, 1), Until.LAST)
    return {"shape": shape_metrics(extruded)}


# ---- wire repairs and queries ----


@case("wire/order-edges")
def wire_order_edges() -> dict:
    scrambled = Wire([Edge.make_line((10, 6, 0), (10, 0, 0)), Edge.make_line((0, 0, 0), (10, 0, 0))])
    return {"edges": _edge_report(scrambled)}


@case("wire/order-edges-circle")
def wire_order_edges_circle() -> dict:
    return {"edges": _edge_report(Wire.make_circle(4))}


@case("wire/geom-equal")
def wire_geom_equal() -> dict:
    wire = Wire.make_rect(10, 6)
    same = Wire.make_rect(10, 6)
    other = Wire.make_rect(10, 6.5)
    return {
        "same_geometry": wire.geom_equal(same),
        "different_geometry": wire.geom_equal(other),
        "reversed_build": wire.geom_equal(Wire(wire.edges()[::-1])),
    }


@case("wire/stitch")
def wire_stitch() -> dict:
    first = Wire.make_polygon([(0, 0, 0), (10, 0, 0)], close=False)
    second = Wire.make_polygon([(10, 0, 0), (10, 6, 0), (0, 6, 0)], close=False)
    stitched = first.stitch(second)
    return {"shape": shape_metrics(stitched), "edges": _edge_report(stitched)}


@case("wire/trim-positions")
def wire_trim_positions() -> dict:
    trimmed = _open_polyline().trim(0.25, 0.75)
    return {"shape": shape_metrics(trimmed), "edges": _edge_report(trimmed)}


@case("wire/trim-single-edge")
def wire_trim_single_edge() -> dict:
    trimmed = Wire([Edge.make_line((0, 0, 0), (10, 0, 0))]).trim(0.2, 0.6)
    return {"shape": shape_metrics(trimmed), "edges": _edge_report(trimmed)}


@case("wire/trim-points")
def wire_trim_points() -> dict:
    trimmed = _open_polyline().trim((4, 0, 0), (10, 3, 0))
    return {"shape": shape_metrics(trimmed), "edges": _edge_report(trimmed)}


@case("wire/fix-degenerate-edges")
def wire_fix_degenerate_edges() -> dict:
    wire = _degenerate_wire()
    fixed = wire.fix_degenerate_edges(0.001)
    return {
        "before": len(wire.edges()),
        "after": len(fixed.edges()),
        "shape": shape_metrics(fixed),
    }


@case("wire/order-chamfer-edges")
def wire_order_chamfer_edges() -> dict:
    wire = Wire.make_rect(10, 6)
    first, second = wire.edges()[0], wire.edges()[1]
    unchanged = Wire.order_chamfer_edges(None, (first, second))
    swapped = Wire.order_chamfer_edges(second, (first, second))
    return {
        "unchanged": [vec(edge.center()) for edge in unchanged],
        "swapped": [vec(edge.center()) for edge in swapped],
    }
