from __future__ import annotations

from build123d import (
    Align,
    Box,
    Cone,
    ConvexPolyhedron,
    CounterBoreHole,
    CounterSinkHole,
    Cylinder,
    Hole,
    Pos,
    Sphere,
    Torus,
    Wedge,
)
from oracle import case, shape_metrics


@case("box/default")
def box_default():
    return {"shape": shape_metrics(Box(80, 40, 5))}


@case("box/min-aligned-rotation")
def box_min_aligned_rotation():
    return {"shape": shape_metrics(Box(12, 8, 4, rotation=(0, 0, 30), align=(Align.MIN, Align.MIN, Align.MIN)))}


@case("box/subtracted-cylinder")
def box_subtracted_cylinder():
    return {"shape": shape_metrics(Box(80, 40, 5) - Pos(20, 0, 0) * Cylinder(5, 10))}


@case("cylinder/default")
def cylinder_default():
    return {"shape": shape_metrics(Cylinder(3, 12))}


@case("cylinder/partial")
def cylinder_partial():
    return {"shape": shape_metrics(Cylinder(4, 10, arc_size=135, align=(Align.CENTER, Align.CENTER, Align.MIN)))}


@case("cone/default")
def cone_default():
    return {"shape": shape_metrics(Cone(5, 2, 8))}


@case("cone/point")
def cone_point():
    return {"shape": shape_metrics(Cone(5, 0, 8, align=(Align.CENTER, Align.CENTER, Align.MIN)))}


@case("sphere/default")
def sphere_default():
    return {"shape": shape_metrics(Sphere(5))}


@case("sphere/partial")
def sphere_partial():
    return {"shape": shape_metrics(Sphere(5, arc_size1=-30, arc_size2=65, arc_size3=210))}


@case("torus/default")
def torus_default():
    return {"shape": shape_metrics(Torus(8, 2))}


@case("torus/partial")
def torus_partial():
    return {"shape": shape_metrics(Torus(8, 2, major_angle=180))}


@case("wedge/default")
def wedge_default():
    return {"shape": shape_metrics(Wedge(10, 8, 6, 2, 1, 8, 5))}


@case("hole/depth")
def hole_depth():
    return {"shape": shape_metrics(Hole(3, depth=9))}


@case("counterbore/depth")
def counterbore_depth():
    return {"shape": shape_metrics(CounterBoreHole(2, 4, 3, depth=10))}


@case("countersink/depth")
def countersink_depth():
    return {"shape": shape_metrics(CounterSinkHole(2, 4, depth=10, counter_sink_angle=82))}


@case("convexpolyhedron/tetrahedron")
def convexpolyhedron_tetrahedron():
    points = [(0, 0, 0), (10, 0, 0), (0, 8, 0), (0, 0, 6)]
    return {"shape": shape_metrics(ConvexPolyhedron(points))}


@case("convexpolyhedron/boxes")
def convexpolyhedron_boxes():
    hull = Box(30, 20, 20) + Box(20, 30, 20) + Box(20, 20, 30)
    return {"shape": shape_metrics(ConvexPolyhedron(hull.vertices()))}
