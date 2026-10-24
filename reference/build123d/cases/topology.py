"""Topology oracle: exploration, properties, identity, placement, booleans, selectors and the
1D/2D queries that `packages/caddy/src/topology` ports.

Every shape here is built from a primitive maker or an explicit wire so the TypeScript side can
reproduce the same geometry through `@roonieone/occt-native` alone, without depending on Caddy's
part or curve libraries.
"""

from __future__ import annotations

from collections.abc import Iterable

from build123d import (
    Axis,
    CenterOf,
    Compound,
    Edge,
    Face,
    GeomType,
    FrameMethod,
    Location,
    Matrix,
    Plane,
    Pos,
    PositionMode,
    Shape,
    ShapeList,
    Solid,
    SortBy,
    Vector,
    Wire,
)
from OCP.BRepAlgoAPI import BRepAlgoAPI_Common, BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse

from oracle import case, location, shape_metrics, vec

# ---- shapes under test ----


def _box() -> Solid:
    return Solid.make_box(10, 6, 4)


def _cylinder() -> Solid:
    return Solid.make_cylinder(3, 8)


def _sphere() -> Solid:
    return Solid.make_sphere(5)


def _notched_box() -> Shape:
    """A box with a cylindrical notch cut out of one vertical corner edge."""
    return _box() - Pos(10, 6, 0) * Solid.make_cylinder(2, 4)


def _plate_with_hole() -> Face:
    outer = Wire.make_polygon([(0, 0, 0), (20, 0, 0), (20, 12, 0), (0, 12, 0)])
    inner = Wire.make_circle(3, Plane(origin=(10, 6, 0)))
    return Face(outer, [inner])


def _polygon() -> Wire:
    return Wire.make_polygon([(0, 0, 0), (10, 0, 0), (10, 5, 0), (0, 5, 0)], close=False)


# ---- serializers ----


def _counts(shape: Shape) -> dict[str, int]:
    return {
        "vertices": len(shape.vertices()),
        "edges": len(shape.edges()),
        "wires": len(shape.wires()),
        "faces": len(shape.faces()),
        "shells": len(shape.shells()),
        "solids": len(shape.solids()),
    }


def _centers(shapes: Iterable[Shape]) -> list[list[float]]:
    return [vec(shape.center()) for shape in shapes]


def _bounds(shape: Shape, optimal: bool = True) -> dict[str, list[float]]:
    box = shape.bounding_box(optimal=optimal)
    return {"min": vec(box.min), "max": vec(box.max), "size": vec(box.size)}


def _placed(shape: Shape) -> dict:
    return {"shape": shape_metrics(shape), "location": location(shape.location)}


def _grouped(groups) -> dict:
    return {
        "keys": [key for key, _ in groups.key_to_group_index],
        "sizes": [len(group) for group in groups.groups],
        "centers": [_centers(group) for group in groups.groups],
    }


# ---- exploration ----


@case("explore/box")
def explore_box() -> dict:
    solid = _box()
    return {
        "counts": _counts(solid),
        "vertices": _centers(solid.vertices()),
        "edge_centers": _centers(solid.edges()),
        "edge_lengths": [edge.length for edge in solid.edges()],
        "face_centers": _centers(solid.faces()),
        "face_areas": [face.area for face in solid.faces()],
    }


@case("explore/cylinder")
def explore_cylinder() -> dict:
    solid = _cylinder()
    return {
        "counts": _counts(solid),
        "vertices": _centers(solid.vertices()),
        "edge_centers": _centers(solid.edges()),
        "edge_geom_types": [edge.geom_type.name for edge in solid.edges()],
        "face_centers": _centers(solid.faces()),
        "face_geom_types": [face.geom_type.name for face in solid.faces()],
    }


@case("explore/sphere")
def explore_sphere() -> dict:
    """A sphere's pole seam is a degenerate edge, which `edges()` drops."""
    solid = _sphere()
    return {
        "counts": _counts(solid),
        "all_edge_count": len(solid.entities("Edge")),
        "edge_lengths": [edge.length for edge in solid.edges()],
        "face_centers": _centers(solid.faces()),
    }


@case("explore/boolean")
def explore_boolean() -> dict:
    solid = _notched_box()
    return {
        "class_name": type(solid).__name__,
        "counts": _counts(solid),
        "face_centers": _centers(solid.faces()),
        "face_geom_types": [face.geom_type.name for face in solid.faces()],
        "edge_lengths": [edge.length for edge in solid.edges()],
    }


@case("explore/compound")
def explore_compound() -> dict:
    group = Compound([_box(), Pos(20, 0, 0) * _cylinder()])
    return {
        "length": len(group),
        "counts": _counts(group),
        "child_classes": [type(child).__name__ for child in group],
        "top_level_classes": [type(s).__name__ for s in group.get_top_level_shapes()],
        "solid_count": len(group.get_type(Solid)),
        "volume": group.volume,
        "center": vec(group.center()),
    }


@case("explore/nested-compound")
def explore_nested_compound() -> dict:
    nested = Compound([Compound([_cylinder()]), _box()])
    return {
        "length": len(nested),
        "compound_count": len(nested.compounds()),
        "top_level_classes": [type(s).__name__ for s in nested.get_top_level_shapes()],
        "top_level_centers": _centers(nested.get_top_level_shapes()),
        "unwrapped_class": type(Compound([_box()]).unwrap()).__name__,
        "unwrapped_shallow_class": type(Compound([Compound([_box()])]).unwrap(False)).__name__,
        "volume": nested.volume,
    }


@case("explore/wire-edges")
def explore_wire_edges() -> dict:
    """Wire edges come back in connection order, not in exploration order."""
    wire = _polygon()
    return {
        "starts": [vec(edge @ 0) for edge in wire.edges()],
        "ends": [vec(edge @ 1) for edge in wire.edges()],
        "lengths": [edge.length for edge in wire.edges()],
        "vertices": _centers(wire.vertices()),
    }


@case("explore/singular")
def explore_singular() -> dict:
    solid = _box()
    face = solid.faces()[0]
    return {
        "face_wire_center": vec(face.wire().center()),
        "shell_face_count": len(solid.shell().faces()),
        "solid_volume": solid.solid().volume,
        "vertex_point": vec(face.edges()[0].vertices()[0].center()),
    }


# ---- properties ----


@case("properties/box")
def properties_box() -> dict:
    solid = _box()
    return {
        "shape": shape_metrics(solid),
        "center_mass": vec(solid.center(CenterOf.MASS)),
        "center_bounding_box": vec(solid.center(CenterOf.BOUNDING_BOX)),
        "bounds_optimal": _bounds(solid),
        "bounds_coarse": _bounds(solid, optimal=False),
        "is_valid": solid.is_valid,
        "shape_type": solid.shape_type,
        "geom_type": solid.geom_type.name,
    }


@case("properties/cylinder")
def properties_cylinder() -> dict:
    solid = _cylinder()
    return {
        "shape": shape_metrics(solid),
        "center_mass": vec(solid.center(CenterOf.MASS)),
        "center_bounding_box": vec(solid.center(CenterOf.BOUNDING_BOX)),
        "bounds_optimal": _bounds(solid),
        "bounds_coarse": _bounds(solid, optimal=False),
    }


@case("properties/face")
def properties_face() -> dict:
    top = _box().faces().sort_by(Axis.Z)[-1]
    side = _cylinder().faces().filter_by(GeomType.CYLINDER)[0]
    return {
        "top_area": top.area,
        "top_volume": top.volume,
        "top_center_geometry": vec(top.center(CenterOf.GEOMETRY)),
        "top_center_mass": vec(top.center(CenterOf.MASS)),
        "top_geom_type": top.geom_type.name,
        "side_area": side.area,
        "side_center_geometry": vec(side.center(CenterOf.GEOMETRY)),
        "side_center_mass": vec(side.center(CenterOf.MASS)),
        "side_geom_type": side.geom_type.name,
        "side_bounds": _bounds(side),
    }


@case("properties/edge")
def properties_edge() -> dict:
    edge = Edge.make_line((1, 2, 3), (7, 10, 3))
    arc = Edge.make_circle(5, start_angle=0, end_angle=90)
    return {
        "line_length": edge.length,
        "line_volume": edge.volume,
        "line_area": edge.area,
        "line_center_geometry": vec(edge.center(CenterOf.GEOMETRY)),
        "line_center_mass": vec(edge.center(CenterOf.MASS)),
        "line_center_bounding_box": vec(edge.center(CenterOf.BOUNDING_BOX)),
        "line_is_closed": edge.is_closed,
        "arc_length": arc.length,
        "arc_center_geometry": vec(arc.center(CenterOf.GEOMETRY)),
        "arc_center_mass": vec(arc.center(CenterOf.MASS)),
        "arc_is_closed": arc.is_closed,
        "circle_is_closed": Edge.make_circle(5).is_closed,
    }


@case("properties/vertex")
def properties_vertex() -> dict:
    vertex = _box().vertices().sort_by(Axis.X)[-1]
    return {
        "center": vec(vertex.center()),
        "coordinates": [vertex.X, vertex.Y, vertex.Z],
        "volume": vertex.volume,
        "bounds": _bounds(vertex),
        "sum": vec((vertex + Vector(1, 2, 3)).center()),
        "difference": vec((vertex - Vector(1, 2, 3)).center()),
    }


@case("properties/shell")
def properties_shell() -> dict:
    shell = _box().shells()[0]
    return {
        "area": shell.area,
        "volume": shell.volume,
        "center": vec(shell.center()),
        "is_manifold": shell.is_manifold,
        "face_count": len(shell.faces()),
    }


@case("properties/compound")
def properties_compound() -> dict:
    group = Compound([_box(), Pos(20, 0, 0) * _cylinder()])
    faces = Compound(_box().faces()[:2])
    return {
        "volume": group.volume,
        "area": group.area,
        "center_mass": vec(group.center(CenterOf.MASS)),
        "center_bounding_box": vec(group.center(CenterOf.BOUNDING_BOX)),
        "bounds": _bounds(group),
        "face_compound_center": vec(faces.center()),
        "face_compound_volume": faces.volume,
    }


@case("properties/distance")
def properties_distance() -> dict:
    solid = _box()
    other = Pos(20, 0, 0) * _cylinder()
    first, second = solid.closest_points(other)
    return {
        "distance": solid.distance(other),
        "distance_to_point": solid.distance_to((20, 3, 2)),
        "closest_on_self": vec(first),
        "closest_on_other": vec(second),
        "distances": list(solid.distances(other, Pos(0, 20, 0) * _cylinder())),
    }


# ---- identity ----


@case("identity/relations")
def identity_relations() -> dict:
    solid = _box()
    first = solid.faces()[0]
    again = solid.faces()[0]
    moved = Pos(1, 0, 0) * solid
    twin = Solid.make_box(10, 6, 4)
    return {
        "same_self": solid.is_same(solid),
        "equal_self": solid.is_equal(solid),
        "same_refetched_face": first.is_same(again),
        "equal_refetched_face": first.is_equal(again),
        "hash_refetched_face": hash(first) == hash(again),
        "same_moved": moved.is_same(solid),
        "hash_moved": hash(moved) == hash(solid),
        "same_twin": twin.is_same(solid),
        "equality_operator": first == again,
        "same_face_from_shell": solid.shells()[0].faces()[0].is_same(first),
    }


@case("identity/reversed")
def identity_reversed() -> dict:
    edge = Edge.make_line((0, 0, 0), (10, 0, 0))
    backwards = edge.reversed()
    return {
        "same": backwards.is_same(edge),
        "equal": backwards.is_equal(edge),
        "hash": hash(backwards) == hash(edge),
        "start": vec(backwards @ 0),
        "end": vec(backwards @ 1),
        "is_forward": backwards.is_forward,
        "length": backwards.length,
    }


# ---- placement ----


@case("transform/moved")
def transform_moved() -> dict:
    return _placed(_box().moved(Location((1, 2, 3), (0, 0, 30))))


@case("transform/moved-twice")
def transform_moved_twice() -> dict:
    once = _box().moved(Location((1, 2, 3)))
    return _placed(once.moved(Location((0, 0, 5), (0, 45, 0))))


@case("transform/located")
def transform_located() -> dict:
    once = _box().moved(Location((1, 2, 3)))
    return _placed(once.located(Location((0, 0, 5), (0, 45, 0))))


@case("transform/translate")
def transform_translate() -> dict:
    return _placed(_box().translate((3, -2, 1)))


@case("transform/translate-geometry")
def transform_translate_geometry() -> dict:
    return _placed(_box().translate((3, -2, 1), transform=True))


@case("transform/rotate")
def transform_rotate() -> dict:
    return _placed(_box().rotate(Axis.Z, 35))


@case("transform/rotate-geometry")
def transform_rotate_geometry() -> dict:
    return _placed(_box().rotate(Axis((1, 1, 0), (0, 1, 1)), 35, transform=True))


@case("transform/scale-uniform")
def transform_scale_uniform() -> dict:
    return _placed(_box().scale(2))


@case("transform/scale-about")
def transform_scale_about() -> dict:
    return _placed(_box().scale(0.5, about=(10, 6, 4)))


@case("transform/scale-nonuniform")
def transform_scale_nonuniform() -> dict:
    scaled = _cylinder().scale((2, 1, 0.5))
    return {
        **_placed(scaled),
        "face_geom_types": sorted(face.geom_type.name for face in scaled.faces()),
    }


@case("transform/mirror")
def transform_mirror() -> dict:
    return _placed(_box().mirror(Plane.YZ))


@case("transform/mirror-default")
def transform_mirror_default() -> dict:
    return _placed(_box().mirror())


@case("transform/transformed")
def transform_transformed() -> dict:
    return _placed(_box().transformed(rotate=(10, 20, 30), offset=(1, 2, 3)))


@case("transform/transform-shape")
def transform_transform_shape() -> dict:
    matrix = Matrix(Location((2, 0, 0), (0, 0, 90)).wrapped.Transformation())
    return _placed(_box().transform_shape(matrix))


@case("transform/transform-geometry")
def transform_transform_geometry() -> dict:
    matrix = Matrix([[1, 0.5, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]])
    sheared = _box().transform_geometry(matrix)
    return {
        **_placed(sheared),
        "face_geom_types": sorted(face.geom_type.name for face in sheared.faces()),
    }


# ---- booleans ----


@case("boolean/fuse-overlap")
def boolean_fuse_overlap() -> dict:
    fused = _box() + Pos(5, 0, 0) * _box()
    return {"class_name": type(fused).__name__, "shape": shape_metrics(fused)}


@case("boolean/fuse-disjoint")
def boolean_fuse_disjoint() -> dict:
    fused = _box() + Pos(30, 0, 0) * _box()
    return {
        "class_name": type(fused).__name__,
        "shape": shape_metrics(fused),
        "top_level_count": len(fused.get_top_level_shapes()),
    }


@case("boolean/fuse-many")
def boolean_fuse_many() -> dict:
    fused = _box().fuse(Pos(5, 0, 0) * _box(), Pos(0, 4, 0) * _box())
    return {"class_name": type(fused).__name__, "shape": shape_metrics(fused)}


@case("boolean/cut-two-pieces")
def boolean_cut_two_pieces() -> dict:
    split = _box() - Pos(4, 0, 0) * Solid.make_box(2, 6, 4)
    return {
        "class_name": type(split).__name__,
        "shape": shape_metrics(split),
        "piece_volumes": sorted(piece.volume for piece in split.solids()),
    }


@case("boolean/cut-no-tools")
def boolean_cut_no_tools() -> dict:
    """`_bool_op` with no tools hands back the single argument untouched."""
    solid = _box()
    result = solid._bool_op([solid], [], BRepAlgoAPI_Cut())
    return {
        "class_name": type(result).__name__,
        "same_as_input": result.is_same(solid),
        "volume": result.volume,
    }


@case("boolean/cut-no-tools-many-args")
def boolean_cut_no_tools_many_args() -> dict:
    solid = _box()
    other = Pos(30, 0, 0) * _cylinder()
    result = solid._bool_op([solid, other], [], BRepAlgoAPI_Cut())
    return {
        "class_name": type(result).__name__,
        "shape_type": result.shape_type,
        "volume": result.volume,
        "solid_count": len(result.solids()),
    }


@case("boolean/fuse-no-args")
def boolean_fuse_no_args() -> dict:
    """build123d reaches for args[0] before its empty-argument fuse shortcut."""
    solid = _box()
    tool = Pos(30, 0, 0) * _cylinder()
    try:
        solid._bool_op([], [tool], BRepAlgoAPI_Fuse())
    except IndexError as error:
        return {"raises": type(error).__name__}
    return {"raises": None}


@case("boolean/common-empty")
def boolean_common_empty() -> dict:
    """A common with an empty operand is build123d's null shape of the base class."""
    solid = _box()
    result = solid._bool_op([solid], [], BRepAlgoAPI_Common())
    return {"class_name": type(result).__name__, "is_null": result.is_null}


@case("boolean/fuse-faces")
def boolean_fuse_faces() -> dict:
    """Coplanar faces fuse into one face: the highest order of the inputs is 2."""
    left = Face.make_rect(10, 6)
    right = Pos(10, 0, 0) * Face.make_rect(10, 6)
    fused = left + right
    return {
        "class_name": type(fused).__name__,
        "shape_type": fused.shape_type,
        "area": fused.area,
        "edge_count": len(fused.edges()),
    }


@case("boolean/fuse-disjoint-faces")
def boolean_fuse_disjoint_faces() -> dict:
    left = Face.make_rect(10, 6)
    right = Pos(30, 0, 0) * Face.make_rect(10, 6)
    fused = left + right
    return {
        "class_name": type(fused).__name__,
        "shape_type": fused.shape_type,
        "area": fused.area,
        "face_count": len(fused.faces()),
    }


@case("boolean/intersect-solids")
def boolean_intersect_solids() -> dict:
    common = _box() & (Pos(5, 0, 0) * _box())
    return {"class_name": type(common).__name__, "shape": shape_metrics(common)}


@case("boolean/intersect-none")
def boolean_intersect_none() -> dict:
    return {"result": _box() & (Pos(30, 0, 0) * _box())}


@case("boolean/intersect-chain")
def boolean_intersect_chain() -> dict:
    common = _box().intersect(Pos(5, 0, 0) * _box(), Pos(0, 3, 0) * _box())
    return {
        "count": len(common),
        "class_names": [type(shape).__name__ for shape in common],
        "volume": sum(shape.volume for shape in common),
        "center": vec(common[0].center()),
    }


@case("boolean/intersect-compound")
def boolean_intersect_compound() -> dict:
    group = Compound([_box(), Pos(30, 0, 0) * _box()])
    common = group & (Pos(5, 0, 0) * _box())
    return {
        "class_name": type(common).__name__,
        "volume": common.volume,
        "solid_count": len(common.solids()),
    }


@case("boolean/clean")
def boolean_clean() -> dict:
    """Fusing two boxes that share a face leaves one planar face once cleaned."""
    fused = _box() + Pos(10, 0, 0) * _box()
    return {
        "face_count": len(fused.faces()),
        "edge_count": len(fused.edges()),
        "volume": fused.volume,
        "cleaned_face_count": len(fused.clean().faces()),
    }


# ---- selectors ----


@case("shapelist/filter-by-geom-type")
def shapelist_filter_by_geom_type() -> dict:
    faces = _notched_box().faces()
    return {
        "planes": _centers(faces.filter_by(GeomType.PLANE)),
        "cylinders": _centers(faces.filter_by(GeomType.CYLINDER)),
        "not_planes": _centers(faces.filter_by(GeomType.PLANE, reverse=True)),
    }


@case("shapelist/filter-by-axis")
def shapelist_filter_by_axis() -> dict:
    solid = _notched_box()
    return {
        "faces_z": _centers(solid.faces().filter_by(Axis.Z)),
        "faces_x": _centers(solid.faces().filter_by(Axis.X)),
        "edges_z": _centers(solid.edges().filter_by(Axis.Z)),
        "edges_z_reversed": _centers(solid.edges().filter_by(Axis.Z, reverse=True)),
    }


@case("shapelist/filter-by-plane")
def shapelist_filter_by_plane() -> dict:
    solid = _notched_box()
    return {
        "faces_xy": _centers(solid.faces().filter_by(Plane.XY)),
        "edges_xy": _centers(solid.edges().filter_by(Plane.XY)),
        "wires_xy": len(solid.wires().filter_by(Plane.XY)),
    }


@case("shapelist/filter-by-predicate")
def shapelist_filter_by_predicate() -> dict:
    faces = _box().faces()
    return {
        "large": _centers(faces.filter_by(lambda f: f.area > 30)),
        "small": _centers(faces.filter_by(lambda f: f.area > 30, reverse=True)),
    }


@case("shapelist/filter-by-position")
def shapelist_filter_by_position() -> dict:
    vertices = _box().vertices()
    return {
        "inclusive": _centers(vertices.filter_by_position(Axis.X, 0, 10)),
        "exclusive": _centers(vertices.filter_by_position(Axis.X, 0, 10, inclusive=(False, False))),
        "half_open": _centers(vertices.filter_by_position(Axis.X, 0, 10, inclusive=(True, False))),
        "sorted_along": _centers(vertices.filter_by_position(Axis.Y, -1, 7)),
    }


@case("shapelist/sort-by-axis")
def shapelist_sort_by_axis() -> dict:
    faces = _notched_box().faces()
    return {
        "by_z": _centers(faces.sort_by(Axis.Z)),
        "by_x_reversed": _centers(faces.sort_by(Axis.X, reverse=True)),
        "vertices_by_y": _centers(_box().vertices().sort_by(Axis.Y)),
    }


@case("shapelist/sort-by-measure")
def shapelist_sort_by_measure() -> dict:
    solid = _notched_box()
    return {
        "faces_by_area": [face.area for face in solid.faces().sort_by(SortBy.AREA)],
        "edges_by_length": [edge.length for edge in solid.edges().sort_by(SortBy.LENGTH)],
        "circles_by_radius": [
            edge.radius
            for edge in Solid.make_cone(5, 2, 8).edges().filter_by(GeomType.CIRCLE).sort_by(SortBy.RADIUS)
        ],
        "solids_by_volume": [
            s.volume
            for s in Compound([_box(), _cylinder()]).solids().sort_by(SortBy.VOLUME)
        ],
    }


@case("shapelist/sort-by-distance")
def shapelist_sort_by_distance() -> dict:
    vertices = _box().vertices()
    return {
        "from_point": _centers(vertices.sort_by_distance((0, 0, 0))),
        "from_point_reversed": _centers(vertices.sort_by_distance((0, 0, 0), reverse=True)),
        "from_shape": _centers(_box().faces().sort_by_distance(Pos(20, 3, 2) * Solid.make_box(1, 1, 1))),
    }


@case("shapelist/group-by-axis")
def shapelist_group_by_axis() -> dict:
    return {
        "vertices": _grouped(_box().vertices().group_by(Axis.Z)),
        "faces_reversed": _grouped(_notched_box().faces().group_by(Axis.Z, reverse=True)),
    }


@case("shapelist/group-by-measure")
def shapelist_group_by_measure() -> dict:
    return {
        "edges_by_length": _grouped(_box().edges().group_by(SortBy.LENGTH)),
        "faces_by_area": _grouped(_box().faces().group_by(SortBy.AREA, tol_digits=3)),
    }


@case("shapelist/set-ops")
def shapelist_set_ops() -> dict:
    solid = _box()
    faces = solid.faces()
    top = solid.faces().filter_by(Axis.Z)
    return {
        "intersection": len(faces & top),
        "difference": len(faces - top),
        "combined": len(top + solid.faces().filter_by(Axis.X)),
        "equal_self": faces == solid.faces(),
        "equal_subset": faces == top,
    }


@case("shapelist/expand-center")
def shapelist_expand_center() -> dict:
    solid = _box()
    nested = Compound([Compound([solid.faces()[0]]), solid.wires()[0]])
    expanded = ShapeList([nested]).expand()
    return {
        "expanded_classes": [type(shape).__name__ for shape in expanded],
        "expanded_centers": _centers(expanded),
        "top_level_count": len(nested.get_top_level_shapes()),
        "faces_center": vec(solid.faces().center()),
        "vertices_center": vec(solid.vertices().center()),
        "empty_center": vec(solid.compounds().center()),
    }


# ---- 1D queries ----


@case("edge/line")
def edge_line() -> dict:
    edge = Edge.make_line((1, 2, 3), (7, 10, 3))
    return {
        "length": edge.length,
        "start": vec(edge.start_point()),
        "end": vec(edge.end_point()),
        "position_at": vec(edge @ 0.25),
        "position_at_length": vec(edge.position_at(2.5, position_mode=PositionMode.LENGTH)),
        "positions": [vec(p) for p in edge.positions([0, 0.5, 1])],
        "tangent_at": vec(edge % 0.25),
        "param_at": edge.param_at(0.25),
        "param_at_point": edge.param_at_point((4, 6, 3)),
        "center": vec(edge.center()),
        "is_closed": edge.is_closed,
        "geom_type": edge.geom_type.name,
    }


@case("edge/circle")
def edge_circle() -> dict:
    edge = Edge.make_circle(5, Plane(origin=(1, 2, 3)))
    return {
        "length": edge.length,
        "radius": edge.radius,
        "arc_center": vec(edge.arc_center),
        "position_at": vec(edge @ 0.25),
        "tangent_at": vec(edge % 0.25),
        "param_at": edge.param_at(0.25),
        "param_at_point": edge.param_at_point((1, 7, 3)),
        "start": vec(edge.start_point()),
        "end": vec(edge.end_point()),
        "is_closed": edge.is_closed,
        "geom_type": edge.geom_type.name,
    }


@case("edge/arc")
def edge_arc() -> dict:
    edge = Edge.make_circle(5, start_angle=20, end_angle=160)
    return {
        "length": edge.length,
        "radius": edge.radius,
        "arc_center": vec(edge.arc_center),
        "start": vec(edge.start_point()),
        "end": vec(edge.end_point()),
        "position_at": vec(edge @ 0.25),
        "tangent_at_point": vec(edge.tangent_at(edge @ 0.25)),
        "param_at": edge.param_at(0.5),
        "param_at_point": edge.param_at_point(edge @ 0.75),
        "center_geometry": vec(edge.center()),
    }


@case("edge/derivative")
def edge_derivative() -> dict:
    edge = Edge.make_circle(5)
    return {
        "first": vec(edge.derivative_at(0.25, 1)),
        "second": vec(edge.derivative_at(0.25, 2)),
        "third": vec(edge.derivative_at(0.25, 3)),
    }


@case("wire/polygon")
def wire_polygon() -> dict:
    wire = _polygon()
    return {
        "length": wire.length,
        "is_closed": wire.is_closed,
        "start": vec(wire.start_point()),
        "end": vec(wire.end_point()),
        "position_at": vec(wire @ 0.25),
        "position_at_length": vec(
            wire.position_at(12, position_mode=PositionMode.LENGTH)
        ),
        "tangent_at": vec(wire % 0.25),
        "param_at_point": wire.param_at_point((10, 2.5, 0)),
        "center": vec(wire.center()),
        "edge_count": len(wire.edges()),
    }


@case("wire/circle")
def wire_circle() -> dict:
    wire = Wire.make_circle(4, Plane(origin=(0, 0, 2)))
    return {
        "length": wire.length,
        "radius": wire.radius,
        "is_closed": wire.is_closed,
        "position_at": vec(wire @ 0.25),
        "tangent_at": vec(wire % 0.25),
        "center": vec(wire.center()),
    }


# ---- 2D queries ----


@case("face/planar")
def face_planar() -> dict:
    face = _box().faces().sort_by(Axis.Z)[-1]
    plane = face.is_planar
    return {
        "normal_at": vec(face.normal_at()),
        "normal_at_point": vec(face.normal_at((2, 2, 4))),
        "normal_at_uv": vec(face.normal_at(0.25, 0.75)),
        "position_at": vec(face.position_at(0.25, 0.75)),
        "center_geometry": vec(face.center(CenterOf.GEOMETRY)),
        "center_mass": vec(face.center(CenterOf.MASS)),
        "plane_origin": vec(plane.origin),
        "plane_z_dir": vec(plane.z_dir),
        "is_inside": face.is_inside((5, 3, 4)),
        "is_outside": face.is_inside((50, 3, 4)),
        "outer_wire_length": face.outer_wire().length,
        "inner_wire_count": len(face.inner_wires()),
    }


@case("face/cylindrical")
def face_cylindrical() -> dict:
    face = _cylinder().faces().filter_by(GeomType.CYLINDER)[0]
    return {
        "is_planar": face.is_planar is not None,
        "normal_at_uv": vec(face.normal_at(0.25, 0.5)),
        "position_at": vec(face.position_at(0.25, 0.5)),
        "normal_at_point": vec(face.normal_at((3, 0, 4))),
        "center_geometry": vec(face.center(CenterOf.GEOMETRY)),
        "center_mass": vec(face.center(CenterOf.MASS)),
        "area": face.area,
        "outer_wire_length": face.outer_wire().length,
    }


@case("face/with-hole")
def face_with_hole() -> dict:
    face = _plate_with_hole()
    return {
        "area": face.area,
        "wire_count": len(face.wires()),
        "outer_wire_length": face.outer_wire().length,
        "inner_wire_lengths": [wire.length for wire in face.inner_wires()],
        "center_geometry": vec(face.center(CenterOf.GEOMETRY)),
        "center_mass": vec(face.center(CenterOf.MASS)),
        "inside_hole": face.is_inside((10, 6, 0)),
        "inside_material": face.is_inside((2, 2, 0)),
        "normal_at": vec(face.normal_at()),
    }


@case("intersection/edge-crossing")
def intersection_edge_crossing() -> dict:
    horizontal = Edge.make_line((-5, 0, 0), (5, 0, 0))
    vertical = Edge.make_line((0, -5, 0), (0, 5, 0))
    found = horizontal.intersect(vertical)
    return {"classes": [type(shape).__name__ for shape in found], "point": vec(found[0].center())}


@case("intersection/edge-overlap")
def intersection_edge_overlap() -> dict:
    found = Edge.make_line((0, 0, 0), (10, 0, 0)).intersect(
        Edge.make_line((5, 0, 0), (15, 0, 0))
    )
    return {"classes": [type(shape).__name__ for shape in found], "length": found[0].length}


@case("intersection/face-edge")
def intersection_face_edge() -> dict:
    face = Face.make_rect(10, 10)
    piercing = Edge.make_line((0, 0, -5), (0, 0, 5))
    found = face.intersect(piercing)
    return {"classes": [type(shape).__name__ for shape in found], "point": vec(found[0].center())}


@case("intersection/face-face")
def intersection_face_face() -> dict:
    found = Face.make_rect(10, 10).intersect(Pos(5, 0, 0) * Face.make_rect(10, 10))
    return {"classes": [type(shape).__name__ for shape in found], "area": found[0].area}


@case("intersection/face-plane")
def intersection_face_plane() -> dict:
    found = Face.make_rect(10, 10).intersect(Plane.XZ)
    return {"classes": [type(shape).__name__ for shape in found], "length": found[0].length}


@case("intersection/solid-axis")
def intersection_solid_axis() -> dict:
    found = _box().intersect(Axis((5, 3, 0), (0, 0, 1)))
    return {"classes": [type(shape).__name__ for shape in found], "length": found[0].length}


@case("intersection/solid-plane")
def intersection_solid_plane() -> dict:
    found = _box().intersect(Plane(origin=(0, 0, 2)))
    return {"classes": [type(shape).__name__ for shape in found], "area": found[0].area}


@case("intersection/edge-plane")
def intersection_edge_plane() -> dict:
    found = Edge.make_line((0, 0, -5), (0, 0, 5)).intersect(Plane.XY)
    return {"classes": [type(shape).__name__ for shape in found], "point": vec(found[0].center())}


@case("properties/inertia-box")
def properties_inertia_box() -> dict:
    solid = Pos(1, 2, 3) * _box()
    return {
        "matrix": solid.matrix_of_inertia,
        "static_moments": list(solid.static_moments),
        "principal": [
            [abs(axis.X), abs(axis.Y), abs(axis.Z), moment]
            for axis, moment in solid.principal_properties
        ],
        "radius_z": solid.radius_of_gyration(Axis.Z),
        "radius_offset": solid.radius_of_gyration(Axis((4, 5, 0), (0, 1, 1))),
    }


@case("properties/inertia-rotated")
def properties_inertia_rotated() -> dict:
    solid = _box().rotate(Axis.Z, 30, transform=True)
    return {
        "matrix": solid.matrix_of_inertia,
        "static_moments": list(solid.static_moments),
        "principal_moments": [moment for _, moment in solid.principal_properties],
    }


@case("wire/param-at")
def wire_param_at() -> dict:
    polygon = _polygon()
    circle = Wire.make_circle(4)
    return {
        "polygon": [polygon.param_at(position) for position in (0, 0.25, 0.5, 0.75, 1)],
        "circle": [circle.param_at(position) for position in (0, 0.25, 0.5, 1)],
    }


@case("edge/location-at")
def edge_location_at() -> dict:
    line = Edge.make_line((0, 0, 0), (10, 0, 0))
    circle = Edge.make_circle(5)
    return {
        "line_frenet": location(line.location_at(0.25)),
        "line_x_dir": location(line.location_at(0.25, x_dir=(0, 0, 1))),
        "circle_frenet": location(circle.location_at(0.25)),
        "circle_corrected": location(circle.location_at(0.25, frame_method=FrameMethod.CORRECTED)),
    }


@case("wire/location-at")
def wire_location_at() -> dict:
    wire = Wire.make_circle(4)
    return {
        "frenet": location(wire.location_at(0.25)),
        "corrected": location(wire.location_at(0.25, frame_method=FrameMethod.CORRECTED)),
        "length_mode": location(
            wire.location_at(wire.length * 0.25, position_mode=PositionMode.LENGTH)
        ),
    }


@case("properties/combined-center")
def properties_combined_center() -> dict:
    shapes = [_box(), Pos(20, 0, 0) * _cylinder()]
    return {
        "mass": vec(Shape.combined_center(shapes, CenterOf.MASS)),
        "bounds": vec(Shape.combined_center(shapes, CenterOf.BOUNDING_BOX)),
    }


@case("properties/fix-valid")
def properties_fix_valid() -> dict:
    solid = _box()
    fixed = solid.fix()
    return {
        "same_object": fixed is solid,
        "valid": fixed.is_valid,
        "volume": fixed.volume,
    }


@case("explore/faces-intersected-by-axis")
def explore_faces_intersected_by_axis() -> dict:
    solid = _box()
    axis = Axis((5, 3, -2), (0, 0, 1))
    faces = solid.faces_intersected_by_axis(axis)
    return {
        "centers": _centers(faces),
        "count": len(faces),
        "empty_count": len(solid.faces_intersected_by_axis(Axis((20, 20, 0), (0, 0, 1)))),
    }
