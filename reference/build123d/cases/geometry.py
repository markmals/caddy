"""Oracle cases for the pure-math geometry classes ported in `@roonieone/caddy`.

Every case here is pure `gp`-level arithmetic: vectors, axes, planes, locations,
bounding boxes and the OCCT primitives underneath them (`gp_Trsf`,
`gp_Quaternion`, `gp_Ax3`). Nothing touches topology, so the Caddy side can
answer each case without the native kernel.
"""

from __future__ import annotations

from math import degrees, radians
from typing import Any

from build123d import (
    Align,
    Axis,
    BoundBox,
    Extrinsic,
    Intrinsic,
    Location,
    Matrix,
    Plane,
    Pos,
    Rotation,
    Vector,
)
from build123d.geometry import to_align_offset
from OCP.Bnd import Bnd_Box
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
