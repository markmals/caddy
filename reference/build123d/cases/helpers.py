"""Oracle cases for build123d's topology helper functions and the shape members around them.

Covers the module-level helpers (`edges_to_wires`, `topo_explore_common_vertex`,
`topo_explore_connected_edges`, `topo_distance_to`, `new_edges`, `delta`), `Shape.as_shape`,
and the per-shape members Caddy ports alongside them: `compute_volume`, `global_location`,
`to_splines`, `do_children_intersect`, the location and tangent helpers of 1D shapes, and the
axis/curve intersection finders.

Several helpers return unordered collections (build123d collects them in a `set`), so those
cases sort what they record by coordinate and the Caddy side sorts the same way.
"""

from __future__ import annotations

from typing import Any

from build123d import (
    Axis,
    Box,
    Compound,
    ContinuityLevel,
    Cylinder,
    Edge,
    Face,
    Plane,
    Pos,
    Rot,
    Solid,
    Vector,
    Vertex,
    Wire,
)
from build123d.topology import (
    Shape,
    delta,
    edges_to_wires,
    new_edges,
    topo_distance_to,
    topo_explore_common_vertex,
    topo_explore_connected_edges,
)

from oracle import case, location, vec


def sorted_vectors(points: list[Vector]) -> list[list[float]]:
    """Points in a stable order, for helpers whose own order is not defined."""
    return sorted(vec(point) for point in points)


def centers(shapes: list[Shape]) -> list[list[float]]:
    """Shape centres in a stable order."""
    return sorted(vec(shape.center()) for shape in shapes)


def ends(edges: list[Edge]) -> list[list[float]]:
    """Each edge as its two end points, in the order the edges came in."""
    return [vec(edge @ 0) + vec(edge @ 1) for edge in edges]


@case("edges-to-wires/box-face")
def edges_to_wires_box_face() -> dict[str, Any]:
    """The four edges of a face join into one closed wire."""
    face = Box(2, 3, 4).faces().sort_by(Axis.Z)[-1]
    wires = edges_to_wires(face.edges())
    return {
        "count": len(wires),
        "lengths": [wire.length for wire in wires],
        "closed": [wire.is_closed for wire in wires],
    }


@case("edges-to-wires/two-chains")
def edges_to_wires_two_chains() -> dict[str, Any]:
    """Edges that do not touch end up in separate wires, longest chain first."""
    chain = [
        Edge.make_line((0, 0), (1, 0)),
        Edge.make_line((1, 0), (1, 1)),
        Edge.make_line((5, 5), (6, 5)),
    ]
    wires = edges_to_wires(chain)
    return {
        "count": len(wires),
        "lengths": sorted(wire.length for wire in wires),
        "edge_counts": sorted(len(wire.edges()) for wire in wires),
    }


@case("edges-to-wires/tolerance")
def edges_to_wires_tolerance() -> dict[str, Any]:
    """A gap smaller than the tolerance still joins the edges."""
    gapped = [Edge.make_line((0, 0), (1, 0)), Edge.make_line((1.0005, 0), (2, 0))]
    return {
        "default": len(edges_to_wires(gapped)),
        "loose": len(edges_to_wires(gapped, tol=1e-2)),
    }


@case("topo-explore/common-vertex")
def topo_explore_common_vertex_box() -> dict[str, Any]:
    """Adjacent edges share a vertex; opposite edges of a face do not."""
    face = Box(2, 2, 2).faces().sort_by(Axis.Z)[-1]
    edges = face.edges().sort_by(Axis.X)
    adjacent = topo_explore_common_vertex(edges[0], edges[1])
    opposite = topo_explore_common_vertex(edges[0], edges[-1])
    return {
        "adjacent": None if adjacent is None else vec(adjacent.center()),
        "opposite_found": opposite is not None,
    }


@case("topo-explore/connected-edges")
def topo_explore_connected_edges_box() -> dict[str, Any]:
    """Four edges of a box meet the one picked, all of them at a hard corner (C0 only)."""
    box = Solid.make_box(1, 2, 3)
    edge = box.edges().sort_by(Axis.Z)[0]
    at_c0 = topo_explore_connected_edges(edge, box)
    at_c1 = topo_explore_connected_edges(edge, box, ContinuityLevel.C1)
    return {
        "c0_count": len(at_c0),
        "c0_centers": centers(list(at_c0)),
        "c1_count": len(at_c1),
    }


@case("topo-explore/connected-edges-tangent")
def topo_explore_connected_edges_tangent() -> dict[str, Any]:
    """A line and the arc tangent to it meet at C1 but not at C2."""
    wire = Wire(
        [Edge.make_line((0, 0), (5, 0)), Edge.make_tangent_arc((5, 0), (1, 0), (8, 3))]
    )
    line = wire.edges().sort_by(Axis.X)[0]
    return {
        "c0_count": len(topo_explore_connected_edges(line, wire)),
        "c1_count": len(topo_explore_connected_edges(line, wire, ContinuityLevel.C1)),
        "c2_count": len(topo_explore_connected_edges(line, wire, ContinuityLevel.C2)),
        "c1_centers": centers(
            list(topo_explore_connected_edges(line, wire, ContinuityLevel.C1))
        ),
    }


@case("topo-explore/connected-edges-moved")
def topo_explore_connected_edges_moved() -> dict[str, Any]:
    """A moved copy of an edge reports its neighbours in the moved frame."""
    box = Solid.make_box(1, 2, 3)
    edge = box.edges().sort_by(Axis.Z)[0]
    moved = edge.moved(Pos(10, 0, 0))
    connected = topo_explore_connected_edges(moved, box)
    return {"count": len(connected), "centers": centers(list(connected))}


@case("topo-distance/box-faces")
def topo_distance_box_faces() -> dict[str, Any]:
    """Faces of a box are all neighbours of the top face except the bottom one."""
    box = Box(2, 2, 2)
    top = box.faces().sort_by(Axis.Z)[-1]
    key = topo_distance_to(top)
    return {
        "distances": sorted(key(face) for face in box.faces()),
        "grouped": [
            len(group) for group in box.faces().group_by(topo_distance_to(top))
        ],
    }


@case("topo-distance/box-vertices")
def topo_distance_box_vertices() -> dict[str, Any]:
    """Vertices of a box sit at 0, 1, 2 and 3 edges from one corner."""
    box = Box(2, 2, 2)
    corner = box.vertices().sort_by(Axis.X).sort_by(Axis.Y).sort_by(Axis.Z)[0]
    key = topo_distance_to(corner)
    return {"distances": sorted(key(vertex) for vertex in box.vertices())}


@case("topo-distance/box-edges")
def topo_distance_box_edges() -> dict[str, Any]:
    """Edges of a box, measured from one of them through the vertices they share."""
    box = Box(2, 2, 2)
    start = box.edges().sort_by(Axis.Z)[0]
    key = topo_distance_to(start)
    return {"distances": sorted(key(edge) for edge in box.edges())}


@case("topo-distance/two-references")
def topo_distance_two_references() -> dict[str, Any]:
    """Several reference faces all sit at zero, and the rest grow out from both."""
    box = Box(2, 2, 2)
    faces = box.faces()
    references = [faces.sort_by(Axis.Z)[-1], faces.sort_by(Axis.Z)[0]]
    key = topo_distance_to(references)
    return {"distances": sorted(key(face) for face in box.faces())}


@case("as-shape/point-and-location")
def as_shape_point_and_location() -> dict[str, Any]:
    """A vector and a location both become a vertex at their position."""
    from_vector = Shape.as_shape(Vector(1, 2, 3))
    from_location = Shape.as_shape(Pos(4, 5, 6))
    return {
        "vector_type": from_vector.shape_type,
        "vector_point": vec(from_vector.center()),
        "location_type": from_location.shape_type,
        "location_point": vec(from_location.center()),
    }


@case("as-shape/axis-and-plane")
def as_shape_axis_and_plane() -> dict[str, Any]:
    """An axis becomes an unbounded edge and a plane an unbounded face."""
    axis = Axis((1, 2, 3), (0, 0, 1))
    plane = Plane(origin=(0, 0, 5), z_dir=(0, 0, 1))
    edge = Shape.as_shape(axis)
    face = Shape.as_shape(plane)
    return {
        "axis_type": edge.shape_type,
        "axis_geom_type": edge.geom_type.name,
        "axis_distances": [
            edge.distance_to(Vector(1, 2, 3)),
            edge.distance_to(Vector(1, 2, 500)),
            edge.distance_to(Vector(4, 2, 3)),
        ],
        "plane_type": face.shape_type,
        "plane_geom_type": face.geom_type.name,
        "plane_distances": [
            face.distance_to(Vector(7, -8, 5)),
            face.distance_to(Vector(0, 0, 9)),
        ],
    }


@case("as-shape/shape-passes-through")
def as_shape_shape_passes_through() -> dict[str, Any]:
    """A shape is returned as it is."""
    box = Box(1, 1, 1)
    return {"same": Shape.as_shape(box) is box}


@case("compute-volume/every-dimension")
def compute_volume_every_dimension() -> dict[str, Any]:
    """`compute_volume` measures each shape in its own dimension."""
    box = Box(2, 3, 4)
    shell = Solid.make_box(2, 3, 4).shell()
    return {
        "vertex": box.vertices()[0].compute_volume(),
        "edge": box.edges().sort_by(Axis.Z)[0].compute_volume(),
        "wire": box.faces().sort_by(Axis.Z)[-1].outer_wire().compute_volume(),
        "face": box.faces().sort_by(Axis.Z)[-1].compute_volume(),
        "shell": shell.compute_volume(),
        "solid": box.compute_volume(),
        "compound": Compound([Solid.make_box(1, 1, 1)]).compute_volume(),
    }


@case("global-location/located-shapes")
def global_location_located_shapes() -> dict[str, Any]:
    """The world placement of a shape and of a solid inside a placed compound."""
    solid = Solid.make_box(1, 1, 1).locate(Pos(1, 2, 3) * Rot(0, 0, 30))
    nested = Compound([Solid.make_box(1, 1, 1).locate(Pos(1, 2, 3))]).locate(
        Pos(10, 0, 0)
    )
    return {
        "solid": location(solid.global_location),
        "nested_child": location(nested.solids()[0].global_location),
    }


@case("to-splines/cylinder")
def to_splines_cylinder() -> dict[str, Any]:
    """Approximating a cylinder turns its surfaces into splines but keeps its size."""
    splined = Cylinder(1, 2).to_splines()
    return {
        "surface_types": sorted(face.geom_type.name for face in splined.faces()),
        "volume": splined.volume,
        "area": splined.area,
        "face_count": len(splined.faces()),
    }


@case("to-splines/degree-and-tolerance")
def to_splines_degree_and_tolerance() -> dict[str, Any]:
    """A looser tolerance and lower degree still approximate the same solid."""
    splined = Cylinder(1, 2).to_splines(degree=5, tolerance=1e-2)
    return {"volume": splined.volume, "face_count": len(splined.faces())}


@case("do-children-intersect/disjoint")
def do_children_intersect_disjoint() -> dict[str, Any]:
    """Boxes side by side do not intersect."""
    assembly = Compound(
        children=[Solid.make_box(1, 1, 1), Solid.make_box(1, 1, 1).locate(Pos(2, 0, 0))]
    )
    intersecting, _pair, volume = assembly.do_children_intersect()
    return {"intersect": intersecting, "volume": volume}


@case("do-children-intersect/overlapping")
def do_children_intersect_overlapping() -> dict[str, Any]:
    """Overlapping boxes report the shared volume."""
    assembly = Compound(
        children=[Solid.make_box(2, 2, 2), Solid.make_box(2, 2, 2).locate(Pos(1, 0, 0))]
    )
    intersecting, pair, volume = assembly.do_children_intersect()
    return {
        "intersect": intersecting,
        "volume": volume,
        "pair_centers": centers([shape for shape in pair if shape is not None]),
    }


@case("do-children-intersect/touching")
def do_children_intersect_touching() -> dict[str, Any]:
    """Boxes sharing a face touch without sharing any volume."""
    assembly = Compound(
        children=[Solid.make_box(1, 1, 1), Solid.make_box(1, 1, 1).locate(Pos(1, 0, 0))]
    )
    intersecting, _pair, volume = assembly.do_children_intersect()
    return {"intersect": intersecting, "volume": volume}


@case("do-children-intersect/include-parent")
def do_children_intersect_include_parent() -> dict[str, Any]:
    """The compound itself overlaps every child, so including it always intersects."""
    assembly = Compound(
        children=[Solid.make_box(1, 1, 1), Solid.make_box(1, 1, 1).locate(Pos(2, 0, 0))]
    )
    intersecting, _pair, volume = assembly.do_children_intersect(include_parent=True)
    return {"intersect": intersecting, "volume": volume}


@case("distribute-locations/edge")
def distribute_locations_edge() -> dict[str, Any]:
    """Five locations spread evenly along a circle, oriented by the Frenet frame."""
    circle = Edge.make_circle(5)
    spread = circle.distribute_locations(5)
    positions_only = circle.distribute_locations(3, positions_only=True)
    return {
        "positions": [vec(loc.position) for loc in spread],
        "orientations": [vec(loc.orientation) for loc in spread],
        "plain_positions": [vec(loc.position) for loc in positions_only],
        "plain_orientations": [vec(loc.orientation) for loc in positions_only],
    }


@case("distribute-locations/partial-range")
def distribute_locations_partial_range() -> dict[str, Any]:
    """`start` and `stop` restrict the span the locations are spread over."""
    line = Edge.make_line((0, 0, 0), (10, 0, 0))
    spread = line.distribute_locations(4, start=0.25, stop=0.75)
    return {"positions": [vec(loc.position) for loc in spread]}


@case("locations/along-wire")
def locations_along_wire() -> dict[str, Any]:
    """Locations at given parameters and at given lengths along a wire."""
    wire = Wire(
        [Edge.make_line((0, 0, 0), (4, 0, 0)), Edge.make_line((4, 0, 0), (4, 3, 0))]
    )
    from build123d import PositionMode

    return {
        "by_parameter": [
            vec(loc.position) for loc in wire.locations([0, 0.25, 0.5, 1])
        ],
        "by_length": [
            vec(loc.position)
            for loc in wire.locations([0, 2, 5, 7], PositionMode.LENGTH)
        ],
    }


@case("perpendicular-line/circle")
def perpendicular_line_circle() -> dict[str, Any]:
    """A line across a circle at a quarter of the way round."""
    circle = Edge.make_circle(5)
    line = circle.perpendicular_line(4, 0.25)
    other_plane = circle.perpendicular_line(4, 0.25, Plane.XZ)
    return {
        "ends": vec(line @ 0) + vec(line @ 1),
        "length": line.length,
        "other_plane_ends": vec(other_plane @ 0) + vec(other_plane @ 1),
    }


@case("tangent-angle-at/circle")
def tangent_angle_at_circle() -> dict[str, Any]:
    """The tangent of a circle turns through a full revolution."""
    circle = Edge.make_circle(2)
    line = Edge.make_line((0, 0, 0), (1, 1, 0))
    return {
        "circle": [circle.tangent_angle_at(u / 8) for u in range(8)],
        "line": line.tangent_angle_at(),
        "line_in_xz": line.tangent_angle_at(0.5, plane=Plane.XZ),
    }


@case("curvature-comb/circle")
def curvature_comb_circle() -> dict[str, Any]:
    """A circle has constant curvature, so every tooth is the same length."""
    comb = Edge.make_circle(5).curvature_comb(count=8)
    return {"count": len(comb), "lengths": [edge.length for edge in comb], "ends": ends(list(comb))}


@case("curvature-comb/spline")
def curvature_comb_spline() -> dict[str, Any]:
    """A spline's teeth vary with its curvature and flip at the inflection."""
    spline = Edge.make_spline([(0, 0), (3, 2), (6, -2), (9, 0)])
    comb = spline.curvature_comb(count=10, max_tooth_size=2)
    return {"count": len(comb), "lengths": [edge.length for edge in comb], "ends": ends(list(comb))}


@case("curvature-comb/line-has-no-teeth")
def curvature_comb_line_has_no_teeth() -> dict[str, Any]:
    """A straight edge has no curvature, so the comb is empty."""
    return {"count": len(Edge.make_line((0, 0, 0), (5, 0, 0)).curvature_comb(count=5))}


@case("find-intersection-points/edge-edge")
def find_intersection_points_edge_edge() -> dict[str, Any]:
    """A line crossing a circle twice."""
    circle = Edge.make_circle(5)
    line = Edge.make_line((-8, 3, 0), (8, 3, 0))
    return {"points": sorted_vectors(list(circle.find_intersection_points(line)))}


@case("find-intersection-points/edge-axis")
def find_intersection_points_edge_axis() -> dict[str, Any]:
    """An axis is taken as a line long enough to reach across the edge."""
    circle = Edge.make_circle(5)
    return {
        "points": sorted_vectors(list(circle.find_intersection_points(Axis.X))),
        "offset": sorted_vectors(
            list(circle.find_intersection_points(Axis((0, 3, 0), (1, 0, 0))))
        ),
    }


@case("find-intersection-points/self-crossing")
def find_intersection_points_self_crossing() -> dict[str, Any]:
    """A spline that crosses itself reports where it does."""
    spline = Edge.make_spline([(-4, -2), (4, 2), (-4, 2), (4, -2)])
    return {"points": sorted_vectors(list(spline.find_intersection_points()))}


@case("find-intersection-points/no-crossing")
def find_intersection_points_no_crossing() -> dict[str, Any]:
    """Curves that miss each other report nothing."""
    circle = Edge.make_circle(2)
    line = Edge.make_line((-8, 6, 0), (8, 6, 0))
    return {"count": len(circle.find_intersection_points(line))}


@case("find-intersection-points/face-and-solid")
def find_intersection_points_face_and_solid() -> dict[str, Any]:
    """An axis through a face and through a box, with the normal at every hit."""
    face = Face(Plane.XY)
    box = Solid.make_box(2, 2, 2, Plane((-1, -1, -1)))
    axis = Axis((0, 0, -10), (0, 0, 1))
    return {
        "face": [vec(point) + vec(normal) for point, normal in face.find_intersection_points(axis)],
        "solid": [vec(point) + vec(normal) for point, normal in box.find_intersection_points(axis)],
        "missing": len(box.find_intersection_points(Axis((9, 9, -10), (0, 0, 1)))),
    }


@case("find-tangent/circle-and-line")
def find_tangent_circle_and_line() -> dict[str, Any]:
    """Where a circle's tangent reaches a given angle, and a line's single answer."""
    circle = Edge.make_circle(5)
    line = Edge.make_line((0, 0, 0), (1, 1, 0))
    return {
        "circle_90": sorted(circle.find_tangent(90)),
        "circle_180": sorted(circle.find_tangent(180)),
        "line_45": line.find_tangent(45),
        "line_90": line.find_tangent(90),
    }


@case("curve-location-at/joined-edges")
def curve_location_at_joined_edges() -> dict[str, Any]:
    """`Curve ^ position` reads the frame off the wire its edges join into."""
    from build123d import Curve

    curve = Curve() + [
        Edge.make_line((0, 0, 0), (4, 0, 0)),
        Edge.make_line((4, 0, 0), (4, 3, 0)),
    ]
    return {
        "start": location(curve ^ 0),
        "middle": location(curve ^ 0.5),
        "end": location(curve ^ 1),
    }


@case("new-edges/box-and-cylinder")
def new_edges_box_and_cylinder() -> dict[str, Any]:
    """Fusing a cylinder into a box draws new edges where the two meet."""
    box = Solid.make_box(4, 4, 1, Plane((-2, -2, 0)))
    cylinder = Solid.make_cylinder(1, 3, Plane((0, 0, -1)))
    combined = box.fuse(cylinder)
    found = new_edges(box, cylinder, combined=combined)
    return {
        "count": len(found),
        "lengths": sorted(edge.length for edge in found),
        "centers": centers(list(found)),
    }


@case("new-edges/unlisted-operand")
def new_edges_unlisted_operand() -> dict[str, Any]:
    """Every edge of an operand left out of `objects` counts as new."""
    first = Solid.make_box(1, 1, 1)
    combined = first.fuse(Solid.make_box(1, 1, 1).locate(Pos(2, 0, 0)))
    return {"count": len(new_edges(first, combined=combined))}


@case("delta/removes-shared-shapes")
def delta_removes_shared_shapes() -> dict[str, Any]:
    """`delta` keeps the shapes of the first list that the second does not hold."""
    cylinder = Solid.make_cylinder(1, 5)
    sphere = Solid.make_sphere(2)
    cone = Solid.make_cone(2, 1, 2)
    left = delta([cylinder, sphere, cone], [sphere, cone])
    return {
        "count": len(left),
        "is_cylinder": left[0] is cylinder,
        "volume": left[0].volume,
        "empty": len(delta([sphere], [sphere])),
        "all_kept": len(delta([sphere, cone], [])),
    }


@case("errors/helpers")
def errors_helpers() -> dict[str, Any]:
    """The messages build123d raises for misuse, recorded as the error type only."""
    box = Box(1, 1, 1)
    results: dict[str, Any] = {}
    try:
        topo_distance_to([])
    except ValueError:
        results["empty_reference"] = True
    try:
        topo_distance_to([box.faces()[0], box.edges()[0]])
    except ValueError:
        results["mixed_types"] = True
    try:
        topo_distance_to(box)
    except ValueError:
        results["unsupported_type"] = True
    try:
        Edge.make_circle(1).distribute_locations(1)
    except ValueError:
        results["count_too_small"] = True
    try:
        Edge.make_line((0, 0, 0), (1, 1, 1)).curvature_comb()
    except ValueError:
        results["comb_not_planar"] = True
    try:
        Edge.make_circle(1).find_intersection_points(
            Edge.make_circle(1, Plane.YZ.offset(5))
        )
    except ValueError:
        results["not_coplanar"] = True
    return results
