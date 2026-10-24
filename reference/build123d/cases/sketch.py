"""Oracle cases for the 2D sketch objects and the operations that build faces from curves.

`shape_metrics` pins down area, bounds and topology; the sorted vertex coordinates and edge
lengths pin down placement and proportions, which area alone would not.
"""

from __future__ import annotations

from typing import Any

from build123d import (
    Align,
    Circle,
    Edge,
    Ellipse,
    Line,
    Plane,
    Polygon,
    Polyline,
    Rectangle,
    RectangleRounded,
    RegularPolygon,
    SlotArc,
    SlotCenterPoint,
    SlotCenterToCenter,
    SlotOverall,
    Superellipse,
    Trapezoid,
    Triangle,
    chamfer,
    fillet,
    make_face,
    make_hull,
)

from oracle import case, shape_metrics, vec


def sketch(value: Any) -> dict[str, Any]:
    """Metrics plus the vertex cloud and edge lengths that fix a face's shape and placement."""
    return {
        "shape": shape_metrics(value),
        "area": float(value.area),
        "vertices": sorted(vec(vertex) for vertex in value.vertices()),
        "edge_lengths": sorted(float(edge.length) for edge in value.edges()),
    }


# ---------------------------------------------------------------------------
# Rectangles
# ---------------------------------------------------------------------------


@case("rectangle/centered")
def rectangle_centered():
    return sketch(Rectangle(8, 5))


@case("rectangle/min-aligned")
def rectangle_min_aligned():
    return sketch(Rectangle(8, 5, align=(Align.MIN, Align.MIN)))


@case("rectangle/rotated")
def rectangle_rotated():
    return sketch(Rectangle(8, 5, rotation=30))


@case("rectangle/rotated-max-aligned")
def rectangle_rotated_max_aligned():
    return sketch(Rectangle(6, 4, rotation=20, align=(Align.MAX, Align.MIN)))


@case("rectangle/unaligned")
def rectangle_unaligned():
    return sketch(Rectangle(6, 4, align=None))


@case("rectangle-rounded/basic")
def rectangle_rounded_basic():
    return sketch(RectangleRounded(8, 5, 1))


@case("rectangle-rounded/rotated")
def rectangle_rounded_rotated():
    return sketch(RectangleRounded(10, 6, 2, rotation=25, align=(Align.MIN, Align.CENTER)))


# ---------------------------------------------------------------------------
# Circles, ellipses and superellipses
# ---------------------------------------------------------------------------


@case("circle/full")
def circle_full():
    return sketch(Circle(4))


@case("circle/sector")
def circle_sector():
    return sketch(Circle(4, arc_size=120))


@case("circle/min-aligned")
def circle_min_aligned():
    return sketch(Circle(3, align=(Align.MIN, Align.MAX)))


@case("ellipse/basic")
def ellipse_basic():
    return sketch(Ellipse(5, 2))


@case("ellipse/rotated")
def ellipse_rotated():
    return sketch(Ellipse(5, 2, rotation=35, align=(Align.MIN, Align.MIN)))


@case("ellipse/tall")
def ellipse_tall():
    return sketch(Ellipse(2, 6))


@case("superellipse/order-four")
def superellipse_order_four():
    return sketch(Superellipse(8, 5))


@case("superellipse/order-one")
def superellipse_order_one():
    return sketch(Superellipse(8, 5, order=1))


@case("superellipse/order-two")
def superellipse_order_two():
    return sketch(Superellipse(8, 5, order=2))


@case("superellipse/order-three")
def superellipse_order_three():
    return sketch(Superellipse(6, 4, order=3, point_count=12, rotation=10))


# ---------------------------------------------------------------------------
# Polygons
# ---------------------------------------------------------------------------


@case("polygon/triangle")
def polygon_triangle():
    return sketch(Polygon((0, 0), (5, 0), (2, 4)))


@case("polygon/centered")
def polygon_centered():
    return sketch(Polygon((0, 0), (5, 0), (5, 3), (0, 3), align=(Align.CENTER, Align.CENTER)))


@case("polygon/rotated")
def polygon_rotated():
    return sketch(Polygon((0, 0), (6, 0), (6, 2), (3, 5), rotation=15))


@case("regular-polygon/hexagon")
def regular_polygon_hexagon():
    return sketch(RegularPolygon(4, 6))


@case("regular-polygon/pentagon-apothem")
def regular_polygon_pentagon_apothem():
    return sketch(RegularPolygon(4, 5, major_radius=False))


@case("regular-polygon/rotated")
def regular_polygon_rotated():
    return sketch(RegularPolygon(3, 7, rotation=12))


@case("regular-polygon/min-aligned")
def regular_polygon_min_aligned():
    return sketch(RegularPolygon(3, 4, align=(Align.MIN, Align.MIN)))


# ---------------------------------------------------------------------------
# Triangles and trapezoids
# ---------------------------------------------------------------------------


@case("triangle/sss")
def triangle_sss():
    return sketch(Triangle(a=3, b=4, c=5))


@case("triangle/sas")
def triangle_sas():
    return sketch(Triangle(a=4, b=6, C=60))


@case("triangle/asa")
def triangle_asa():
    return sketch(Triangle(A=40, c=7, B=75))


@case("triangle/aligned")
def triangle_aligned():
    return sketch(Triangle(a=3, b=4, c=5, align=(Align.MIN, Align.MIN)))


@case("triangle/rotated")
def triangle_rotated():
    return sketch(Triangle(a=5, B=50, c=6, rotation=20))


@case("trapezoid/symmetric")
def trapezoid_symmetric():
    return sketch(Trapezoid(8, 4, 70))


@case("trapezoid/asymmetric")
def trapezoid_asymmetric():
    return sketch(Trapezoid(10, 5, 60, 80))


@case("trapezoid/obtuse")
def trapezoid_obtuse():
    return sketch(Trapezoid(8, 3, 110, 90))


@case("trapezoid/rotated-aligned")
def trapezoid_rotated_aligned():
    return sketch(Trapezoid(8, 4, 70, rotation=15, align=(Align.MIN, Align.MAX)))


# ---------------------------------------------------------------------------
# Slots
# ---------------------------------------------------------------------------


@case("slot-center-to-center/basic")
def slot_center_to_center_basic():
    return sketch(SlotCenterToCenter(8, 3))


@case("slot-center-to-center/degenerate")
def slot_center_to_center_degenerate():
    return sketch(SlotCenterToCenter(0, 4))


@case("slot-overall/basic")
def slot_overall_basic():
    return sketch(SlotOverall(10, 4))


@case("slot-overall/aligned")
def slot_overall_aligned():
    return sketch(SlotOverall(10, 4, rotation=25, align=(Align.MIN, Align.MIN)))


@case("slot-overall/circle")
def slot_overall_circle():
    return sketch(SlotOverall(4, 4))


@case("slot-center-point/basic")
def slot_center_point_basic():
    return sketch(SlotCenterPoint((0, 0), (4, 0), 3))


@case("slot-center-point/angled")
def slot_center_point_angled():
    return sketch(SlotCenterPoint((1, 1), (4, 5), 2))


@case("slot-arc/circular")
def slot_arc_circular():
    return sketch(SlotArc(Edge.make_circle(5, start_angle=0, end_angle=90), 2))


@case("slot-arc/rotated")
def slot_arc_rotated():
    return sketch(SlotArc(Edge.make_circle(4, start_angle=30, end_angle=200), 1.5, rotation=10))


# ---------------------------------------------------------------------------
# 2D operations
# ---------------------------------------------------------------------------


@case("make-face/from-polyline")
def make_face_from_polyline():
    return sketch(make_face(Polyline((0, 0), (5, 0), (5, 3), (0, 3), close=True)))


@case("make-face/from-edges")
def make_face_from_edges():
    perimeter = [
        Edge.make_line((0, 0), (6, 0)),
        Edge.make_circle(3, Plane((3, 0)), start_angle=0, end_angle=180),
    ]
    return sketch(make_face(perimeter))


@case("make-hull/two-arcs")
def make_hull_two_arcs():
    edges = [
        Edge.make_circle(2, Plane((-3, 0)), start_angle=90, end_angle=270),
        Edge.make_circle(1, Plane((3, 0)), start_angle=-90, end_angle=90),
    ]
    return sketch(make_hull(edges))


@case("make-hull/line-and-arc")
def make_hull_line_and_arc():
    edges = [
        *Line((-4, -3), (4, -3)).edges(),
        Edge.make_circle(2, Plane((0, 2)), start_angle=0, end_angle=180),
    ]
    return sketch(make_hull(edges))


@case("fillet-2d/rectangle-corners")
def fillet_2d_rectangle_corners():
    base = Rectangle(8, 5)
    return sketch(fillet(base.vertices(), 1))


@case("fillet-2d/two-corners")
def fillet_2d_two_corners():
    base = Rectangle(8, 5)
    corners = base.vertices().filter_by(lambda v: v.X > 0)
    return sketch(fillet(corners, 1.5))


@case("chamfer-2d/rectangle-corners")
def chamfer_2d_rectangle_corners():
    base = Rectangle(8, 5)
    return sketch(chamfer(base.vertices(), 1))


@case("chamfer-2d/asymmetric")
def chamfer_2d_asymmetric():
    base = Rectangle(8, 5)
    corners = base.vertices().filter_by(lambda v: v.X > 0)
    return sketch(chamfer(corners, 1, length2=2))
