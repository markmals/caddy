import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { Shape } from "../../src/index.ts";

import {
    expectClose,
    expectNumbersClose,
    fixtureValue,
    oracleSuite,
} from "../../../../reference/build123d/oracle.ts";
import {
    APPROXIMATION_TOLERANCE,
    MASS_TOLERANCE,
} from "../../../../reference/build123d/tolerances.ts";
import {
    Align,
    CenterArc,
    chamfer2D,
    Circle,
    Edge,
    Ellipse,
    fillet2D,
    Line,
    makeFace,
    makeHull,
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
    trace,
} from "../../src/index.ts";
import { expectShapeMetrics } from "../shape-metrics.ts";

/** Metrics plus the vertex cloud and edge lengths the oracle records for a sketch. */
function expectSketch(expected: FixtureCase, sketch: Shape): void {
    expectShapeMetrics(expected, sketch);
    expectClose(expected, "area", sketch.area, MASS_TOLERANCE);
    let vertices = sketch
        .vertices()
        .map(vertex => vertex.center().toTuple())
        .sort(compareCoordinates);
    let recorded = fixtureValue(expected, "vertices");
    if (!Array.isArray(recorded)) throw new TypeError("expected recorded vertices");
    expectNumbersClose(
        { ...expected, data: { vertices: recorded.flat() } },
        "vertices",
        vertices.flat(),
        APPROXIMATION_TOLERANCE,
    );
    expectNumbersClose(
        expected,
        "edge_lengths",
        sketch
            .edges()
            .map(edge => edge.length)
            .sort((left, right) => left - right),
        APPROXIMATION_TOLERANCE,
    );
}

function compareCoordinates(
    left: readonly [number, number, number],
    right: readonly [number, number, number],
): number {
    return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

oracleSuite("sketch", {
    "rectangle/centered": expected => expectSketch(expected, new Rectangle(8, 5)),
    "rectangle/min-aligned": expected =>
        expectSketch(expected, new Rectangle(8, 5, { align: [Align.Min, Align.Min] })),
    "rectangle/rotated": expected => expectSketch(expected, new Rectangle(8, 5, { rotation: 30 })),
    "rectangle/rotated-max-aligned": expected =>
        expectSketch(
            expected,
            new Rectangle(6, 4, { rotation: 20, align: [Align.Max, Align.Min] }),
        ),
    "rectangle/unaligned": expected => expectSketch(expected, new Rectangle(6, 4, { align: null })),
    "rectangle-rounded/basic": expected => expectSketch(expected, new RectangleRounded(8, 5, 1)),
    "rectangle-rounded/rotated": expected =>
        expectSketch(
            expected,
            new RectangleRounded(10, 6, 2, { rotation: 25, align: [Align.Min, Align.Center] }),
        ),

    "circle/full": expected => expectSketch(expected, new Circle(4)),
    "circle/sector": expected => expectSketch(expected, new Circle(4, { arcSize: 120 })),
    "circle/min-aligned": expected =>
        expectSketch(expected, new Circle(3, { align: [Align.Min, Align.Max] })),
    "ellipse/basic": expected => expectSketch(expected, new Ellipse(5, 2)),
    "ellipse/rotated": expected =>
        expectSketch(expected, new Ellipse(5, 2, { rotation: 35, align: [Align.Min, Align.Min] })),
    "ellipse/tall": expected => expectSketch(expected, new Ellipse(2, 6)),

    "superellipse/order-four": expected => expectSketch(expected, new Superellipse(8, 5)),
    "superellipse/order-one": expected =>
        expectSketch(expected, new Superellipse(8, 5, { order: 1 })),
    "superellipse/order-two": expected =>
        expectSketch(expected, new Superellipse(8, 5, { order: 2 })),
    "superellipse/order-three": expected =>
        expectSketch(expected, new Superellipse(6, 4, { order: 3, pointCount: 12, rotation: 10 })),

    "polygon/triangle": expected =>
        expectSketch(
            expected,
            new Polygon([
                [0, 0],
                [5, 0],
                [2, 4],
            ]),
        ),
    "polygon/centered": expected =>
        expectSketch(
            expected,
            new Polygon(
                [
                    [0, 0],
                    [5, 0],
                    [5, 3],
                    [0, 3],
                ],
                {
                    align: [Align.Center, Align.Center],
                },
            ),
        ),
    "polygon/rotated": expected =>
        expectSketch(
            expected,
            new Polygon(
                [
                    [0, 0],
                    [6, 0],
                    [6, 2],
                    [3, 5],
                ],
                { rotation: 15 },
            ),
        ),

    "regular-polygon/hexagon": expected => expectSketch(expected, new RegularPolygon(4, 6)),
    "regular-polygon/pentagon-apothem": expected =>
        expectSketch(expected, new RegularPolygon(4, 5, { majorRadius: false })),
    "regular-polygon/rotated": expected =>
        expectSketch(expected, new RegularPolygon(3, 7, { rotation: 12 })),
    "regular-polygon/min-aligned": expected =>
        expectSketch(expected, new RegularPolygon(3, 4, { align: [Align.Min, Align.Min] })),

    "triangle/sss": expected => expectSketch(expected, new Triangle({ a: 3, b: 4, c: 5 })),
    "triangle/sas": expected => expectSketch(expected, new Triangle({ a: 4, b: 6, C: 60 })),
    "triangle/asa": expected => expectSketch(expected, new Triangle({ A: 40, c: 7, B: 75 })),
    "triangle/aligned": expected =>
        expectSketch(expected, new Triangle({ a: 3, b: 4, c: 5, align: [Align.Min, Align.Min] })),
    "triangle/rotated": expected =>
        expectSketch(expected, new Triangle({ a: 5, B: 50, c: 6, rotation: 20 })),

    "trapezoid/symmetric": expected => expectSketch(expected, new Trapezoid(8, 4, 70)),
    "trapezoid/asymmetric": expected =>
        expectSketch(expected, new Trapezoid(10, 5, 60, { rightSideAngle: 80 })),
    "trapezoid/obtuse": expected =>
        expectSketch(expected, new Trapezoid(8, 3, 110, { rightSideAngle: 90 })),
    "trapezoid/rotated-aligned": expected =>
        expectSketch(
            expected,
            new Trapezoid(8, 4, 70, { rotation: 15, align: [Align.Min, Align.Max] }),
        ),

    "slot-center-to-center/basic": expected => expectSketch(expected, new SlotCenterToCenter(8, 3)),
    "slot-center-to-center/degenerate": expected =>
        expectSketch(expected, new SlotCenterToCenter(0, 4)),
    "slot-overall/basic": expected => expectSketch(expected, new SlotOverall(10, 4)),
    "slot-overall/aligned": expected =>
        expectSketch(
            expected,
            new SlotOverall(10, 4, { rotation: 25, align: [Align.Min, Align.Min] }),
        ),
    "slot-overall/circle": expected => expectSketch(expected, new SlotOverall(4, 4)),
    "slot-center-point/basic": expected =>
        expectSketch(expected, new SlotCenterPoint([0, 0], [4, 0], 3)),
    "slot-center-point/angled": expected =>
        expectSketch(expected, new SlotCenterPoint([1, 1], [4, 5], 2)),
    "slot-arc/circular": expected =>
        expectSketch(expected, new SlotArc(Edge.makeCircle(5, { startAngle: 0, endAngle: 90 }), 2)),
    "slot-arc/rotated": expected =>
        expectSketch(
            expected,
            new SlotArc(Edge.makeCircle(4, { startAngle: 30, endAngle: 200 }), 1.5, {
                rotation: 10,
            }),
        ),

    "make-face/from-polyline": expected =>
        expectSketch(
            expected,
            makeFace(
                new Polyline(
                    [
                        [0, 0],
                        [5, 0],
                        [5, 3],
                        [0, 3],
                    ],
                    { close: true },
                ),
            ),
        ),
    "make-face/from-edges": expected =>
        expectSketch(
            expected,
            makeFace([
                Edge.makeLine([0, 0], [6, 0]),
                Edge.makeCircle(3, {
                    plane: Plane.XY.withOrigin([3, 0, 0]),
                    startAngle: 0,
                    endAngle: 180,
                }),
            ]),
        ),
    "make-hull/two-arcs": expected =>
        expectSketch(
            expected,
            makeHull([
                Edge.makeCircle(2, {
                    plane: Plane.XY.withOrigin([-3, 0, 0]),
                    startAngle: 90,
                    endAngle: 270,
                }),
                Edge.makeCircle(1, {
                    plane: Plane.XY.withOrigin([3, 0, 0]),
                    startAngle: -90,
                    endAngle: 90,
                }),
            ]),
        ),
    "make-hull/line-and-arc": expected =>
        expectSketch(
            expected,
            makeHull([
                new Line([-4, -3], [4, -3]),
                Edge.makeCircle(2, {
                    plane: Plane.XY.withOrigin([0, 2, 0]),
                    startAngle: 0,
                    endAngle: 180,
                }),
            ]),
        ),

    "fillet-2d/rectangle-corners": expected =>
        expectSketch(expected, fillet2D(new Rectangle(8, 5).vertices(), 1)),
    "fillet-2d/two-corners": expected => {
        let base = new Rectangle(8, 5);
        let corners = base.vertices().filter(vertex => vertex.x > 0);
        expectSketch(expected, fillet2D(corners, 1.5));
    },
    "chamfer-2d/rectangle-corners": expected =>
        expectSketch(expected, chamfer2D(new Rectangle(8, 5).vertices(), 1)),
    "chamfer-2d/asymmetric": expected => {
        let base = new Rectangle(8, 5);
        let corners = base.vertices().filter(vertex => vertex.x > 0);
        expectSketch(expected, chamfer2D(corners, 1, { length2: 2 }));
    },

    "trace/line": expected => expectSketch(expected, trace(new Line([0, 0], [10, 0]), 1)),
    "trace/polyline": expected =>
        expectSketch(
            expected,
            trace(
                new Polyline([
                    [0, 0],
                    [10, 10],
                    [20, 10],
                ]),
                4,
            ),
        ),
    "trace/two-lines": expected =>
        expectSketch(expected, trace([new Line([0, 0], [6, 0]), new Line([0, 4], [6, 4])], 1.5)),
    "trace/arc": expected => expectSketch(expected, trace(new CenterArc([0, 0], 5, 0, 120), 2)),
});
