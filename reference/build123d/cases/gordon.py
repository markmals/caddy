"""Oracle cases for `Face.make_gordon_surface`: a Gordon surface interpolated through a
network of profile and guide curves.

Every network here is one of build123d 0.13.0's own reference networks
(`test_make_gordon_surface` and `test_make_gordon_surface_input_types`). A Gordon surface is
a fit, so `shape_metrics` (area, bounds, topology) plus a 5x5 grid of `position_at` samples is
what pins it down; `anchors` repeats build123d's own assertion that the surface passes through
the network, recorded as the curve points it must meet.
"""

from __future__ import annotations

import math
from typing import Any

from build123d import Edge, Face, Line, Spline, ThreePointArc, Vector

from oracle import case, shape_metrics, vec

# build123d's default, and the delta its reference tests hold the network to.
TOLERANCE = 3e-4

# Corners and mid-edges of the parameter square: where the surface meets the network.
GRID = (0.0, 0.25, 0.5, 0.75, 1.0)


# ---- networks under test ----


def _quad_points() -> list[Vector]:
    """The four corner points build123d's input-type tests build every network from."""
    return [Vector(0, 0, 0), Vector(10, 0, 0), Vector(12, 20, 1), Vector(4, 22, -1)]


def _sinusoidal_network(
    num_profiles: int = 3,
    num_guides: int = 4,
    u_range: float = 1.0,
    v_range: float = 1.0,
) -> tuple[list[Edge], list[Edge]]:
    """build123d's `create_test_curves`: splines through a sinusoidal grid of intersections."""
    intersections: list[list[tuple[float, float, float]]] = []
    for i in range(num_profiles):
        row: list[tuple[float, float, float]] = []
        for j in range(num_guides):
            u = i * u_range / (num_profiles - 1)
            v = j * v_range / (num_guides - 1)
            row.append((u, v, 0.2 * math.sin(u * math.pi) * math.cos(v * math.pi)))
        intersections.append(row)

    profiles = [Spline(row) for row in intersections]
    guides = [Spline([row[j] for row in intersections]) for j in range(num_guides)]
    return profiles, guides


def _interior_point_network() -> tuple[list[Any], list[Edge]]:
    """A point in the middle of the profile list: only the first and last may be points."""
    points = _quad_points()
    profiles: list[Any] = [
        Line(points[0], points[1]),
        (points[0] + points[2]) / 2,
        Line(points[3], points[2]),
    ]
    guides = [
        Spline(profiles[0] @ 0, profiles[1], profiles[2] @ 0),
        Spline(profiles[0] @ 1, profiles[1], profiles[2] @ 1),
    ]
    return profiles, guides


# ---- recording ----


def _record(surface: Face, anchors: list[tuple[float, float, Any]]) -> dict[str, Any]:
    """Metrics, the parameter grid, and the network points the surface interpolates.

    `anchor_parameters` and `anchor_points` are parallel: the surface point at row i's (u, v)
    is the network point in row i, which is what build123d's own reference tests assert.
    """
    return {
        "shape": shape_metrics(surface),
        "grid": [vec(surface.position_at(u, v)) for u in GRID for v in GRID],
        "normal_at": vec(surface.normal_at()),
        "center": vec(surface.center()),
        "anchor_parameters": [[u, v] for u, v, _ in anchors],
        "anchor_points": [vec(point) for _, _, point in anchors],
    }


def _raises(profiles: Any, guides: Any) -> str | None:
    """The error type `make_gordon_surface` refuses this network with, or `None`.

    Caught broadly on purpose: build123d raises `ValueError` for a malformed curve list but lets
    `ocp_gordon`'s own `InvalidInputError` through for a network that is too small, and which of
    the two a case gets is exactly what it records.
    """
    try:
        Face.make_gordon_surface(profiles, guides, tolerance=TOLERANCE)
    except Exception as error:
        return type(error).__name__
    return None


# ---- cases ----


@case("network/sinusoidal")
def network_sinusoidal() -> dict[str, Any]:
    """Three profiles crossing four guides on a sinusoidal grid, build123d's main network."""
    profiles, guides = _sinusoidal_network()
    surface = Face.make_gordon_surface(profiles, guides, tolerance=TOLERANCE)
    return _record(
        surface,
        [
            (0.0, 0.0, guides[0].position_at(0.0)),
            (1.0, 0.0, profiles[0].position_at(1.0)),
            (0.0, 1.0, guides[0].position_at(1.0)),
            (1.0, 1.0, profiles[-1].position_at(1.0)),
        ],
    )


@case("network/planar-quad")
def network_planar_quad() -> dict[str, Any]:
    """Four lines closing a skew quad: the surface is the bilinear patch through them."""
    points = _quad_points()
    profiles = [Line(points[0], points[1]), Line(points[3], points[2])]
    guides = [Line(points[0], points[3]), Line(points[1], points[2])]
    surface = Face.make_gordon_surface(profiles, guides, tolerance=TOLERANCE)
    return _record(surface, [(0.5, 0.5, sum(points, Vector(0, 0, 0)) / 4)])


@case("network/arc-profiles")
def network_arc_profiles() -> dict[str, Any]:
    """Two arched profiles joined by straight guides."""
    points = _quad_points()
    profiles = [
        ThreePointArc(points[0], (points[0] + points[1]) / 2 + Vector(0, 0, 2), points[1]),
        ThreePointArc(points[3], (points[3] + points[2]) / 2 + Vector(0, 0, 3), points[2]),
    ]
    guides = [
        Line(profiles[0] @ 0, profiles[1] @ 0),
        Line(profiles[0] @ 1, profiles[1] @ 1),
    ]
    surface = Face.make_gordon_surface(profiles, guides, tolerance=TOLERANCE)
    return _record(
        surface,
        [(0.0, 0.5, guides[0] @ 0.5), (1.0, 0.5, guides[1] @ 0.5)],
    )


@case("network/bezier-profiles")
def network_bezier_profiles() -> dict[str, Any]:
    """Two cubic Bézier profiles joined by straight guides."""
    points = _quad_points()
    profiles = [
        Edge.make_bezier(
            points[0],
            points[0] + Vector(1, 0, 1),
            points[1] - Vector(1, 0, 1),
            points[1],
        ),
        Edge.make_bezier(
            points[3],
            points[3] + Vector(1, 0, 1),
            points[2] - Vector(1, 0, 1),
            points[2],
        ),
    ]
    guides = [
        Line(profiles[0] @ 0, profiles[1] @ 0),
        Line(profiles[0] @ 1, profiles[1] @ 1),
    ]
    surface = Face.make_gordon_surface(profiles, guides, tolerance=TOLERANCE)
    return _record(
        surface,
        [(0.0, 0.5, guides[0] @ 0.5), (1.0, 0.5, guides[1] @ 0.5)],
    )


@case("network/closed-ellipse-profiles")
def network_closed_ellipse_profiles() -> dict[str, Any]:
    """Closed profiles: two ellipses ten units apart, so the surface is a tube.

    Both guides start on the same point of each ellipse's seam, so u = 0 and u = 1 land on the
    first guide.
    """
    profiles = [Edge.make_ellipse(10, 6), Edge.make_ellipse(8, 7).translate((1, 2, 10))]
    guides = [
        Line(profiles[0] @ 0, profiles[1] @ 0),
        Line(profiles[0] @ 0.5, profiles[1] @ 0.5),
    ]
    surface = Face.make_gordon_surface(profiles, guides, tolerance=TOLERANCE)
    return _record(
        surface,
        [(0.0, 0.5, guides[0] @ 0.5), (1.0, 0.5, guides[0] @ 0.5)],
    )


@case("network/point-curve-point")
def network_point_curve_point() -> dict[str, Any]:
    """A profile list that starts and ends with a point, with an arc between them."""
    points = _quad_points()
    profiles: list[Any] = [
        points[0],
        ThreePointArc(points[1], (points[1] + points[3]) / 2 + Vector(0, 0, 2), points[3]),
        points[2],
    ]
    guides = [
        Spline(points[0], profiles[1] @ 0, points[2]),
        Spline(points[0], profiles[1] @ 1, points[2]),
    ]
    surface = Face.make_gordon_surface(profiles, guides, tolerance=TOLERANCE)
    return _record(
        surface,
        [
            (0.0, 1.0, guides[0] @ 1),
            (1.0, 1.0, guides[1] @ 1),
            (1.0, 0.0, points[0]),
        ],
    )


@case("errors/invalid-network")
def errors_invalid_network() -> dict[str, Any]:
    """The networks build123d refuses, recorded as the error type only."""
    profiles, guides = _sinusoidal_network()

    empty_profiles = list(profiles)
    empty_profiles[0] = Edge()
    empty_guides = list(guides)
    empty_guides[0] = Edge()

    return {
        "empty_profile": _raises(empty_profiles, guides),
        "empty_guide": _raises(profiles, empty_guides),
        "interior_point_profile": _raises(*_interior_point_network()),
        "no_profiles": _raises([], guides),
        "single_profile": _raises(profiles[:1], guides),
        "no_guides": _raises(profiles, []),
        "single_guide": _raises(profiles, guides[:1]),
    }
