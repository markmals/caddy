"""Oracle cases for the 1D curve objects and the Edge/Wire makers behind them.

Every case records `shape_metrics` plus the positions and tangents that pin down where a curve
starts, ends and runs, so a port cannot match the metrics with a differently placed curve.
"""

from __future__ import annotations

from typing import Any

from build123d import (
    Airfoil,
    AngularDirection,
    Axis,
    Bezier,
    BlendCurve,
    BSpline,
    CenterArc,
    ConstrainedArcs,
    ConstrainedLines,
    ContinuityLevel,
    Curve,
    DoubleTangentArc,
    Edge,
    EllipticalCenterArc,
    EllipticalStartArc,
    FilletPolyline,
    Helix,
    HyperbolicCenterArc,
    IntersectingLine,
    JernArc,
    Keep,
    Kind,
    LengthMode,
    Line,
    ParabolicCenterArc,
    PolarLine,
    Polyline,
    RadiusArc,
    Sagitta,
    SagittaArc,
    Side,
    Spline,
    Tangency,
    TangentArc,
    ThreePointArc,
    Vertex,
    Wire,
)
from build123d import Plane

from oracle import case, shape_metrics, vec


def curve(value: Any) -> dict[str, Any]:
    """Metrics plus the sample points that fix a curve in space."""
    return {
        "shape": shape_metrics(value),
        "length": float(value.length),
        "start": vec(value.position_at(0)),
        "quarter": vec(value.position_at(0.25)),
        "middle": vec(value.position_at(0.5)),
        "end": vec(value.position_at(1)),
        "start_tangent": vec(value.tangent_at(0)),
        "end_tangent": vec(value.tangent_at(1)),
    }


# ---------------------------------------------------------------------------
# Line, Polyline, PolarLine, IntersectingLine
# ---------------------------------------------------------------------------


@case("line/planar")
def line_planar():
    return curve(Line((0, 0), (3, 4)))


@case("line/spatial")
def line_spatial():
    return curve(Line((1, 2, 3), (-4, 5, 6)))


@case("polyline/open")
def polyline_open():
    return curve(Polyline((0, 0), (2, 0), (2, 3), (5, 3)))


@case("polyline/closed")
def polyline_closed():
    return curve(Polyline((0, 0), (4, 0), (4, 2), (1, 3), close=True))


@case("polar-line/angle")
def polar_line_angle():
    return curve(PolarLine((0, 0), 5, 30))


@case("polar-line/direction")
def polar_line_direction():
    return curve(PolarLine((1, 1), 4, direction=(1, 1)))


@case("polar-line/horizontal")
def polar_line_horizontal():
    return curve(PolarLine((0, 0), 3, 60, length_mode=LengthMode.HORIZONTAL))


@case("polar-line/vertical")
def polar_line_vertical():
    return curve(PolarLine((0, 0), 3, 60, length_mode=LengthMode.VERTICAL))


@case("intersecting-line/basic")
def intersecting_line_basic():
    return curve(IntersectingLine((0, 0), (1, 1), other=Line((4, 0), (4, 6))))


# ---------------------------------------------------------------------------
# Circular arcs
# ---------------------------------------------------------------------------


@case("center-arc/quarter")
def center_arc_quarter():
    return curve(CenterArc((1, 1), 2, 0, 90))


@case("center-arc/full")
def center_arc_full():
    return curve(CenterArc((0, 0), 3, 0, 360))


@case("center-arc/clockwise")
def center_arc_clockwise():
    return curve(CenterArc((0, 0), 2, 30, -120))


@case("three-point-arc/basic")
def three_point_arc_basic():
    return curve(ThreePointArc((0, 0), (1, 1), (2, 0)))


@case("radius-arc/short-sagitta")
def radius_arc_short_sagitta():
    return curve(RadiusArc((0, 0), (4, 0), 3))


@case("radius-arc/long-sagitta")
def radius_arc_long_sagitta():
    return curve(RadiusArc((0, 0), (4, 0), 3, short_sagitta=False))


@case("radius-arc/negative-radius")
def radius_arc_negative_radius():
    return curve(RadiusArc((0, 0), (4, 0), -3))


@case("sagitta-arc/positive")
def sagitta_arc_positive():
    return curve(SagittaArc((0, 0), (4, 0), 1))


@case("sagitta-arc/negative")
def sagitta_arc_negative():
    return curve(SagittaArc((0, 0), (4, 0), -1))


@case("tangent-arc/from-first")
def tangent_arc_from_first():
    return curve(TangentArc((0, 0), (3, 3), tangent=(1, 0)))


@case("tangent-arc/from-last")
def tangent_arc_from_last():
    return curve(TangentArc((0, 0), (3, 3), tangent=(1, 0), tangent_from_first=False))


@case("jern-arc/quarter")
def jern_arc_quarter():
    arc = JernArc((0, 0), (1, 0), 2, 90)
    return {**curve(arc), "center_point": vec(arc.center_point), "end_of_arc": vec(arc.end_of_arc)}


@case("jern-arc/clockwise")
def jern_arc_clockwise():
    arc = JernArc((2, 1), (0, 1), 1.5, -135)
    return {**curve(arc), "center_point": vec(arc.center_point), "end_of_arc": vec(arc.end_of_arc)}


@case("jern-arc/full-circle")
def jern_arc_full_circle():
    arc = JernArc((0, 0), (1, 0), 2, 360)
    return {**curve(arc), "center_point": vec(arc.center_point), "end_of_arc": vec(arc.end_of_arc)}


# ---------------------------------------------------------------------------
# Elliptical arcs and helices
# ---------------------------------------------------------------------------


@case("elliptical-center-arc/default")
def elliptical_center_arc_default():
    return curve(EllipticalCenterArc((0, 0), 3, 2))


@case("elliptical-center-arc/rotated")
def elliptical_center_arc_rotated():
    return curve(EllipticalCenterArc((1, 2), 3, 2, start_angle=30, arc_size=120, rotation=15))


@case("elliptical-center-arc/tall")
def elliptical_center_arc_tall():
    return curve(EllipticalCenterArc((0, 0), 2, 5, arc_size=180))


@case("elliptical-center-arc/clockwise")
def elliptical_center_arc_clockwise():
    return curve(EllipticalCenterArc((0, 0), 4, 2, start_angle=200, arc_size=-140))


@case("helix/basic")
def helix_basic():
    return curve(Helix(1, 4, 1))


@case("helix/left-hand")
def helix_left_hand():
    return curve(Helix(1.5, 6, 2, lefthand=True))


@case("helix/cone")
def helix_cone():
    return curve(Helix(1, 5, 1, cone_angle=10))


@case("helix/placed")
def helix_placed():
    return curve(Helix(2, 6, 1.5, center=(1, 2, 3), direction=(0, 1, 1)))


# ---------------------------------------------------------------------------
# Free-form curves
# ---------------------------------------------------------------------------


@case("spline/through-points")
def spline_through_points():
    return curve(Spline((0, 0), (1, 2), (3, 1), (5, 4)))


@case("spline/end-tangents")
def spline_end_tangents():
    return curve(Spline((0, 0), (3, 3), (6, 0), tangents=((1, 0), (1, 0))))


@case("spline/tangent-scalars")
def spline_tangent_scalars():
    return curve(
        Spline((0, 0), (3, 3), (6, 0), tangents=((1, 0), (1, 0)), tangent_scalars=(2.0, 2.0))
    )


@case("spline/periodic")
def spline_periodic():
    return curve(Spline((0, 0), (2, 2), (4, 0), (2, -2), periodic=True))


@case("spline/spatial")
def spline_spatial():
    return curve(Spline((0, 0, 0), (1, 1, 2), (3, 0, 4), (4, -2, 3)))


@case("bezier/quadratic")
def bezier_quadratic():
    return curve(Bezier((0, 0), (1, 3), (4, 0)))


@case("bezier/weighted")
def bezier_weighted():
    return curve(Bezier((0, 0), (1, 3), (4, 0), weights=[1.0, 2.0, 1.0]))


@case("bspline/cubic")
def bspline_cubic():
    return curve(
        BSpline([(0, 0), (1, 2), (3, 1), (5, 4)], knots=[0, 0, 0, 0, 1, 1, 1, 1], degree=3)
    )


@case("bspline/rational")
def bspline_rational():
    return curve(
        BSpline(
            [(0, 0), (1, 2), (3, 1), (5, 4)],
            knots=[0, 0, 0, 0, 1, 1, 1, 1],
            degree=3,
            weights=[1.0, 2.0, 0.5, 1.0],
        )
    )


# ---------------------------------------------------------------------------
# FilletPolyline
# ---------------------------------------------------------------------------


@case("fillet-polyline/open")
def fillet_polyline_open():
    return curve(FilletPolyline((0, 0), (4, 0), (4, 3), radius=1))


@case("fillet-polyline/closed")
def fillet_polyline_closed():
    return curve(FilletPolyline((0, 0), (5, 0), (5, 4), (0, 4), radius=1, close=True))


@case("fillet-polyline/radius-list")
def fillet_polyline_radius_list():
    return curve(FilletPolyline((0, 0), (6, 0), (6, 4), (0, 4), radius=[1.0, 2.0], close=False))


# ---------------------------------------------------------------------------
# Edge makers used directly
# ---------------------------------------------------------------------------


@case("edge/make-circle-clockwise")
def edge_make_circle_clockwise():
    return curve(
        Edge.make_circle(
            3,
            start_angle=0,
            end_angle=90,
            angular_direction=AngularDirection.CLOCKWISE,
        )
    )


@case("edge/make-circle-on-plane")
def edge_make_circle_on_plane():
    return curve(Edge.make_circle(2.5, plane=Plane.XZ, start_angle=20, end_angle=200))


@case("edge/make-ellipse-arc")
def edge_make_ellipse_arc():
    return curve(Edge.make_ellipse(4, 2, start_angle=10, end_angle=250))


@case("edge/make-ellipse-tall-arc")
def edge_make_ellipse_tall_arc():
    return curve(Edge.make_ellipse(2, 6, start_angle=45, end_angle=300))


@case("edge/make-ellipse-clockwise")
def edge_make_ellipse_clockwise():
    return curve(
        Edge.make_ellipse(
            3,
            2,
            start_angle=300,
            end_angle=60,
            angular_direction=AngularDirection.CLOCKWISE,
        )
    )


@case("edge/make-spline-approx")
def edge_make_spline_approx():
    return curve(Edge.make_spline_approx([(0, 0), (1, 2), (3, 1), (5, 4), (7, 2)], tol=1e-3))


@case("edge/make-spline-approx-smoothing")
def edge_make_spline_approx_smoothing():
    return curve(
        Edge.make_spline_approx(
            [(0, 0), (1, 2), (3, 1), (5, 4), (7, 2)], tol=1e-2, smoothing=(1.0, 1.0, 1.0)
        )
    )


@case("edge/make-mid-way")
def edge_make_mid_way():
    return curve(Edge.make_mid_way(Edge.make_line((0, 0), (4, 0)), Edge.make_line((0, 3), (4, 3))))


@case("edge/trim")
def edge_trim():
    return curve(Edge.make_circle(4, start_angle=0, end_angle=180).trim(0.25, 0.75))


@case("edge/trim-to-length")
def edge_trim_to_length():
    return curve(Edge.make_line((0, 0), (10, 0)).trim_to_length(0.2, 3))


# ---------------------------------------------------------------------------
# Wire makers and 2D wire operations
# ---------------------------------------------------------------------------


@case("wire/make-polygon")
def wire_make_polygon():
    return curve(Wire.make_polygon([(0, 0), (4, 0), (4, 3), (0, 3)]))


@case("wire/make-polygon-open")
def wire_make_polygon_open():
    return curve(Wire.make_polygon([(0, 0), (4, 0), (4, 3)], close=False))


@case("wire/make-rect")
def wire_make_rect():
    return curve(Wire.make_rect(8, 5))


@case("wire/make-circle")
def wire_make_circle():
    return curve(Wire.make_circle(3, plane=Plane.YZ))


@case("wire/make-ellipse-closed-arc")
def wire_make_ellipse_closed_arc():
    return curve(Wire.make_ellipse(4, 2, start_angle=0, end_angle=135))


@case("wire/combine")
def wire_combine():
    edges = [
        Edge.make_line((0, 0), (2, 0)),
        Edge.make_line((2, 0), (2, 2)),
        Edge.make_line((5, 5), (6, 5)),
    ]
    wires = Wire.combine(edges)
    return {
        "count": len(wires),
        "lengths": sorted(float(wire.length) for wire in wires),
        "shapes": [shape_metrics(wire) for wire in sorted(wires, key=lambda w: w.length)],
    }


@case("wire/make-convex-hull")
def wire_make_convex_hull():
    # Open arcs: a closed curve whose seam lands on the hull leaves a zero-length bridge edge,
    # which OCCT keeps or fuses depending on how closely the two seam samples agree.
    edges = [
        Edge.make_circle(2, Plane((-3, 0)), start_angle=90, end_angle=270),
        Edge.make_circle(1, Plane((3, 0)), start_angle=-90, end_angle=90),
    ]
    return curve(Wire.make_convex_hull(edges))


@case("wire/offset-2d-both")
def wire_offset_2d_both():
    return curve(Wire.make_polygon([(0, 0), (4, 0), (4, 3), (0, 3)]).offset_2d(0.5))


@case("wire/offset-2d-intersection")
def wire_offset_2d_intersection():
    return curve(
        Wire.make_polygon([(0, 0), (4, 0), (4, 3), (0, 3)]).offset_2d(0.5, kind=Kind.INTERSECTION)
    )


@case("wire/offset-2d-left")
def wire_offset_2d_left():
    line = Wire([Edge.make_line((0, 0), (4, 0)), Edge.make_line((4, 0), (4, 3))])
    return curve(line.offset_2d(0.5, side=Side.LEFT, closed=False))


@case("wire/fillet-2d")
def wire_fillet_2d():
    wire = Wire.make_polygon([(0, 0), (6, 0), (6, 4), (0, 4)])
    corners = [v for v in wire.vertices() if abs(v.X - 6) < 1e-9]
    return curve(wire.fillet_2d(1, corners))


@case("wire/chamfer-2d")
def wire_chamfer_2d():
    wire = Wire.make_polygon([(0, 0), (6, 0), (6, 4), (0, 4)])
    corners: list[Vertex] = [v for v in wire.vertices() if abs(v.X - 6) < 1e-9]
    return curve(wire.chamfer_2d(0.8, 0.8, corners))


# ---------------------------------------------------------------------------
# Constrained arcs and lines (Geom2dGcc solvers)
# ---------------------------------------------------------------------------


def curve_group(value: Any) -> dict[str, Any]:
    """Metrics for every edge of a solver result, in a position-independent order."""
    edges = sorted(
        value.edges(),
        key=lambda e: (
            round(float(e.length), 6),
            round(e.position_at(0).X, 6),
            round(e.position_at(0).Y, 6),
        ),
    )
    return {
        "count": len(edges),
        "lengths": [float(e.length) for e in edges],
        "edges": [curve(e) for e in edges],
    }


def eggplant_circles() -> tuple[Any, Any]:
    """The two construction circles of build123d's `test_eggplant`."""
    return CenterArc((-2, 0), 0.75, 0, 360), CenterArc((2, 0), 1.0, 0, 360)


@case("constrained-arcs/2tan-rad-outside")
def constrained_arcs_2tan_rad_outside():
    left, right = eggplant_circles()
    arcs = Edge.make_constrained_arcs(
        (right, Tangency.OUTSIDE), (left, Tangency.OUTSIDE), radius=6
    )
    return curve_group(Curve(list(arcs)))


@case("constrained-arcs/2tan-rad-enclosing")
def constrained_arcs_2tan_rad_enclosing():
    left, right = eggplant_circles()
    arcs = Edge.make_constrained_arcs(
        (right, Tangency.ENCLOSING), (left, Tangency.ENCLOSING), radius=8
    )
    return curve_group(Curve(list(arcs)))


@case("constrained-arcs/2tan-rad-point")
def constrained_arcs_2tan_rad_point():
    arcs = Edge.make_constrained_arcs(Line((-5, 3), (5, 3)), (5, 0), radius=4)
    return curve_group(Curve(list(arcs)))


@case("constrained-arcs/2tan-rad-sagitta-long")
def constrained_arcs_2tan_rad_sagitta_long():
    left, right = eggplant_circles()
    arcs = Edge.make_constrained_arcs(
        (right, Tangency.OUTSIDE),
        (left, Tangency.OUTSIDE),
        radius=6,
        sagitta=Sagitta.LONG,
    )
    return curve_group(Curve(list(arcs)))


@case("constrained-arcs/2tan-rad-sagitta-both")
def constrained_arcs_2tan_rad_sagitta_both():
    left, right = eggplant_circles()
    arcs = Edge.make_constrained_arcs(
        (right, Tangency.OUTSIDE),
        (left, Tangency.OUTSIDE),
        radius=6,
        sagitta=Sagitta.BOTH,
    )
    return curve_group(Curve(list(arcs)))


@case("constrained-arcs/2tan-center-on")
def constrained_arcs_2tan_center_on():
    arc = CenterArc((0, 20), 20, -90, 90)
    line_two = Line(arc @ 1, (10, 20))
    line_three = Line((10, 10), line_two @ 1)
    return curve_group(ConstrainedArcs(arc, line_two, center_on=line_three))


@case("constrained-arcs/2tan-center-on-points")
def constrained_arcs_2tan_center_on_points():
    arcs = Edge.make_constrained_arcs((0, 3), (5, 0), center_on=Line((0, -5), (0, 5)))
    return curve_group(Curve(list(arcs)))


@case("constrained-arcs/2tan-center-on-axis")
def constrained_arcs_2tan_center_on_axis():
    arcs = Edge.make_constrained_arcs(Line((-5, 3), (5, 3)), (5, 0), center_on=Axis.Y)
    return curve_group(Curve(list(arcs)))


@case("constrained-arcs/3tan")
def constrained_arcs_3tan():
    line_one = PolarLine((0, 0), 4, 60)
    line_two = PolarLine((0, 0), 4, 40)
    arc = CenterArc((0, 0), 4, 0, 90)
    return curve_group(ConstrainedArcs(line_one, line_two, arc, sagitta=Sagitta.BOTH))


@case("constrained-arcs/tan-cen")
def constrained_arcs_tan_cen():
    line = PolarLine((0, 0), 4, 60)
    arcs = Edge.make_constrained_arcs((line, Tangency.UNQUALIFIED), center=(2, 1))
    return curve_group(Curve(list(arcs)))


@case("constrained-arcs/tan-cen-axis")
def constrained_arcs_tan_cen_axis():
    arcs = Edge.make_constrained_arcs(Axis.X, center=(2, 1, 5))
    return curve_group(Curve(list(arcs)))


@case("constrained-arcs/tan-cen-point")
def constrained_arcs_tan_cen_point():
    arcs = Edge.make_constrained_arcs((3, 4), center=(0, 0))
    return curve_group(Curve(list(arcs)))


@case("constrained-arcs/tan-rad-center-on")
def constrained_arcs_tan_rad_center_on():
    line = PolarLine((0, 0), 4, -20, length_mode=LengthMode.HORIZONTAL)
    arcs = Edge.make_constrained_arcs(line, radius=1, center_on=Axis.X)
    return curve_group(Curve(list(arcs)))


@case("constrained-arcs/higher-level-axis")
def constrained_arcs_higher_level_axis():
    unit_circle = Edge.make_circle(1.0, Plane.XY)
    return curve_group(ConstrainedArcs(unit_circle, Axis.Y, radius=1))


@case("constrained-lines/two-circles")
def constrained_lines_two_circles():
    unit_circle = Edge.make_circle(1.0, Plane.XY)
    other = unit_circle.translate((3, 0, 0))
    lines = Edge.make_constrained_lines(unit_circle, other)
    return curve_group(Curve(list(lines)))


@case("constrained-lines/two-circles-enclosing")
def constrained_lines_two_circles_enclosing():
    unit_circle = Edge.make_circle(1.0, Plane.XY)
    other = unit_circle.translate((3, 0, 0))
    lines = Edge.make_constrained_lines((unit_circle, Tangency.ENCLOSING), other)
    return curve_group(Curve(list(lines)))


@case("constrained-lines/circle-and-point")
def constrained_lines_circle_and_point():
    unit_circle = Edge.make_circle(1.0, Plane.XY)
    lines = Edge.make_constrained_lines(unit_circle, (3, 0))
    return curve_group(Curve(list(lines)))


@case("constrained-lines/oblique-angle")
def constrained_lines_oblique_angle():
    unit_circle = Edge.make_circle(1.0, Plane.XY)
    lines = Edge.make_constrained_lines(unit_circle, Axis.X, angle=30)
    return curve_group(Curve(list(lines)))


@case("constrained-lines/oblique-angle-y")
def constrained_lines_oblique_angle_y():
    unit_circle = Edge.make_circle(1.0, Plane.XY)
    lines = Edge.make_constrained_lines((unit_circle, Tangency.ENCLOSING), Axis.Y, angle=30)
    return curve_group(Curve(list(lines)))


@case("constrained-lines/oblique-direction")
def constrained_lines_oblique_direction():
    unit_circle = Edge.make_circle(1.0, Plane.XY)
    return curve_group(ConstrainedLines(unit_circle, Axis.Y, direction=(1, 1)))


# ---------------------------------------------------------------------------
# Conic arcs: elliptical start arcs, parabolas and hyperbolas
# ---------------------------------------------------------------------------


@case("edge/make-parabola")
def edge_make_parabola():
    return curve(Edge.make_parabola(2, start_angle=0, end_angle=120))


@case("edge/make-hyperbola")
def edge_make_hyperbola():
    return curve(Edge.make_hyperbola(3, 2, start_angle=0, end_angle=60))


@case("edge/make-hyperbola-tall")
def edge_make_hyperbola_tall():
    return curve(Edge.make_hyperbola(2, 3, start_angle=10, end_angle=70))


@case("elliptical-start-arc/start-angle")
def elliptical_start_arc_start_angle():
    return curve(EllipticalStartArc((1, 2), (1, 1), 3, 2, 60, start_angle=30))


@case("elliptical-start-arc/major-axis-dir")
def elliptical_start_arc_major_axis_dir():
    return curve(EllipticalStartArc((1, 2), (0, 1), 3, 2, -45, major_axis_dir=(1, 0)))


@case("parabolic-center-arc/basic")
def parabolic_center_arc_basic():
    return curve(ParabolicCenterArc((1, 1), 2, arc_size=120))


@case("parabolic-center-arc/rotated")
def parabolic_center_arc_rotated():
    return curve(ParabolicCenterArc((0, 0), 1.5, 30, arc_size=90, rotation=45))


@case("parabolic-center-arc/limit")
def parabolic_center_arc_limit():
    return curve(ParabolicCenterArc((0, 0), 2, arc_size=Line((1, -4), (1, 4))))


@case("hyperbolic-center-arc/basic")
def hyperbolic_center_arc_basic():
    return curve(HyperbolicCenterArc((1, 1), 3, 2, arc_size=60))


@case("hyperbolic-center-arc/rotated")
def hyperbolic_center_arc_rotated():
    return curve(HyperbolicCenterArc((0, 0), 2, 1, 10, arc_size=50, rotation=20))


@case("hyperbolic-center-arc/limit")
def hyperbolic_center_arc_limit():
    return curve(HyperbolicCenterArc((0, 0), 3, 2, arc_size=Line((6, -8), (6, 8))))


# ---------------------------------------------------------------------------
# Arc limits: an object to run into instead of an angular size
# ---------------------------------------------------------------------------


@case("center-arc/limit-line")
def center_arc_limit_line():
    return curve(CenterArc((0, 0), 4, 0, Line((0, 2), (6, 2))))


@case("center-arc/limit-axis")
def center_arc_limit_axis():
    return curve(CenterArc((0, 0), 4, 0, Axis((0, 3), (1, 0))))


@case("jern-arc/limit-line")
def jern_arc_limit_line():
    arc = JernArc((0, 0), (1, 0), 4, Line((3, -2), (3, 8)))
    return curve(arc) | {
        "center_point": vec(arc.center_point),
        "end_of_arc": vec(arc.end_of_arc),
    }


@case("elliptical-center-arc/limit-line")
def elliptical_center_arc_limit_line():
    return curve(EllipticalCenterArc((0, 0), 4, 2, arc_size=Line((-1, 0), (-1, 4))))


@case("polar-line/limit-line")
def polar_line_limit_line():
    return curve(PolarLine((0, 0), Line((4, -4), (4, 4)), angle=30))


@case("polar-line/limit-axis")
def polar_line_limit_axis():
    return curve(PolarLine((0, 0), Axis((3, 0), (0, 1)), angle=45))


# ---------------------------------------------------------------------------
# BlendCurve and Airfoil
# ---------------------------------------------------------------------------


def blend_inputs() -> tuple[Any, Any]:
    """Two curves that leave a gap for a blend to bridge."""
    return Line((0, 0), (2, 0)), Line((5, 3), (7, 3))


@case("blend-curve/c0")
def blend_curve_c0():
    first, second = blend_inputs()
    return curve(BlendCurve(first, second, ContinuityLevel.C0))


@case("blend-curve/c1")
def blend_curve_c1():
    first, second = blend_inputs()
    return curve(BlendCurve(first, second, ContinuityLevel.C1))


@case("blend-curve/c2")
def blend_curve_c2():
    first, second = blend_inputs()
    return curve(BlendCurve(first, second, ContinuityLevel.C2))


@case("blend-curve/c1-scaled")
def blend_curve_c1_scaled():
    first, second = blend_inputs()
    return curve(BlendCurve(first, second, ContinuityLevel.C1, tangent_scalars=(1.2, 0.8)))


@case("blend-curve/end-points")
def blend_curve_end_points():
    first = CenterArc((0, 0), 2, 0, 90)
    second = Line((5, 3), (7, 3))
    return curve(
        BlendCurve(first, second, ContinuityLevel.C2, end_points=((0, 2), (5, 3)))
    )


@case("airfoil/naca-2412")
def airfoil_naca_2412():
    return curve(Airfoil("2412", n_points=40))


@case("airfoil/naca-0012-finite-te")
def airfoil_naca_0012_finite_te():
    return curve(Airfoil("0012", n_points=30, finite_te=True))


@case("airfoil/fractional-code")
def airfoil_fractional_code():
    foil = Airfoil("2213.323", n_points=25)
    return {
        "profile": curve(foil),
        "max_camber": float(foil.max_camber),
        "camber_pos": float(foil.camber_pos),
        "thickness": float(foil.thickness),
        "camber_line": curve(foil.camber_line),
    }


# ---------------------------------------------------------------------------
# Open-wire 2D fillets, which go through the tangent-arc solver
# ---------------------------------------------------------------------------


@case("wire/fillet-2d-open")
def wire_fillet_2d_open():
    wire = Wire([Edge.make_line((0, 0), (4, 0)), Edge.make_line((4, 0), (4, 3))])
    corner = wire.vertices().sort_by_distance((4, 0, 0))[0]
    return curve(wire.fillet_2d(1, [corner]))


@case("wire/fillet-2d-open-two-corners")
def wire_fillet_2d_open_two_corners():
    wire = Wire(
        [
            Edge.make_line((0, 0), (5, 0)),
            Edge.make_line((5, 0), (5, 4)),
            Edge.make_line((5, 4), (1, 4)),
        ]
    )
    corners = [
        wire.vertices().sort_by_distance((5, 0, 0))[0],
        wire.vertices().sort_by_distance((5, 4, 0))[0],
    ]
    return curve(wire.fillet_2d(0.8, corners))


@case("wire/fillet-2d-open-tangent-corner")
def wire_fillet_2d_open_tangent_corner():
    wire = Wire([Edge.make_line((0, 0), (1, 0)), Edge.make_line((1, 0), (2, 0))])
    corner = wire.vertices().sort_by_distance((1, 0, 0))[0]
    return curve(wire.fillet_2d(0.1, [corner]))


@case("wire/fillet-2d-open-arc-corner")
def wire_fillet_2d_open_arc_corner():
    wire = Wire([CenterArc((0, 0), 3, 0, 90), Edge.make_line((0, 3), (-4, 3))])
    corner = wire.vertices().sort_by_distance((0, 3, 0))[0]
    return curve(wire.fillet_2d(0.75, [corner]))


# ---------------------------------------------------------------------------
# DoubleTangentArc
# ---------------------------------------------------------------------------


@case("double-tangent-arc/line-target")
def double_tangent_arc_line_target():
    return curve(DoubleTangentArc((0, 0), (1, 0), Line((-4, 3), (4, 3))))


@case("double-tangent-arc/arc-target")
def double_tangent_arc_arc_target():
    return curve(DoubleTangentArc((0, 0), (0, 1), CenterArc((6, 0), 2, 0, 360)))


@case("double-tangent-arc/keep-bottom")
def double_tangent_arc_keep_bottom():
    return curve(
        DoubleTangentArc((0, 0), (1, 0), CenterArc((6, 0), 2, 0, 360), keep=Keep.BOTTOM)
    )
