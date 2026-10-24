import { oracleSuite } from "../../../../reference/build123d/oracle.ts";
import { Align, Pos } from "../../src/geometry/index.ts";
import {
    Box,
    ConvexPolyhedron,
    Cone,
    CounterBoreHole,
    CounterSinkHole,
    Cylinder,
    Hole,
    Sphere,
    Torus,
    Wedge,
} from "../../src/parts/index.ts";
import { expectShapeMetrics } from "../shape-metrics.ts";

oracleSuite("parts", {
    "box/default": expected => expectShapeMetrics(expected, new Box(80, 40, 5)),
    "box/min-aligned-rotation": expected =>
        expectShapeMetrics(
            expected,
            new Box(12, 8, 4, { rotation: [0, 0, 30], align: [Align.Min, Align.Min, Align.Min] }),
        ),
    "box/subtracted-cylinder": expected =>
        expectShapeMetrics(
            expected,
            new Box(80, 40, 5).subtract(new Cylinder(5, 10).transform(new Pos(20, 0, 0))),
        ),
    "cylinder/default": expected => expectShapeMetrics(expected, new Cylinder(3, 12)),
    "cylinder/partial": expected =>
        expectShapeMetrics(
            expected,
            new Cylinder(4, 10, { arcSize: 135, align: [Align.Center, Align.Center, Align.Min] }),
        ),
    "cone/default": expected => expectShapeMetrics(expected, new Cone(5, 2, 8)),
    "cone/point": expected =>
        expectShapeMetrics(
            expected,
            new Cone(5, 0, 8, { align: [Align.Center, Align.Center, Align.Min] }),
        ),
    "sphere/default": expected => expectShapeMetrics(expected, new Sphere(5)),
    "sphere/partial": expected =>
        expectShapeMetrics(expected, new Sphere(5, { arcSize1: -30, arcSize2: 65, arcSize3: 210 })),
    "torus/default": expected => expectShapeMetrics(expected, new Torus(8, 2)),
    "torus/partial": expected => expectShapeMetrics(expected, new Torus(8, 2, { majorAngle: 180 })),
    "wedge/default": expected => expectShapeMetrics(expected, new Wedge(10, 8, 6, 2, 1, 8, 5)),
    "hole/depth": expected => expectShapeMetrics(expected, new Hole(3, 9)),
    "counterbore/depth": expected => expectShapeMetrics(expected, new CounterBoreHole(2, 4, 3, 10)),
    "countersink/depth": expected => expectShapeMetrics(expected, new CounterSinkHole(2, 4, 10)),
    "convexpolyhedron/tetrahedron": expected =>
        expectShapeMetrics(
            expected,
            new ConvexPolyhedron([
                [0, 0, 0],
                [10, 0, 0],
                [0, 8, 0],
                [0, 0, 6],
            ]),
        ),
    "convexpolyhedron/boxes": expected => {
        let hull = new Box(30, 20, 20).union(new Box(20, 30, 20)).union(new Box(20, 20, 30));
        expectShapeMetrics(expected, new ConvexPolyhedron(hull.vertices()));
    },
});
