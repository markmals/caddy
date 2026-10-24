"""Oracle cases for `Face`: the makers that start from a surface or a swept curve, and the
members that read a face's surface, holes and symmetry.

Every shape is built from a primitive maker, an explicit wire or a boolean of those, so the
TypeScript side can reproduce the same geometry through Caddy's own `Face`, `Edge` and `Solid`
makers.
"""

from __future__ import annotations

import math
from typing import Any

from build123d import (
    Axis,
    Edge,
    Face,
    GeomType,
    Plane,
    Pos,
    Shell,
    Solid,
    Vector,
    Wire,
)

from oracle import case, location, shape_metrics, vec

# ---- shapes under test ----


def _bezier_points() -> list[list[tuple[float, float, float]]]:
    """A 3x3 control net with a raised centre column and row."""
    return [
        [
            (x, y, 2 if x == 0 and y == 0 else 1 if x == 0 or y == 0 else 0)
            for x in range(-1, 2)
        ]
        for y in range(-1, 2)
    ]


def _bezier_weights() -> list[list[float]]:
    return [[2 if x == 0 or y == 0 else 1 for x in range(-1, 2)] for y in range(-1, 2)]


def _fitted_points() -> list[list[tuple[float, float, float]]]:
    return [
        [
            (x, y, math.cos(math.pi * x / 10) + math.sin(math.pi * y / 10))
            for x in range(11)
        ]
        for y in range(11)
    ]


def _frame() -> Face:
    """A square plate with a square hole."""
    return (Face.make_rect(1, 1) - Face.make_rect(0.5, 0.5)).face()


def _plate_with_hole() -> Face:
    outer = Wire.make_polygon([(0, 0, 0), (20, 0, 0), (20, 12, 0), (0, 12, 0)])
    inner = Wire.make_circle(3, Plane(origin=(10, 6, 0)))
    return Face(outer, [inner])


def _cylinder_wall() -> Face:
    return Solid.make_cylinder(3, 8).faces().filter_by(GeomType.PLANE, reverse=True)[0]


def _drilled_wall() -> Face:
    """The wall of a cylinder with a smaller cylinder drilled across it, so it has two holes."""
    drilled = Solid.make_cylinder(1, 3) - Solid.make_cylinder(
        0.5, 3, Plane(origin=(0, -1.5, 1.5), z_dir=(0, 1, 0))
    )
    return drilled.faces().sort_by(Face.area).last


def _cone_wall() -> Face:
    return Solid.make_cone(0, 3, 5).faces().filter_by(GeomType.CONE)[0]


def _canonical(direction: Vector) -> list[float]:
    """An axis has no preferred direction; compare both sides with a positive leading component."""
    components = vec(direction)
    leading = next((value for value in components if abs(value) > 1e-9), 1.0)
    sign = -1.0 if leading < 0 else 1.0
    return [value * sign for value in components]


def _axes(face: Face) -> dict[str, Any]:
    """Symmetry axes, sorted the way the TypeScript side sorts them."""
    axes = face.axes_of_symmetry
    return {
        "count": len(axes),
        "directions": sorted([_canonical(axis.direction) for axis in axes]),
        "positions": [vec(axis.position) for axis in axes],
    }


def _axis(face: Face) -> dict[str, Any] | None:
    axis = face.axis_of_rotation
    return None if axis is None else {"position": vec(axis.position), "direction": vec(axis.direction)}


# ---- makers ----


@case("makers/bezier-surface")
def makers_bezier_surface() -> dict[str, Any]:
    """A Bézier surface follows its control net without interpolating the inner points."""
    plain = Face.make_bezier_surface(_bezier_points())
    weighted = Face.make_bezier_surface(_bezier_points(), _bezier_weights())
    return {
        "plain": shape_metrics(plain),
        "weighted": shape_metrics(weighted),
        "plain_center": vec(plain.position_at(0.5, 0.5)),
        "weighted_center": vec(weighted.position_at(0.5, 0.5)),
    }


@case("makers/surface-from-array-of-points")
def makers_surface_from_array_of_points() -> dict[str, Any]:
    """A B-spline surface fitted through an 11x11 grid."""
    fitted = Face.make_surface_from_array_of_points(_fitted_points())
    return {
        "fitted": shape_metrics(fitted),
        "corner": vec(fitted.position_at(0, 0)),
        "center": vec(fitted.position_at(0.5, 0.5)),
    }


@case("makers/variational-smoothing")
def makers_variational_smoothing() -> dict[str, Any]:
    """Variational smoothing keeps the fit inside the same bounds with a smoother surface."""
    smoothed = Face.make_surface_from_array_of_points(
        _fitted_points(), smoothing=(1.0, 1.0, 1.0)
    )
    return {"smoothed": shape_metrics(smoothed), "center": vec(smoothed.position_at(0.5, 0.5))}


@case("makers/surface-from-curves-edges")
def makers_surface_from_curves_edges() -> dict[str, Any]:
    """A ruled face between two quarter circles one unit apart."""
    bottom = Edge.make_circle(radius=1, end_angle=90)
    top = Edge.make_circle(radius=1, plane=Plane((0, 0, 1)), end_angle=90)
    ruled = Face.make_surface_from_curves(bottom, top)
    return {"ruled": shape_metrics(ruled), "normal_at": vec(ruled.normal_at())}


@case("makers/surface-from-curves-wires")
def makers_surface_from_curves_wires() -> dict[str, Any]:
    """Two closed wires give a shell, not a face."""
    bottom = Wire.make_circle(1)
    top = Wire.make_circle(1, Plane((0, 0, 1)))
    ruled = Face.make_surface_from_curves(bottom, top)
    return {"ruled": shape_metrics(ruled)}


# `Face.make_surface_patch` is left out of this suite: OCCT's plate solver converges slightly
# differently in the OCP wheel's kernel and in Caddy's own OCCT build. With identical input
# edges (lengths equal to 1e-12) and the same `BRepOffsetAPI_MakeFilling` defaults, the raw
# filling of the three reference splines measures 696.3374116206876 under OCP and
# 696.3529294304421 under Caddy — 2.2e-5 relative, far above any fitted-geometry tolerance.


@case("makers/extrude")
def makers_extrude() -> dict[str, Any]:
    """An edge extrudes into a face."""
    extruded = Face.extrude(Edge.make_line((0, 0, 0), (10, 0, 0)), (0, 0, 4))
    return {"extruded": shape_metrics(extruded), "normal_at": vec(extruded.normal_at())}


@case("makers/revolve")
def makers_revolve() -> dict[str, Any]:
    """A line revolved about an axis it is parallel to gives a cylindrical face."""
    full = Face.revolve(Edge.make_line((3, 0, 0), (3, 2, 0)), 360, Axis.Y)
    quarter = Face.revolve(Edge.make_line((3, 0, 0), (3, 2, 0)), 90, Axis.Y)
    return {"full": shape_metrics(full), "quarter": shape_metrics(quarter)}


@case("makers/sweep")
def makers_sweep() -> dict[str, Any]:
    """A radial segment swept around a circle gives an annulus.

    build123d keeps OCCT's one-face pipe shell and labels it a `Face`; Caddy returns the face
    inside it, so the fixture records the geometry rather than the class.
    """
    swept = Face.sweep(Edge.make_line((1, 0, 0), (2, 0, 0)), Wire.make_circle(1))
    return {
        "class_name": type(swept).__name__,
        "shape_type": swept.wrapped.ShapeType().name.removeprefix("TopAbs_"),
        "area": float(swept.area),
        "face_count": len(swept.faces()),
        "bounding_box": {
            "min": vec(swept.bounding_box().min),
            "max": vec(swept.bounding_box().max),
        },
    }


@case("makers/sew-faces")
def makers_sew_faces() -> dict[str, Any]:
    """Twelve unit patches on three levels sew into three sheets of four."""
    patches = [
        Face.make_rect(1, 1, Plane((x, y, z)))
        for x in range(2)
        for y in range(2)
        for z in range(3)
    ]
    sheets = Face.sew_faces(patches)
    return {
        "sheet_count": len(sheets),
        "sheet_sizes": [len(sheet) for sheet in sheets],
        "sheet_areas": [float(sum(face.area for face in sheet)) for sheet in sheets],
        "class_names": sorted({type(face).__name__ for sheet in sheets for face in sheet}),
    }


# ---- members ----


@case("members/make-holes")
def members_make_holes() -> dict[str, Any]:
    """A hole wire inside a planar face, and holes put back into a cylindrical wall."""
    plate = Face.make_rect(20, 12)
    hole = Wire.make_circle(3, Plane(origin=(5, 2, 0)))
    holed = plate.make_holes([hole])

    drilled = _drilled_wall()
    reholed = drilled.without_holes().make_holes(drilled.inner_wires())
    return {
        "holed": shape_metrics(holed),
        "holed_inner_wire_count": len(holed.inner_wires()),
        "reholed": shape_metrics(reholed),
        "drilled_area": float(drilled.area),
    }


@case("members/without-holes")
def members_without_holes() -> dict[str, Any]:
    """Filling the holes of a planar and of a cylindrical face."""
    frame = _frame()
    plate = _plate_with_hole()
    drilled = _drilled_wall()
    rect = Face.make_rect(1, 1)
    return {
        "frame": shape_metrics(frame),
        "filled": shape_metrics(frame.without_holes()),
        "drilled": shape_metrics(drilled),
        "drilled_filled": shape_metrics(drilled.without_holes()),
        "frame_area_without_holes": float(frame.area_without_holes),
        "plate_area_without_holes": float(plate.area_without_holes),
        "rect_unchanged": bool(rect == rect.without_holes()),
    }


@case("members/axes-of-symmetry")
def members_axes_of_symmetry() -> dict[str, Any]:
    """Symmetry axes of a square, a rectangle, a holed plate and a triangle."""
    square = Face.make_rect(1, 1)
    rectangle = Face.make_rect(1, 2)
    holed = (Face.make_rect(1, 2) - Pos(0, 0.25, 0) * Face.make_rect(0.4, 0.4)).face()
    triangle = Face(Wire.make_polygon([(0, 0, 0), (1, 0, 0), (0, 0.5, 0)]))
    notched_disc = (Face(Wire.make_circle(2)) - Pos(0.1, 0, 0) * Face.make_rect(0.5, 0.5)).face()
    return {
        "square": _axes(square),
        "rectangle": _axes(rectangle),
        "holed": _axes(holed),
        "triangle": _axes(triangle),
        "notched_disc": _axes(notched_disc),
    }


@case("members/axis-of-rotation")
def members_axis_of_rotation() -> dict[str, Any]:
    """Only surfaces of revolution have an axis."""
    sphere = Solid.make_sphere(2).faces()[0]
    torus = Solid.make_torus(5, 1).faces()[0]
    revolved = Face.revolve(Edge.make_spline([(1, 0, 0), (1.5, 0, 1), (1, 0, 2)]), 90, Axis.Z)
    return {
        "cylinder": _axis(_cylinder_wall()),
        "cone": _axis(_cone_wall()),
        "sphere": _axis(sphere),
        "torus": _axis(torus),
        "revolution": _axis(revolved),
        "plane": _axis(Face.make_rect(1, 1)),
    }


@case("members/center-location")
def members_center_location() -> dict[str, Any]:
    """The frame at the middle of a face's parameter range."""
    square = Face.make_rect(1, 1, plane=Plane.XZ)
    wall = _cylinder_wall()
    return {
        "square": location(square.center_location),
        "wall": location(wall.center_location),
        "wall_center": vec(wall.position_at(0.5, 0.5)),
    }


@case("members/geometry")
def members_geometry() -> dict[str, Any]:
    """Square, rectangle, polygon and curved outlines."""
    box = Solid.make_box(1, 1, 2)
    triangle = Face(Wire.make_polygon([(0, 0, 0), (1, 0, 0), (0, 1, 0)]))
    return {
        "square": box.faces().sort_by(Axis.Z).last.geometry,
        "rectangle": box.faces().sort_by(Axis.Y).last.geometry,
        "polygon": triangle.geometry,
        "plate_with_hole": _plate_with_hole().geometry,
        "cylinder": _cylinder_wall().geometry,
    }


@case("members/location-at")
def members_location_at() -> dict[str, Any]:
    """Placements by parameter, by point, with an X direction, and on a reversed face."""
    bottom = Solid.make_box(1, 2, 3).faces().sort_by(Axis.Z)[0]
    front = Solid.make_box(1, 2, 3).faces().sort_by(Axis.X)[0]
    wall = _cylinder_wall()
    rect = Face.make_rect(34, 10)
    return {
        "bottom": location(bottom.location_at(0.5, 0.5)),
        "front_x_dir": location(front.location_at(0.5, 0.5, x_dir=(0, 0, 1))),
        "by_point": location(bottom.location_at(bottom.position_at(0, 0))),
        "wall_center": location(wall.location_at()),
        "wall_uv": location(wall.location_at(0, 1)),
        "rect": location(rect.location_at()),
        "rect_flipped": location((-rect).location_at()),
    }


@case("members/shell-location-at")
def members_shell_location_at() -> dict[str, Any]:
    """A shell places the point on its nearest face, with or without an X direction."""
    shell = Shell(Solid.make_box(1, 2, 3).faces())
    return {
        "side": location(shell.location_at((1.2, 1, 1.5))),
        "top_x_dir": location(shell.location_at((0.5, 1, 3.1), x_dir=(0, 1, 0))),
    }


@case("members/semi-angle")
def members_semi_angle() -> dict[str, Any]:
    """Only an untrimmed cone has a semi angle."""
    return {
        "cone": _cone_wall().semi_angle,
        "cylinder": _cylinder_wall().semi_angle,
        "plane": Face.make_rect(1, 1).semi_angle,
    }


@case("members/uv-face")
def members_uv_face() -> dict[str, Any]:
    """A face's boundary drawn in its own parameter space."""
    wall = _cylinder_wall()
    plate = _plate_with_hole()
    return {
        "wall": shape_metrics(wall.uv_face),
        "plate": shape_metrics(plate.uv_face),
        "plate_inner_wire_count": len(plate.uv_face.inner_wires()),
    }
