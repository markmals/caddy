"""Oracle cases for the pure-math geometry classes ported in `@roonieone/caddy`.

Every case here is pure `gp`-level arithmetic: vectors, axes, planes, locations,
bounding boxes and the OCCT primitives underneath them (`gp_Trsf`,
`gp_Quaternion`, `gp_Ax3`). Nothing touches topology, so the Caddy side can
answer each case without the native kernel.
"""

from __future__ import annotations

import warnings
from collections.abc import Iterable
from math import degrees, radians
from typing import Any

from build123d import (
    Align,
    Axis,
    BoundBox,
    Extrinsic,
    GridLocations,
    HexLocations,
    Intrinsic,
    Location,
    Locations,
    Matrix,
    Plane,
    PolarLocations,
    Pos,
    Rotation,
    Vector,
    polar,
)
from build123d.build_constants import (
    CM,
    FT,
    G,
    G_PER_LB,
    IN,
    KG,
    LB,
    M,
    MC,
    MM,
    THOU,
    UNITS_PER_KILOGRAM,
    UNITS_PER_METER,
)
from build123d.geometry import OrientedBoundBox, to_align_offset
from OCP.Bnd import Bnd_Box, Bnd_OBB
from OCP.gp import gp_Ax1, gp_Ax2, gp_Ax3, gp_Dir, gp_Pnt, gp_Quaternion, gp_Trsf, gp_Vec

from oracle import case, location, plane, vec

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

ORDERINGS: dict[str, Extrinsic | Intrinsic] = {
    f"{kind.__name__.lower()}-{name.lower()}": getattr(kind, name)
    for kind in (Intrinsic, Extrinsic)
    for name in ("XYZ", "XZY", "YZX", "YXZ", "ZXY", "ZYX", "XYX", "XZX", "YZY", "YXY", "ZXZ", "ZYZ")
}

EULER_ANGLES = (10.0, 20.0, 30.0)


def bbox(minimum: tuple[float, float, float], maximum: tuple[float, float, float]) -> BoundBox:
    """A BoundBox with the given corners and no gap, as `Plane._to_from_local_coords` builds."""
    return BoundBox(Bnd_Box(gp_Pnt(*minimum), gp_Pnt(*maximum)))


def bounds(box: BoundBox) -> dict[str, Any]:
    return {"min": vec(box.min), "max": vec(box.max), "size": vec(box.size)}


def trsf_rows(transform: gp_Trsf) -> list[list[float]]:
    """The 3x4 affine matrix of a `gp_Trsf`, row major."""
    return [[float(transform.Value(row, col)) for col in range(1, 5)] for row in range(1, 4)]


def matrix_rows(value: Matrix) -> list[list[float]]:
    return [[float(value[row, col]) for col in range(4)] for row in range(3)]


def mat3_rows(value: Any) -> list[list[float]]:
    return [[float(value.Value(row, col)) for col in range(1, 4)] for row in range(1, 4)]


def quat_values(quaternion: gp_Quaternion) -> list[float]:
    return [
        float(quaternion.X()),
        float(quaternion.Y()),
        float(quaternion.Z()),
        float(quaternion.W()),
    ]


def euler_sequence(ordering: Extrinsic | Intrinsic) -> Any:
    return Location._rot_order_dict[ordering]


def axis_data(value: Axis) -> dict[str, Any]:
    return {"position": vec(value.position), "direction": vec(value.direction)}


def intersection(value: Any) -> dict[str, Any] | None:
    """Tag an intersection result so the TypeScript side can assert the same kind of answer."""
    if value is None:
        return None
    if isinstance(value, Vector):
        return {"kind": "vector", "vector": vec(value)}
    if isinstance(value, Axis):
        return {"kind": "axis", "axis": axis_data(value)}
    if isinstance(value, Plane):
        return {"kind": "plane", "plane": plane(value)}
    if isinstance(value, Location):
        return {"kind": "location", "location": location(value)}
    raise TypeError(f"unexpected intersection result: {value!r}")


def location_list(items: Iterable[Location]) -> dict[str, Any]:
    """A group of locations, flattened so one mismatch names the offending coordinate."""
    values = list(items)
    return {
        "count": len(values),
        "positions": [coord for item in values for coord in vec(item.position)],
        "orientations": [angle for item in values for angle in vec(item.orientation)],
    }


# ---------------------------------------------------------------------------
# vector
# ---------------------------------------------------------------------------


@case("vector/construct")
def vector_construct() -> dict[str, Any]:
    return {
        "triple": vec(Vector(1.5, -2.25, 3.125)),
        "pair": vec(Vector(1.5, -2.25)),
        "empty": vec(Vector()),
        "from_tuple": vec(Vector((4.0, 5.0, 6.0))),
        "from_vector": vec(Vector(Vector(7.0, 8.0, 9.0))),
        "length": Vector(1.0, 2.0, 2.0).length,
    }


@case("vector/arithmetic")
def vector_arithmetic() -> dict[str, Any]:
    a = Vector(1.0, 2.0, 3.0)
    b = Vector(-4.0, 0.5, 6.0)
    return {
        "add": vec(a.add(b)),
        "add_tuple": vec(a.add((1.0, 1.0, 1.0))),
        "sub": vec(a.sub(b)),
        "multiply": vec(a.multiply(-2.5)),
        "divide": vec(a / 4.0),
        "negate": vec(-a),
        "reverse": vec(a.reverse()),
        "center": vec(a.center()),
    }


@case("vector/products")
def vector_products() -> dict[str, Any]:
    a = Vector(1.0, 2.0, 3.0)
    b = Vector(-4.0, 0.5, 6.0)
    return {
        "dot": a.dot(b),
        "cross": vec(a.cross(b)),
        "normalized": vec(a.normalized()),
        "normalized_length": a.normalized().length,
    }


@case("vector/angles")
def vector_angles() -> dict[str, Any]:
    a = Vector(1.0, 1.0, 0.0)
    b = Vector(0.0, 1.0, 1.0)
    return {
        "acute": Vector(1.0, 0.0, 0.0).get_angle(Vector(1.0, 1.0, 0.0)),
        "obtuse": Vector(1.0, 0.0, 0.0).get_angle(Vector(-1.0, 0.2, 0.0)),
        "straight": Vector(1.0, 0.0, 0.0).get_angle(Vector(-1.0, 0.0, 0.0)),
        "general": a.get_angle(b),
        "signed_default_normal": Vector(1.0, 0.0, 0.0).get_signed_angle(Vector(0.0, 1.0, 0.0)),
        "signed_with_normal": Vector(1.0, 0.0, 0.0).get_signed_angle(
            Vector(0.0, 1.0, 0.0), Vector(0.0, 0.0, 1.0)
        ),
        "signed_obtuse": a.get_signed_angle(Vector(-1.0, 0.1, 0.0), Vector(0.0, 0.0, 1.0)),
    }


@case("vector/project")
def vector_project() -> dict[str, Any]:
    point = Vector(3.0, 4.0, 5.0)
    tilted = Plane(origin=(0.0, 0.0, 1.0), z_dir=(1.0, 1.0, 1.0))
    return {
        "to_line": vec(point.project_to_line(Vector(0.0, 2.0, 0.0))),
        "to_plane_xy": vec(point.project_to_plane(Plane.XY)),
        "to_plane_tilted": vec(point.project_to_plane(tilted)),
        "distance_to_plane": point.distance_to_plane(tilted),
        "signed_distance": point.signed_distance_from_plane(tilted),
        "signed_distance_behind": Vector(-3.0, -4.0, -5.0).signed_distance_from_plane(tilted),
    }


@case("vector/rotate")
def vector_rotate() -> dict[str, Any]:
    point = Vector(1.0, 2.0, 3.0)
    offset_axis = Axis((10.0, -5.0, 2.0), (0.0, 0.0, 1.0))
    return {
        "about_x": vec(point.rotate(Axis.X, 90.0)),
        "about_y": vec(point.rotate(Axis.Y, 45.0)),
        "about_z": vec(point.rotate(Axis.Z, -30.0)),
        "about_diagonal": vec(point.rotate(Axis((0.0, 0.0, 0.0), (1.0, 1.0, 1.0)), 120.0)),
        # The axis position is ignored for vectors: only its direction matters.
        "about_offset_axis": vec(point.rotate(offset_axis, -30.0)),
    }


@case("vector/transform")
def vector_transform() -> dict[str, Any]:
    point = Vector(3.0, -1.0, 2.0)
    forward = Plane(origin=(1.0, 2.0, 3.0), x_dir=(1.0, 1.0, 0.0), z_dir=(0.0, 0.0, 1.0))
    return {
        "point_forward": vec(point.transform(forward.forward_transform)),
        "point_reverse": vec(point.transform(forward.reverse_transform)),
        "direction_forward": vec(point.transform(forward.forward_transform, True)),
        "direction_reverse": vec(point.transform(forward.reverse_transform, True)),
    }


@case("vector/rounded")
def vector_rounded() -> dict[str, Any]:
    noisy = Vector(1.2345678901234567, -6.123233995736766e-17, 0.9999999999999999)
    return {
        "to_14": vec(round(noisy, 14)),
        "to_6": vec(round(noisy, 6)),
        "to_0": vec(round(Vector(1.4, -1.6, 2.5), 0)),
    }


@case("vector/equality")
def vector_equality() -> dict[str, Any]:
    base = Vector(1.0, 2.0, 3.0)
    return {
        "same": base == Vector(1.0, 2.0, 3.0),
        "within_tolerance": base == Vector(1.0, 2.0, 3.0 + 1e-9),
        "outside_tolerance": base == Vector(1.0, 2.0, 3.001),
    }


# ---------------------------------------------------------------------------
# axis
# ---------------------------------------------------------------------------


@case("axis/statics")
def axis_statics() -> dict[str, Any]:
    return {
        "x_position": vec(Axis.X.position),
        "x_direction": vec(Axis.X.direction),
        "y_position": vec(Axis.Y.position),
        "y_direction": vec(Axis.Y.direction),
        "z_position": vec(Axis.Z.position),
        "z_direction": vec(Axis.Z.direction),
    }


@case("axis/construct")
def axis_construct() -> dict[str, Any]:
    unnormalized = Axis((1.0, 2.0, 3.0), (0.0, 0.0, 5.0))
    from_points = Axis((1.0, 1.0, 1.0), end_point=(4.0, 5.0, 1.0))
    return {
        "unnormalized_position": vec(unnormalized.position),
        "unnormalized_direction": vec(unnormalized.direction),
        "from_points_position": vec(from_points.position),
        "from_points_direction": vec(from_points.direction),
    }


@case("axis/location")
def axis_location() -> dict[str, Any]:
    tilted = Axis((1.0, 2.0, 3.0), (1.0, 2.0, 2.0))
    return {
        "tilted": location(tilted.location),
        "z": location(Axis.Z.location),
        "x": location(Axis.X.location),
    }


@case("axis/from-location")
def axis_from_location() -> dict[str, Any]:
    source = Location((1.0, 2.0, 3.0), (25.0, -40.0, 15.0))
    derived = Axis(source)
    return {"position": vec(derived.position), "direction": vec(derived.direction)}


@case("axis/located")
def axis_located() -> dict[str, Any]:
    moved = Axis((1.0, 0.0, 0.0), (0.0, 1.0, 0.0)).located(
        Location((5.0, 5.0, 5.0), (0.0, 0.0, 90.0))
    )
    return {"position": vec(moved.position), "direction": vec(moved.direction)}


@case("axis/predicates")
def axis_predicates() -> dict[str, Any]:
    base = Axis((0.0, 0.0, 0.0), (1.0, 0.0, 0.0))
    shifted = Axis((5.0, 0.0, 0.0), (1.0, 0.0, 0.0))
    parallel_offset = Axis((0.0, 1.0, 0.0), (1.0, 0.0, 0.0))
    reversed_axis = Axis((0.0, 0.0, 0.0), (-1.0, 0.0, 0.0))
    skew = Axis((0.0, 0.0, 1.0), (0.0, 1.0, 0.0))
    crossing = Axis((0.0, 0.0, 0.0), (0.0, 1.0, 0.0))
    return {
        "coaxial_shifted": base.is_coaxial(shifted),
        "coaxial_offset": base.is_coaxial(parallel_offset),
        "coaxial_reversed": base.is_coaxial(reversed_axis),
        "normal_crossing": base.is_normal(crossing),
        "normal_shifted": base.is_normal(shifted),
        "opposite_reversed": base.is_opposite(reversed_axis),
        "opposite_shifted": base.is_opposite(shifted),
        "parallel_offset": base.is_parallel(parallel_offset),
        "parallel_crossing": base.is_parallel(crossing),
        "skew_crossing": base.is_skew(crossing),
        "skew_offset_perpendicular": base.is_skew(skew),
        "skew_parallel_offset": base.is_skew(parallel_offset),
        "skew_shifted": base.is_skew(shifted),
    }


@case("axis/angle-between")
def axis_angle_between() -> dict[str, Any]:
    return {
        "right": Axis.X.angle_between(Axis.Y),
        "straight": Axis.X.angle_between(-Axis.X),
        "oblique": Axis.X.angle_between(Axis((0.0, 0.0, 0.0), (1.0, 1.0, 0.0))),
        "zero": Axis.Z.angle_between(Axis.Z),
    }


@case("axis/reverse")
def axis_reverse() -> dict[str, Any]:
    source = Axis((1.0, 2.0, 3.0), (0.0, 3.0, 4.0))
    return {
        "position": vec(source.reverse().position),
        "direction": vec(source.reverse().direction),
        "negate_direction": vec((-source).direction),
    }


# ---------------------------------------------------------------------------
# plane
# ---------------------------------------------------------------------------

NAMED_PLANES = (
    "XY",
    "YZ",
    "ZX",
    "XZ",
    "YX",
    "ZY",
    "front",
    "back",
    "left",
    "right",
    "top",
    "bottom",
    "isometric",
)


def _named_plane_case(attribute: str) -> None:
    @case(f"plane/named/{attribute.lower()}")
    def named() -> dict[str, Any]:
        return {"plane": plane(getattr(Plane, attribute))}


for _attribute in NAMED_PLANES:
    _named_plane_case(_attribute)


@case("plane/default-x-direction")
def plane_default_x_direction() -> dict[str, Any]:
    normals = {
        "z": (0.0, 0.0, 1.0),
        "neg_z": (0.0, 0.0, -1.0),
        "x": (1.0, 0.0, 0.0),
        "y": (0.0, 1.0, 0.0),
        "diagonal": (1.0, 1.0, 1.0),
        "x_dominant": (3.0, 1.0, 2.0),
        "y_dominant": (1.0, 3.0, 2.0),
        "z_dominant": (1.0, 2.0, 3.0),
        "xy_tie": (1.0, 1.0, 0.0),
        "xz_tie": (1.0, 0.0, 1.0),
        "yz_tie": (0.0, 1.0, 1.0),
        "negative_mix": (-2.0, 1.0, -3.0),
    }
    return {name: plane(Plane(origin=(0, 0, 0), z_dir=normal)) for name, normal in normals.items()}


@case("plane/construct")
def plane_construct() -> dict[str, Any]:
    return {
        "origin_only": plane(Plane(origin=(1.0, 2.0, 3.0))),
        "oblique_x": plane(
            Plane(origin=(1.0, 2.0, 3.0), x_dir=(1.0, 1.0, 1.0), z_dir=(0.0, 0.0, 1.0))
        ),
        "unnormalized": plane(Plane(origin=(0.0, 0.0, 0.0), x_dir=(5.0, 0.0, 0.0), z_dir=(0.0, 0.0, 9.0))),
        "y_dir_form": plane(Plane(origin=(1.0, 0.0, 0.0), x_dir=(1.0, 0.0, 0.0), y_dir=(1.0, 1.0, 0.0))),
        "y_dir_oblique": plane(
            Plane(origin=(0.0, 0.0, 0.0), x_dir=(1.0, 0.0, 0.0), y_dir=(0.0, 1.0, 1.0))
        ),
    }


@case("plane/from-points")
def plane_from_points() -> dict[str, Any]:
    return {
        "triangle": plane(Plane([(0.0, 0.0, 0.0), (2.0, 0.0, 0.0), (0.0, 3.0, 0.0)])),
        "tilted": plane(Plane([(1.0, 1.0, 1.0), (3.0, 1.0, 1.0), (1.0, 2.0, 4.0)])),
    }


@case("plane/from-axis")
def plane_from_axis() -> dict[str, Any]:
    axis = Axis((1.0, 2.0, 3.0), (0.0, 1.0, 1.0))
    return {
        "without_x": plane(Plane(axis)),
        "with_x": plane(Plane(axis, (1.0, 0.0, 0.0))),
    }


@case("plane/from-location")
def plane_from_location() -> dict[str, Any]:
    return {
        "euler": plane(Plane(Location((1.0, 2.0, 3.0), (10.0, 20.0, 30.0)))),
        "quarter_turn": plane(Plane(Location((0.0, 0.0, 0.0), (90.0, 0.0, 0.0)))),
        "translation": plane(Plane(Location((4.0, 5.0, 6.0)))),
    }


@case("plane/offset")
def plane_offset() -> dict[str, Any]:
    return {
        "xy": plane(Plane.XY.offset(2.5)),
        "tilted": plane(Plane(origin=(1.0, 1.0, 1.0), z_dir=(1.0, 2.0, 2.0)).offset(-3.0)),
    }


@case("plane/reverse")
def plane_reverse() -> dict[str, Any]:
    source = Plane(origin=(1.0, 2.0, 3.0), x_dir=(1.0, 0.0, 0.0), z_dir=(0.0, 0.0, 1.0))
    return {"reversed": plane(source.reverse()), "negated": plane(-source)}


@case("plane/set-directions")
def plane_set_directions() -> dict[str, Any]:
    source = Plane(origin=(1.0, 2.0, 3.0), x_dir=(1.0, 0.0, 0.0), z_dir=(0.0, 0.0, 1.0))
    with_origin = Plane(origin=(7.0, 8.0, 9.0), x_dir=source.x_dir, z_dir=source.z_dir)

    with_x = Plane(origin=source.origin, x_dir=source.x_dir, z_dir=source.z_dir)
    with_x.x_dir = (1.0, 1.0, 0.0)

    with_y = Plane(origin=source.origin, x_dir=source.x_dir, z_dir=source.z_dir)
    with_y.y_dir = (1.0, 1.0, 0.0)

    return {
        "with_origin": plane(with_origin),
        "with_x_dir": plane(with_x),
        "with_y_dir": plane(with_y),
    }


@case("plane/shift-origin")
def plane_shift_origin() -> dict[str, Any]:
    tilted = Plane(origin=(0.0, 0.0, 2.0), z_dir=(0.0, 0.0, 1.0))
    return {
        "by_point": plane(tilted.shift_origin((3.0, 4.0, 2.0))),
        "by_axis": plane(tilted.shift_origin(Axis((1.0, 1.0, 0.0), (0.0, 0.0, 1.0)))),
        "by_oblique_axis": plane(tilted.shift_origin(Axis((0.0, 0.0, 0.0), (1.0, 1.0, 1.0)))),
    }


def _rotated_case(key: str, ordering: Extrinsic | Intrinsic) -> None:
    @case(f"plane/rotated/{key}")
    def rotated() -> dict[str, Any]:
        return {"plane": plane(Plane.XY.rotated((15.0, 25.0, 35.0), ordering))}


for _key, _ordering in ORDERINGS.items():
    _rotated_case(_key, _ordering)


@case("plane/rotated-default")
def plane_rotated_default() -> dict[str, Any]:
    return {
        "about_z": plane(Plane.XY.rotated((0.0, 0.0, 45.0))),
        "compound": plane(Plane.XZ.rotated((15.0, 25.0, 35.0))),
    }


@case("plane/moved")
def plane_moved() -> dict[str, Any]:
    source = Plane(origin=(1.0, 0.0, 0.0), x_dir=(1.0, 0.0, 0.0), z_dir=(0.0, 0.0, 1.0))
    return {
        "by_location": plane(source.moved(Location((0.0, 2.0, 0.0), (0.0, 0.0, 90.0)))),
        "by_plane": plane(source.moved(Plane.YZ)),
    }


@case("plane/transforms")
def plane_transforms() -> dict[str, Any]:
    source = Plane(origin=(1.0, 2.0, 3.0), x_dir=(1.0, 1.0, 0.0), z_dir=(0.0, 0.0, 1.0))
    return {
        "forward": matrix_rows(source.forward_transform),
        "reverse": matrix_rows(source.reverse_transform),
    }


@case("plane/local-coords")
def plane_local_coords() -> dict[str, Any]:
    source = Plane(origin=(1.0, 2.0, 3.0), x_dir=(1.0, 1.0, 0.0), z_dir=(0.0, 0.0, 1.0))
    box = bbox((0.0, 0.0, 0.0), (1.0, 2.0, 3.0))
    return {
        "to_local": vec(source.to_local_coords((4.0, 5.0, 6.0))),
        "from_local": vec(source.from_local_coords((4.0, 5.0, 6.0))),
        "roundtrip": vec(source.from_local_coords(source.to_local_coords((4.0, 5.0, 6.0)))),
        "box_to_local": bounds(source.to_local_coords(box)),
        "box_from_local": bounds(source.from_local_coords(box)),
    }


@case("plane/location-between")
def plane_location_between() -> dict[str, Any]:
    first = Plane(origin=(1.0, 0.0, 0.0), x_dir=(1.0, 0.0, 0.0), z_dir=(0.0, 0.0, 1.0))
    second = Plane(origin=(0.0, 4.0, 0.0), x_dir=(0.0, 1.0, 0.0), z_dir=(1.0, 0.0, 0.0))
    return {
        "forward": location(first.location_between(second)),
        "backward": location(second.location_between(first)),
    }


@case("plane/contains")
def plane_contains() -> dict[str, Any]:
    tilted = Plane(origin=(0.0, 0.0, 1.0), z_dir=(0.0, 0.0, 1.0))
    return {
        "point_on": tilted.contains((5.0, -3.0, 1.0)),
        "point_off": tilted.contains((5.0, -3.0, 1.5)),
        "point_within_tolerance": tilted.contains((0.0, 0.0, 1.0 + 1e-9)),
        "axis_in": tilted.contains(Axis((0.0, 0.0, 1.0), (1.0, 1.0, 0.0))),
        "axis_crossing": tilted.contains(Axis((0.0, 0.0, 1.0), (0.0, 0.0, 1.0))),
        "axis_parallel_off": tilted.contains(Axis((0.0, 0.0, 2.0), (1.0, 0.0, 0.0))),
    }


@case("plane/multiply")
def plane_multiply() -> dict[str, Any]:
    source = Plane(origin=(1.0, 2.0, 3.0), x_dir=(0.0, 1.0, 0.0), z_dir=(1.0, 0.0, 0.0))
    return {
        "by_location": location(source * Location((1.0, 0.0, 0.0), (0.0, 0.0, 45.0))),
        "by_plane": location(source * Plane.YZ),
        "plane_location": location(source.location),
    }


# ---------------------------------------------------------------------------
# location
# ---------------------------------------------------------------------------


@case("location/identity")
def location_identity() -> dict[str, Any]:
    return {"identity": location(Location())}


@case("location/position")
def location_position() -> dict[str, Any]:
    return {
        "translation": location(Location((1.0, 2.0, 3.0))),
        "with_angle": location(Location((1.0, 2.0, 3.0), 45.0)),
        "zero_angle": location(Location((1.0, 2.0, 3.0), 0.0)),
    }


@case("location/axis-angle")
def location_axis_angle() -> dict[str, Any]:
    return {
        "about_x": location(Location((1.0, 2.0, 3.0), (1.0, 0.0, 0.0), 90.0)),
        "about_diagonal": location(Location((0.0, 0.0, 0.0), (1.0, 1.0, 1.0), 120.0)),
        "unnormalized_direction": location(Location((0.0, 0.0, 0.0), (0.0, 0.0, 4.0), 30.0)),
    }


def _euler_case(key: str, ordering: Extrinsic | Intrinsic) -> None:
    @case(f"euler/{key}")
    def euler() -> dict[str, Any]:
        sequence = euler_sequence(ordering)
        quaternion = gp_Quaternion()
        quaternion.SetEulerAngles(sequence, *(radians(angle) for angle in EULER_ANGLES))
        recovered = quaternion.GetEulerAngles(sequence)
        return {
            "quaternion": quat_values(quaternion),
            "matrix": mat3_rows(quaternion.GetMatrix()),
            "angles_roundtrip": [degrees(angle) for angle in recovered],
            "location": location(Location((1.0, 2.0, 3.0), EULER_ANGLES, ordering)),
            "rotation": location(Rotation(*EULER_ANGLES, ordering)),
        }


for _key, _ordering in ORDERINGS.items():
    _euler_case(_key, _ordering)


@case("euler/gimbal-lock")
def euler_gimbal_lock() -> dict[str, Any]:
    """Poses where OCCT falls back to its degenerate branch (`sy`/`cy` near zero)."""
    results: dict[str, Any] = {}
    for key, ordering, angles in (
        ("three-axis-pitch-up", Intrinsic.XYZ, (0.0, 90.0, 0.0)),
        ("three-axis-pitch-down", Intrinsic.XYZ, (0.0, -90.0, 0.0)),
        ("three-axis-extrinsic", Extrinsic.XYZ, (30.0, 90.0, 0.0)),
        ("two-axis-aligned", Intrinsic.ZXZ, (0.0, 0.0, 0.0)),
        ("two-axis-flat", Intrinsic.XYX, (40.0, 0.0, 0.0)),
    ):
        sequence = euler_sequence(ordering)
        quaternion = gp_Quaternion()
        quaternion.SetEulerAngles(sequence, *(radians(angle) for angle in angles))
        results[key] = {
            "quaternion": quat_values(quaternion),
            "angles_roundtrip": [degrees(a) for a in quaternion.GetEulerAngles(sequence)],
        }
    return results


@case("location/from-plane")
def location_from_plane() -> dict[str, Any]:
    return {
        "xy": location(Location(Plane.XY)),
        "xz": location(Location(Plane.XZ)),
        "yz": location(Location(Plane.YZ)),
        "isometric": location(Location(Plane.isometric)),
        "offset": location(Location(Plane(origin=(1.0, 2.0, 3.0), z_dir=(1.0, 1.0, 1.0)))),
    }


@case("location/accessors")
def location_accessors() -> dict[str, Any]:
    source = Location((1.0, 2.0, 3.0), (25.0, -40.0, 15.0))
    return {
        "position": vec(source.position),
        "orientation": vec(source.orientation),
        "x_axis_position": vec(source.x_axis.position),
        "x_axis_direction": vec(source.x_axis.direction),
        "y_axis_direction": vec(source.y_axis.direction),
        "z_axis_direction": vec(source.z_axis.direction),
        "center": vec(source.center()),
    }


@case("location/setters")
def location_setters() -> dict[str, Any]:
    with_position = Location((1.0, 2.0, 3.0), (25.0, -40.0, 15.0))
    with_position.position = (7.0, 8.0, 9.0)
    with_orientation = Location((1.0, 2.0, 3.0), (25.0, -40.0, 15.0))
    with_orientation.orientation = (0.0, 0.0, 90.0)
    return {
        "with_position": location(with_position),
        "with_orientation": location(with_orientation),
    }


@case("location/inverse")
def location_inverse() -> dict[str, Any]:
    source = Location((1.0, 2.0, 3.0), (25.0, -40.0, 15.0))
    return {
        "inverse": location(source.inverse()),
        "roundtrip": location(source * source.inverse()),
        "identity_inverse": location(Location().inverse()),
    }


@case("location/multiply")
def location_multiply() -> dict[str, Any]:
    first = Location((1.0, 2.0, 3.0), (0.0, 0.0, 90.0))
    second = Location((4.0, 0.0, 0.0), (90.0, 0.0, 0.0))
    return {
        "forward": location(first * second),
        "backward": location(second * first),
        "with_identity": location(first * Location()),
        "pos_times_rotation": location(Pos(1.0, 2.0, 3.0) * Rotation(0.0, 0.0, 90.0)),
        "times_plane": plane(first * Plane.YZ),
    }


@case("location/power")
def location_power() -> dict[str, Any]:
    source = Location((1.0, 0.0, 0.0), (0.0, 0.0, 30.0))
    return {
        "zero": location(source**0),
        "one": location(source**1),
        "two": location(source**2),
        "three": location(source**3),
        "five": location(source**5),
        "minus_one": location(source**-1),
        "minus_two": location(source**-2),
    }


@case("location/negate")
def location_negate() -> dict[str, Any]:
    return {
        "euler": location(-Location((1.0, 2.0, 3.0), (25.0, -40.0, 15.0))),
        "identity": location(-Location()),
    }


@case("location/mirror")
def location_mirror() -> dict[str, Any]:
    source = Location((1.0, 2.0, 3.0), (25.0, -40.0, 15.0))
    return {
        "across_xy": location(source.mirror(Plane.XY)),
        "across_yz": location(source.mirror(Plane.YZ)),
        "across_offset": location(source.mirror(Plane.XY.offset(5.0))),
        "across_tilted": location(source.mirror(Plane(origin=(0, 0, 0), z_dir=(1.0, 1.0, 0.0)))),
    }


@case("location/equality")
def location_equality() -> dict[str, Any]:
    base = Location((1.0, 2.0, 3.0), (0.0, 0.0, 90.0))
    return {
        "same": base == Location((1.0, 2.0, 3.0), (0.0, 0.0, 90.0)),
        "different_position": base == Location((1.0, 2.0, 3.5), (0.0, 0.0, 90.0)),
        "different_orientation": base == Location((1.0, 2.0, 3.0), (0.0, 0.0, 91.0)),
        "equivalent_turn": base == Location((1.0, 2.0, 3.0), (0.0, 0.0, -270.0)),
    }


@case("location/pos-and-rotation")
def location_pos_and_rotation() -> dict[str, Any]:
    return {
        "pos_xyz": location(Pos(1.0, 2.0, 3.0)),
        "pos_vector": location(Pos(Vector(4.0, 5.0, 6.0))),
        "pos_default": location(Pos()),
        "rotation_default": location(Rotation()),
        "rotation_angles": location(Rotation((10.0, 20.0, 30.0))),
        "rotation_about_axis": location(Rotation(Axis((1.0, 0.0, 0.0), (0.0, 0.0, 1.0)), 90.0)),
        "rotation_about_axis_zero": location(Rotation(Axis((1.0, 0.0, 0.0), (0.0, 0.0, 1.0)), 0.0)),
    }


# ---------------------------------------------------------------------------
# bounding box
# ---------------------------------------------------------------------------


@case("bounding-box/basics")
def bounding_box_basics() -> dict[str, Any]:
    box = bbox((-1.0, -2.0, -3.0), (4.0, 5.0, 6.0))
    flat = bbox((0.0, 0.0, 2.0), (3.0, 4.0, 2.0))
    point = bbox((1.0, 1.0, 1.0), (1.0, 1.0, 1.0))
    return {
        "min": vec(box.min),
        "max": vec(box.max),
        "size": vec(box.size),
        "center": vec(box.center()),
        "diagonal": box.diagonal,
        "measure": box.measure,
        "flat_measure": flat.measure,
        "flat_diagonal": flat.diagonal,
        "point_measure": point.measure,
        "point_diagonal": point.diagonal,
    }


@case("bounding-box/add")
def bounding_box_add() -> dict[str, Any]:
    box = bbox((0.0, 0.0, 0.0), (1.0, 1.0, 1.0))
    return {
        "point_outside": bounds(box.add((2.0, -3.0, 0.5))),
        "point_inside": bounds(box.add((0.5, 0.5, 0.5))),
        "box_overlapping": bounds(box.add(bbox((0.5, 0.5, 0.5), (3.0, 3.0, 3.0)))),
        "box_disjoint": bounds(box.add(bbox((-5.0, -5.0, -5.0), (-4.0, -4.0, -4.0)))),
    }


@case("bounding-box/predicates")
def bounding_box_predicates() -> dict[str, Any]:
    outer = bbox((0.0, 0.0, 0.0), (10.0, 10.0, 10.0))
    inner = bbox((1.0, 1.0, 1.0), (2.0, 2.0, 2.0))
    touching = bbox((10.0, 0.0, 0.0), (12.0, 10.0, 10.0))
    straddling = bbox((5.0, 5.0, 5.0), (15.0, 15.0, 15.0))
    separate = bbox((20.0, 20.0, 20.0), (21.0, 21.0, 21.0))
    flush = bbox((0.0, 0.0, 0.0), (10.0, 10.0, 5.0))
    return {
        "covers_inner": outer.covers(inner),
        "covers_straddling": outer.covers(straddling),
        "covers_flush": outer.covers(flush),
        "covered_by": inner.covered_by(outer),
        "contains_inner": outer.contains(inner),
        "contains_flush": outer.contains(flush),
        "contains_properly_inner": outer.contains_properly(inner),
        "contains_properly_flush": outer.contains_properly(flush),
        "within": inner.within(outer),
        "intersects_touching": outer.intersects(touching),
        "intersects_separate": outer.intersects(separate),
        "disjoint_separate": outer.disjoint(separate),
        "touches_touching": outer.touches(touching),
        "touches_straddling": outer.touches(straddling),
        "overlaps_straddling": outer.overlaps(straddling),
        "overlaps_inner": outer.overlaps(inner),
    }


@case("bounding-box/degenerate-predicates")
def bounding_box_degenerate_predicates() -> dict[str, Any]:
    rectangle = bbox((0.0, 0.0, 0.0), (10.0, 10.0, 0.0))
    coplanar_inner = bbox((1.0, 1.0, 0.0), (2.0, 2.0, 0.0))
    parallel_plane = bbox((1.0, 1.0, 1.0), (2.0, 2.0, 1.0))
    segment = bbox((1.0, 0.0, 0.0), (3.0, 0.0, 0.0))
    collinear = bbox((2.0, 0.0, 0.0), (4.0, 0.0, 0.0))
    return {
        "rectangle_contains_coplanar": rectangle.contains(coplanar_inner),
        "rectangle_contains_properly": rectangle.contains_properly(coplanar_inner),
        "rectangle_contains_parallel": rectangle.contains(parallel_plane),
        "rectangle_covers_parallel": rectangle.covers(parallel_plane),
        "segments_overlap": segment.overlaps(collinear),
        "segment_touches_rectangle": segment.touches(rectangle),
        "rectangle_contains_segment": rectangle.contains(segment),
    }


@case("bounding-box/align-offset")
def bounding_box_align_offset() -> dict[str, Any]:
    box = bbox((-1.0, -2.0, -3.0), (4.0, 5.0, 6.0))
    return {
        "min": vec(box.to_align_offset(Align.MIN)),
        "center": vec(box.to_align_offset(Align.CENTER)),
        "max": vec(box.to_align_offset(Align.MAX)),
        "none": vec(box.to_align_offset(Align.NONE)),
        "null": vec(box.to_align_offset(None)),
        "mixed": vec(box.to_align_offset((Align.MIN, Align.CENTER, Align.MAX))),
        "with_null": vec(box.to_align_offset((Align.MIN, None, Align.MAX))),
        "two_dimensional": vec(box.to_align_offset((Align.MAX, Align.MIN))),
        "free_function": vec(
            to_align_offset((0.0, 0.0, 0.0), (2.0, 4.0, 6.0), (Align.CENTER, Align.MIN, None))
        ),
        "free_function_center": vec(
            to_align_offset((0.0, 0.0, 0.0), (2.0, 4.0, 6.0), Align.CENTER, (1.0, 1.0, 1.0))
        ),
    }


# ---------------------------------------------------------------------------
# gp_Trsf
# ---------------------------------------------------------------------------


@case("transform/compose")
def transform_compose() -> dict[str, Any]:
    rotation = gp_Trsf()
    rotation.SetRotation(gp_Ax1(gp_Pnt(1.0, 0.0, 0.0), gp_Dir(0.0, 0.0, 1.0)), radians(35.0))
    translation = gp_Trsf()
    translation.SetTranslationPart(gp_Vec(2.0, 3.0, 4.0))
    scale = gp_Trsf()
    scale.SetScale(gp_Pnt(1.0, 1.0, 1.0), 2.5)
    return {
        "rotation": trsf_rows(rotation),
        "translation": trsf_rows(translation),
        "scale": trsf_rows(scale),
        "rotation_then_translation": trsf_rows(rotation * translation),
        "translation_then_rotation": trsf_rows(translation * rotation),
        "scale_then_rotation": trsf_rows(scale * rotation),
        "rotation_then_scale": trsf_rows(rotation * scale),
    }


@case("transform/invert")
def transform_invert() -> dict[str, Any]:
    rotation = gp_Trsf()
    rotation.SetRotation(gp_Ax1(gp_Pnt(1.0, 0.0, 0.0), gp_Dir(0.0, 1.0, 1.0)), radians(35.0))
    scale = gp_Trsf()
    scale.SetScale(gp_Pnt(1.0, 1.0, 1.0), 2.5)
    compound = rotation * scale
    return {
        "rotation": trsf_rows(rotation.Inverted()),
        "scale": trsf_rows(scale.Inverted()),
        "compound": trsf_rows(compound.Inverted()),
        "roundtrip": trsf_rows(compound * compound.Inverted()),
    }


@case("transform/mirror")
def transform_mirror() -> dict[str, Any]:
    axis_mirror = gp_Trsf()
    axis_mirror.SetMirror(gp_Ax1(gp_Pnt(1.0, 2.0, 0.0), gp_Dir(0.0, 0.0, 1.0)))
    plane_mirror = gp_Trsf()
    plane_mirror.SetMirror(gp_Ax2(gp_Pnt(0.0, 0.0, 3.0), gp_Dir(0.0, 0.0, 1.0)))
    oblique_mirror = gp_Trsf()
    oblique_mirror.SetMirror(gp_Ax2(gp_Pnt(1.0, 1.0, 1.0), gp_Dir(1.0, 1.0, 1.0)))
    return {
        "axis": trsf_rows(axis_mirror),
        "axis_scale": axis_mirror.ScaleFactor(),
        "plane": trsf_rows(plane_mirror),
        "plane_scale": plane_mirror.ScaleFactor(),
        "plane_inverted": trsf_rows(plane_mirror.Inverted()),
        "oblique": trsf_rows(oblique_mirror),
        "oblique_inverted": trsf_rows(oblique_mirror.Inverted()),
        "oblique_squared": trsf_rows(oblique_mirror * oblique_mirror),
    }


@case("transform/power")
def transform_power() -> dict[str, Any]:
    compound = gp_Trsf()
    compound.SetRotation(gp_Ax1(gp_Pnt(1.0, 0.0, 0.0), gp_Dir(0.0, 0.0, 1.0)), radians(30.0))
    scaled = gp_Trsf()
    scaled.SetScale(gp_Pnt(1.0, 0.0, 0.0), 2.0)
    mixed = compound * scaled
    return {
        "rotation_squared": trsf_rows(compound.Powered(2)),
        "rotation_cubed": trsf_rows(compound.Powered(3)),
        "rotation_five": trsf_rows(compound.Powered(5)),
        "rotation_zero": trsf_rows(compound.Powered(0)),
        "rotation_minus_two": trsf_rows(compound.Powered(-2)),
        "mixed_squared": trsf_rows(mixed.Powered(2)),
        "mixed_minus_three": trsf_rows(mixed.Powered(-3)),
    }


@case("transform/coordinate-system")
def transform_coordinate_system() -> dict[str, Any]:
    target = gp_Ax3(gp_Pnt(1.0, 2.0, 3.0), gp_Dir(0.0, 0.0, 1.0), gp_Dir(1.0, 1.0, 0.0))
    source = gp_Ax3(gp_Pnt(-1.0, 0.0, 2.0), gp_Dir(0.0, 1.0, 0.0), gp_Dir(1.0, 0.0, 0.0))
    single = gp_Trsf()
    single.SetTransformation(target)
    between = gp_Trsf()
    between.SetTransformation(source, target)
    inverted = gp_Trsf()
    inverted.SetTransformation(target)
    inverted.Invert()
    return {
        "single": trsf_rows(single),
        "between": trsf_rows(between),
        "inverted": trsf_rows(inverted),
    }


@case("transform/apply")
def transform_apply() -> dict[str, Any]:
    rotation = gp_Trsf()
    rotation.SetRotation(gp_Ax1(gp_Pnt(1.0, 0.0, 0.0), gp_Dir(0.0, 1.0, 1.0)), radians(35.0))
    scale = gp_Trsf()
    scale.SetScale(gp_Pnt(1.0, 1.0, 1.0), -2.0)
    compound = rotation * scale
    point = gp_Pnt(3.0, -1.0, 2.0)
    vector = gp_Vec(3.0, -1.0, 2.0)
    direction = gp_Dir(3.0, -1.0, 2.0)
    return {
        "point": [
            float(coordinate) for coordinate in point.Transformed(compound).Coord()
        ],
        "vector": [
            float(coordinate) for coordinate in vector.Transformed(compound).Coord()
        ],
        "direction": [
            float(coordinate) for coordinate in direction.Transformed(compound).Coord()
        ],
        "direction_positive_scale": [
            float(coordinate) for coordinate in direction.Transformed(rotation).Coord()
        ],
        "scale_factor": compound.ScaleFactor(),
    }


# ---------------------------------------------------------------------------
# gp_Quaternion
# ---------------------------------------------------------------------------


@case("quaternion/from-matrix")
def quaternion_from_matrix() -> dict[str, Any]:
    """Each branch of `SetMatrix`: positive trace, then the x, y and z dominant cases."""
    poses = {
        "identity": (0.0, 0.0, 0.0),
        "small": (10.0, 20.0, 30.0),
        "x_dominant": (180.0, 0.0, 0.0),
        "y_dominant": (0.0, 180.0, 0.0),
        "z_dominant": (0.0, 0.0, 180.0),
        "half_turn_diagonal": (180.0, 90.0, 0.0),
    }
    results: dict[str, Any] = {}
    for key, angles in poses.items():
        source = gp_Quaternion()
        source.SetEulerAngles(
            euler_sequence(Intrinsic.XYZ), *(radians(angle) for angle in angles)
        )
        recovered = gp_Quaternion(source.GetMatrix())
        results[key] = {
            "matrix": mat3_rows(source.GetMatrix()),
            "quaternion": quat_values(recovered),
        }
    return results


@case("quaternion/axis-angle")
def quaternion_axis_angle() -> dict[str, Any]:
    quaternion = gp_Quaternion(gp_Vec(1.0, 2.0, 2.0), radians(75.0))
    axis = gp_Vec()
    (angle,) = quaternion.GetVectorAndAngle(axis)
    identity = gp_Quaternion()
    identity_axis = gp_Vec()
    (identity_angle,) = identity.GetVectorAndAngle(identity_axis)
    return {
        "quaternion": quat_values(quaternion),
        "axis": [float(c) for c in axis.Coord()],
        "angle": degrees(angle),
        "identity_axis": [float(c) for c in identity_axis.Coord()],
        "identity_angle": degrees(identity_angle),
        "matrix": mat3_rows(quaternion.GetMatrix()),
    }


# ---------------------------------------------------------------------------
# gp_Ax3
# ---------------------------------------------------------------------------


@case("ax3/from-normal")
def ax3_from_normal() -> dict[str, Any]:
    """`gp_Ax3(gp_Pnt, gp_Dir)` picks an X direction by zeroing the smallest component."""
    normals = {
        "z": (0.0, 0.0, 1.0),
        "x": (1.0, 0.0, 0.0),
        "y": (0.0, 1.0, 0.0),
        "x_dominant": (3.0, 1.0, 2.0),
        "y_dominant": (1.0, 3.0, 2.0),
        "z_dominant": (1.0, 2.0, 3.0),
        "negative": (-2.0, 1.0, -3.0),
        "equal": (1.0, 1.0, 1.0),
    }
    results: dict[str, Any] = {}
    for key, normal in normals.items():
        frame = gp_Ax3(gp_Pnt(0.0, 0.0, 0.0), gp_Dir(*normal))
        results[key] = {
            "x_dir": [float(c) for c in frame.XDirection().Coord()],
            "y_dir": [float(c) for c in frame.YDirection().Coord()],
            "z_dir": [float(c) for c in frame.Direction().Coord()],
        }
    return results


# ---------------------------------------------------------------------------
# polar coordinates and unit constants
# ---------------------------------------------------------------------------


@case("vector/polar")
def vector_polar() -> dict[str, Any]:
    return {
        "zero": list(polar(5.0, 0.0)),
        "quarter": list(polar(5.0, 90.0)),
        "diagonal": list(polar(2.0, 45.0)),
        "negative_angle": list(polar(3.0, -120.0)),
        "beyond_turn": list(polar(1.0, 450.0)),
        "zero_length": list(polar(0.0, 33.0)),
    }


@case("units/constants")
def units_constants() -> dict[str, Any]:
    return {
        "mc": MC,
        "mm": MM,
        "cm": CM,
        "m": M,
        "in": IN,
        "ft": FT,
        "thou": THOU,
        "g": G,
        "kg": KG,
        "g_per_lb": G_PER_LB,
        "lb": LB,
        "units_per_meter": {unit.value: value for unit, value in UNITS_PER_METER.items()},
        "units_per_kilogram": {unit.value: value for unit, value in UNITS_PER_KILOGRAM.items()},
    }


# ---------------------------------------------------------------------------
# location collections
# ---------------------------------------------------------------------------


@case("locations/points")
def locations_points() -> dict[str, Any]:
    return {
        "mixed": location_list(
            Locations(
                (1.0, 2.0),
                (3.0, 4.0, 5.0),
                Vector(0.0, 0.0, 1.0),
                Location((1.0, 1.0, 1.0), (0.0, 0.0, 45.0)),
                Pos(2.0, 0.0, 0.0),
            )
        ),
        "frames": location_list(Locations(Plane.YZ, Axis.Z, Axis((1.0, 2.0, 3.0), (0.0, 1.0, 0.0)))),
        "nested": location_list(Locations([(1.0, 0.0), (2.0, 0.0)], [(3.0, 0.0)])),
        "empty": location_list(Locations()),
        "empty_group": location_list(Locations([])),
    }


@case("locations/grid")
def locations_grid() -> dict[str, Any]:
    grid = GridLocations(10.0, 20.0, 3, 2)
    return {
        "centered": location_list(grid),
        "size": vec(grid.size),
        "min": vec(grid.min),
        "max": vec(grid.max),
        "single": location_list(GridLocations(10.0, 20.0, 1, 1)),
        "row": location_list(GridLocations(5.0, 5.0, 4, 1)),
    }


@case("locations/grid-align")
def locations_grid_align() -> dict[str, Any]:
    return {
        "min": location_list(GridLocations(10.0, 20.0, 3, 2, align=Align.MIN)),
        "max": location_list(GridLocations(10.0, 20.0, 3, 2, align=Align.MAX)),
        "mixed": location_list(
            GridLocations(10.0, 20.0, 3, 2, align=(Align.MIN, Align.MAX))
        ),
        "none": location_list(GridLocations(10.0, 20.0, 3, 2, align=Align.NONE)),
    }


@case("locations/hex")
def locations_hex() -> dict[str, Any]:
    hexagons = HexLocations(5.0, 3, 4)
    return {
        "minor_radius": location_list(hexagons),
        "apothem": hexagons.apothem,
        "diagonal": hexagons.diagonal,
        "single": location_list(HexLocations(5.0, 1, 1)),
        "aligned_min": location_list(HexLocations(5.0, 3, 4, align=Align.MIN)),
    }


@case("locations/hex-major")
def locations_hex_major() -> dict[str, Any]:
    hexagons = HexLocations(5.0, 2, 3, major_radius=True)
    return {
        "major_radius": location_list(hexagons),
        "apothem": hexagons.apothem,
        "diagonal": hexagons.diagonal,
        "wide": location_list(HexLocations(2.0, 4, 2, major_radius=True)),
    }


@case("locations/polar")
def locations_polar() -> dict[str, Any]:
    return {
        "quarters": location_list(PolarLocations(10.0, 4)),
        "single": location_list(PolarLocations(10.0, 1)),
        "no_rotate": location_list(PolarLocations(10.0, 4, rotate=False)),
        "arc": location_list(PolarLocations(10.0, 3, 30.0, 120.0)),
    }


@case("locations/polar-options")
def locations_polar_options() -> dict[str, Any]:
    return {
        "endpoint": location_list(PolarLocations(10.0, 4, 0.0, 90.0, endpoint=True)),
        "open": location_list(PolarLocations(10.0, 4, 0.0, 90.0)),
        "negative_range": location_list(PolarLocations(4.0, 3, 45.0, -90.0)),
        "single_endpoint": location_list(PolarLocations(10.0, 1, 15.0, 90.0, endpoint=True)),
    }


# ---------------------------------------------------------------------------
# matrix
# ---------------------------------------------------------------------------


@case("matrix/basics")
def matrix_basics() -> dict[str, Any]:
    source = Matrix([[1.0, 2.0, 3.0, 4.0], [5.0, 6.0, 7.0, 8.0], [9.0, 10.0, 11.0, 12.0]])
    rigid = gp_Trsf()
    rigid.SetRotation(gp_Ax1(gp_Pnt(1.0, 0.0, 0.0), gp_Dir(0.0, 0.0, 1.0)), radians(35.0))
    return {
        "rows": matrix_rows(source),
        "identity": matrix_rows(Matrix()),
        "four_rows": matrix_rows(
            Matrix(
                [
                    [1.0, 2.0, 3.0, 4.0],
                    [5.0, 6.0, 7.0, 8.0],
                    [9.0, 10.0, 11.0, 12.0],
                    [0.0, 0.0, 0.0, 1.0],
                ]
            )
        ),
        "from_transform": matrix_rows(Matrix(rigid)),
        "first": source[0, 0],
        "translation_z": source[2, 3],
        "implied_corner": source[3, 3],
        "implied_zero": source[3, 1],
        "transposed": list(source.transposed_list()),
    }


@case("matrix/multiply")
def matrix_multiply() -> dict[str, Any]:
    scale = Matrix([[2.0, 0.0, 0.0, 1.0], [0.0, 3.0, 0.0, 2.0], [0.0, 0.0, 4.0, 3.0]])
    shear = Matrix([[1.0, 0.5, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0], [0.0, 0.0, 1.0, 0.0]])
    rigid = gp_Trsf()
    rigid.SetRotation(gp_Ax1(gp_Pnt(0.0, 0.0, 0.0), gp_Dir(0.0, 0.0, 1.0)), radians(90.0))
    return {
        "scale_then_shear": matrix_rows(shear.multiply(scale)),
        "shear_then_scale": matrix_rows(scale.multiply(shear)),
        "point": vec(Matrix(rigid).multiply(Vector(1.0, 2.0, 3.0))),
    }


@case("matrix/inverse")
def matrix_inverse() -> dict[str, Any]:
    general = Matrix([[2.0, 0.5, 0.0, 1.0], [0.0, 3.0, 0.0, 2.0], [0.0, 0.0, 4.0, 3.0]])
    rigid = gp_Trsf()
    rigid.SetRotation(gp_Ax1(gp_Pnt(1.0, 2.0, 0.0), gp_Dir(0.0, 1.0, 0.0)), radians(40.0))
    return {
        "general": matrix_rows(general.inverse()),
        "roundtrip": matrix_rows(general.multiply(general.inverse())),
        "rigid": matrix_rows(Matrix(rigid).inverse()),
    }


@case("matrix/rotate")
def matrix_rotate() -> dict[str, Any]:
    source = Matrix([[1.0, 0.0, 0.0, 1.0], [0.0, 1.0, 0.0, 2.0], [0.0, 0.0, 1.0, 3.0]])
    source.rotate(Axis.Z, 45.0)
    about_x = Matrix([[2.0, 0.0, 0.0, 0.0], [0.0, 2.0, 0.0, 0.0], [0.0, 0.0, 2.0, 0.0]])
    about_x.rotate(Axis((0.0, 1.0, 0.0), (1.0, 0.0, 0.0)), 90.0)
    return {
        "about_z": matrix_rows(source),
        "about_offset_x": matrix_rows(about_x),
    }


# ---------------------------------------------------------------------------
# oriented bounding box
# ---------------------------------------------------------------------------


def oriented_bounds(box: OrientedBoundBox) -> dict[str, Any]:
    return {
        "center": vec(box.center()),
        "size": vec(box.size),
        "x_direction": vec(box.x_direction),
        "y_direction": vec(box.y_direction),
        "z_direction": vec(box.z_direction),
        "diagonal": box.diagonal,
        "plane": plane(box.plane),
        "location": location(box.location),
        "corners": [coord for corner in box.corners for coord in vec(corner)],
    }


def oriented_box(
    center: tuple[float, float, float],
    x_direction: tuple[float, float, float],
    y_direction: tuple[float, float, float],
    z_direction: tuple[float, float, float],
    half_sizes: tuple[float, float, float],
) -> OrientedBoundBox:
    return OrientedBoundBox(
        Bnd_OBB(
            gp_Pnt(*center),
            gp_Dir(*x_direction),
            gp_Dir(*y_direction),
            gp_Dir(*z_direction),
            *half_sizes,
        )
    )


@case("obb/solid")
def obb_solid() -> dict[str, Any]:
    turned = oriented_box(
        (1.0, 2.0, 3.0), (1.0, 1.0, 0.0), (-1.0, 1.0, 0.0), (0.0, 0.0, 1.0), (2.0, 1.0, 0.5)
    )
    axis_aligned = oriented_box(
        (0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), (1.0, 2.0, 3.0)
    )
    return {"turned": oriented_bounds(turned), "axis_aligned": oriented_bounds(axis_aligned)}


@case("obb/degenerate")
def obb_degenerate() -> dict[str, Any]:
    flat_z = oriented_box(
        (0.0, 0.0, 1.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), (2.0, 1.0, 0.0)
    )
    flat_x = oriented_box(
        (0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), (0.0, 1.0, 2.0)
    )
    flat_y = oriented_box(
        (0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), (1.0, 0.0, 2.0)
    )
    line_x = oriented_box(
        (0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), (3.0, 0.0, 0.0)
    )
    line_z = oriented_box(
        (1.0, 1.0, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), (0.0, 0.0, 2.0)
    )
    return {
        "flat_z": oriented_bounds(flat_z),
        "flat_x": oriented_bounds(flat_x),
        "flat_y": oriented_bounds(flat_y),
        "line_x": oriented_bounds(line_x),
        "line_z": oriented_bounds(line_z),
    }


@case("obb/predicates")
def obb_predicates() -> dict[str, Any]:
    outer = oriented_box(
        (0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), (5.0, 5.0, 5.0)
    )
    inner = oriented_box(
        (1.0, 0.0, 0.0), (1.0, 1.0, 0.0), (-1.0, 1.0, 0.0), (0.0, 0.0, 1.0), (1.0, 1.0, 1.0)
    )
    straddling = oriented_box(
        (4.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), (2.0, 1.0, 1.0)
    )
    return {
        "inner_inside": outer.is_completely_inside(inner),
        "outer_inside_inner": inner.is_completely_inside(outer),
        "straddling_inside": outer.is_completely_inside(straddling),
        "self_inside": outer.is_completely_inside(outer),
        "center_outside": outer.is_outside(Vector(0.0, 0.0, 0.0)),
        "corner_outside": outer.is_outside(Vector(5.0, 5.0, 5.0)),
        "beyond_outside": outer.is_outside(Vector(5.0, 5.0, 5.001)),
        "rotated_outside": inner.is_outside(Vector(2.4, 0.0, 0.0)),
        "rotated_inside_corner": inner.is_outside(Vector(2.41, 0.0, 0.0)),
    }


# ---------------------------------------------------------------------------
# intersections
# ---------------------------------------------------------------------------


@case("intersect/vector")
def intersect_vector() -> dict[str, Any]:
    point = Vector(3.0, 0.0, 0.0)
    return {
        "same_point": intersection(point.intersect((3.0, 0.0, 0.0))),
        "other_point": intersection(point.intersect((3.0, 1.0, 0.0))),
        "on_axis": intersection(point.intersect(Axis.X)),
        "off_axis": intersection(point.intersect(Axis.Y)),
        "on_plane": intersection(point.intersect(Plane.XY)),
        "off_plane": intersection(point.intersect(Plane.XY.offset(1.0))),
        "on_location": intersection(point.intersect(Location((3.0, 0.0, 0.0), (0.0, 0.0, 45.0)))),
        "off_location": intersection(point.intersect(Location((3.0, 0.0, 1.0)))),
    }


@case("intersect/axis-axis")
def intersect_axis_axis() -> dict[str, Any]:
    return {
        "coaxial": intersection(Axis.X.intersect(Axis.X)),
        "coaxial_shifted": intersection(Axis.X.intersect(Axis((5.0, 0.0, 0.0), (1.0, 0.0, 0.0)))),
        "antiparallel_coincident": intersection(
            Axis.X.intersect(Axis((5.0, 0.0, 0.0), (-1.0, 0.0, 0.0)))
        ),
        "antiparallel_oblique": intersection(
            Axis((0.0, 0.0, 0.0), (1.0, 1.0, 0.0)).intersect(
                Axis((4.0, 4.0, 0.0), (-1.0, -1.0, 0.0))
            )
        ),
        "parallel_distinct": intersection(Axis.X.intersect(Axis((0.0, 1.0, 0.0), (1.0, 0.0, 0.0)))),
        "crossing": intersection(Axis.X.intersect(Axis((2.0, 0.0, 0.0), (0.0, 1.0, 0.0)))),
        "crossing_oblique": intersection(
            Axis((0.0, 0.0, 0.0), (1.0, 1.0, 0.0)).intersect(
                Axis((2.0, 0.0, 0.0), (-1.0, 1.0, 0.0))
            )
        ),
        "crossing_in_space": intersection(
            Axis((0.0, 0.0, 1.0), (1.0, 0.0, 1.0)).intersect(
                Axis((2.0, 0.0, 3.0), (0.0, 1.0, 0.0))
            )
        ),
        "skew": intersection(Axis.X.intersect(Axis((0.0, 0.0, 1.0), (0.0, 1.0, 0.0)))),
    }


@case("intersect/axis-other")
def intersect_axis_other() -> dict[str, Any]:
    return {
        "point_on": intersection(Axis.X.intersect((3.0, 0.0, 0.0))),
        "point_off": intersection(Axis.X.intersect((3.0, 1.0, 0.0))),
        "location_aligned": intersection(Axis.Z.intersect(Location((0.0, 0.0, 5.0)))),
        "location_turned": intersection(Axis.Z.intersect(Location((0.0, 0.0, 5.0), (0.0, 90.0, 0.0)))),
        "location_spun": intersection(Axis.Z.intersect(Location((0.0, 0.0, 5.0), (0.0, 0.0, 30.0)))),
        "location_off": intersection(Axis.Z.intersect(Location((1.0, 0.0, 5.0)))),
        "plane_crossing": intersection(Axis.Z.intersect(Plane.XY)),
        "plane_contained": intersection(Axis.X.intersect(Plane.XY)),
        "plane_parallel": intersection(Axis.X.intersect(Plane.XY.offset(2.0))),
    }


@case("intersect/plane-plane")
def intersect_plane_plane() -> dict[str, Any]:
    tilted = Plane(origin=(1.0, 2.0, 3.0), x_dir=(1.0, 1.0, 0.0), z_dir=(0.0, 0.0, 1.0))
    return {
        "same": intersection(Plane.XY.intersect(Plane.XY)),
        "same_shifted_origin": intersection(
            Plane.XY.intersect(Plane(origin=(3.0, 4.0, 0.0), z_dir=(0.0, 0.0, 1.0)))
        ),
        "reversed": intersection(Plane.XY.intersect(Plane.XY.reverse())),
        "parallel": intersection(Plane.XY.intersect(Plane.XY.offset(5.0))),
        "perpendicular": intersection(Plane.XY.intersect(Plane.YZ)),
        "offset_perpendicular": intersection(
            Plane(origin=(1.0, 2.0, 3.0), z_dir=(0.0, 0.0, 1.0)).intersect(
                Plane(origin=(0.0, 0.0, 0.0), x_dir=(1.0, 0.0, 0.0), z_dir=(0.0, 1.0, 0.0))
            )
        ),
        "oblique": intersection(
            tilted.intersect(Plane(origin=(-1.0, 0.0, 2.0), x_dir=(0.0, 1.0, 1.0), z_dir=(1.0, 2.0, 3.0)))
        ),
        "shallow": intersection(
            Plane.XY.intersect(Plane(origin=(0.0, 0.0, 1.0), z_dir=(1e-5, 0.0, 1.0)))
        ),
        "nearly_parallel": intersection(
            Plane.XY.intersect(Plane(origin=(0.0, 0.0, 1.0), z_dir=(1e-7, 0.0, 1.0)))
        ),
    }


@case("intersect/plane-other")
def intersect_plane_other() -> dict[str, Any]:
    return {
        "axis_contained": intersection(Plane.XY.intersect(Axis((0.0, 0.0, 0.0), (1.0, 1.0, 0.0)))),
        "axis_crossing": intersection(Plane.XY.intersect(Axis((1.0, 2.0, 3.0), (0.0, 0.0, 1.0)))),
        "axis_oblique": intersection(Plane.XY.intersect(Axis((1.0, 2.0, 3.0), (1.0, 1.0, -1.0)))),
        "axis_parallel_off": intersection(Plane.XY.intersect(Axis((0.0, 0.0, 1.0), (1.0, 0.0, 0.0)))),
        "point_on": intersection(Plane.XY.intersect((1.0, 2.0, 0.0))),
        "point_within_tolerance": intersection(Plane.XY.intersect((1.0, 2.0, 1e-7))),
        "point_off": intersection(Plane.XY.intersect((1.0, 2.0, 1e-5))),
        "location_on": intersection(Plane.XY.intersect(Location((1.0, 2.0, 0.0)))),
        "location_turned": intersection(
            Plane.XY.intersect(Location((1.0, 2.0, 0.0), (0.0, 90.0, 0.0)))
        ),
        "location_spun": intersection(
            Plane.XY.intersect(Location((1.0, 2.0, 0.0), (0.0, 0.0, 30.0)))
        ),
        "location_off": intersection(Plane.XY.intersect(Location((1.0, 2.0, 3.0)))),
    }


@case("intersect/location")
def intersect_location() -> dict[str, Any]:
    source = Location((1.0, 2.0, 3.0), (0.0, 0.0, 45.0))
    return {
        "same": intersection(source.intersect(Location((1.0, 2.0, 3.0), (0.0, 0.0, 45.0)))),
        "same_position": intersection(source.intersect(Location((1.0, 2.0, 3.0), (0.0, 0.0, 90.0)))),
        "different": intersection(source.intersect(Location((1.0, 2.0, 4.0), (0.0, 0.0, 45.0)))),
        "point_on": intersection(source.intersect((1.0, 2.0, 3.0))),
        "point_off": intersection(source.intersect((1.0, 2.0, 3.5))),
        "axis_through": intersection(Location((0.0, 0.0, 5.0)).intersect(Axis.Z)),
        "axis_off": intersection(source.intersect(Axis.Z)),
        "plane_on": intersection(Location((1.0, 2.0, 0.0)).intersect(Plane.XY)),
        "plane_off": intersection(source.intersect(Plane.XY)),
    }


@case("location/iteration")
def location_iteration() -> dict[str, Any]:
    position, orientation = Location((1.0, 2.0, 3.0), (10.0, 20.0, 30.0))
    return {"position": vec(position), "orientation": vec(orientation)}


@case("plane/move")
def plane_move() -> dict[str, Any]:
    """`move` relocates the plane in place, so each call starts from a fresh source."""

    def source() -> Plane:
        return Plane(origin=(1.0, 0.0, 0.0), x_dir=(1.0, 0.0, 0.0), z_dir=(0.0, 0.0, 1.0))

    mutated = source()
    returned = mutated.move(Location((0.0, 2.0, 0.0), (0.0, 0.0, 90.0)))
    return {
        "by_location": plane(returned),
        "mutated_in_place": plane(mutated),
        "by_plane": plane(source().move(Plane.YZ)),
    }


@case("bounding-box/find-outside-2d")
def bounding_box_find_outside_2d() -> dict[str, Any]:
    outer = bbox((0.0, 0.0, 0.0), (10.0, 10.0, 10.0))
    inner = bbox((1.0, 1.0, -5.0), (2.0, 2.0, 50.0))
    flush = bbox((0.0, 1.0, 0.0), (10.0, 2.0, 1.0))
    separate = bbox((20.0, 20.0, 0.0), (21.0, 21.0, 1.0))
    first_outside = BoundBox.find_outside_box_2d(outer, inner)
    second_outside = BoundBox.find_outside_box_2d(inner, outer)
    return {
        "first_encloses": None if first_outside is None else bounds(first_outside),
        "second_encloses": None if second_outside is None else bounds(second_outside),
        "touching_edges": BoundBox.find_outside_box_2d(outer, flush) is None,
        "disjoint": BoundBox.find_outside_box_2d(outer, separate) is None,
        "identical": BoundBox.find_outside_box_2d(outer, outer) is None,
    }


@case("bounding-box/is-inside")
def bounding_box_is_inside() -> dict[str, Any]:
    """`is_inside` is deprecated upstream and simply defers to `within`."""
    outer = bbox((0.0, 0.0, 0.0), (10.0, 10.0, 10.0))
    inner = bbox((1.0, 1.0, 1.0), (2.0, 2.0, 2.0))
    flush = bbox((0.0, 0.0, 0.0), (10.0, 10.0, 5.0))
    straddling = bbox((5.0, 5.0, 5.0), (15.0, 15.0, 15.0))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        return {
            "nested": inner.is_inside(outer),
            "reversed": outer.is_inside(inner),
            "flush": flush.is_inside(outer),
            "straddling": straddling.is_inside(outer),
            "self": outer.is_inside(outer),
            "matches_within": inner.is_inside(outer) == inner.within(outer),
            "loose_tolerance": straddling.is_inside(outer, 10.0),
        }
