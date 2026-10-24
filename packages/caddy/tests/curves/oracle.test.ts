import { expect } from "vite-plus/test";

import {
    expectClose,
    expectNumbersClose,
    expectVectorClose,
    fixtureNumber,
    fixtureRecord,
    fixtureValue,
    oracleSuite,
} from "../../../../reference/build123d/oracle.ts";
import {
    APPROXIMATION_TOLERANCE,
    LINEAR_TOLERANCE,
} from "../../../../reference/build123d/tolerances.ts";
import {
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
    Line,
    makeConstrainedArcs,
    makeConstrainedLines,
    makeHyperbola,
    makeParabola,
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
    Wire,
} from "../../src/index.ts";
import { LengthMode, Plane } from "../../src/index.ts";
import { expectShapeMetrics } from "../shape-metrics.ts";
import { expectCurve, expectCurveGroup } from "./curve-metrics.ts";

oracleSuite("curves", {
    "line/planar": expected => expectCurve(expected, new Line([0, 0], [3, 4])),
    "line/spatial": expected => expectCurve(expected, new Line([1, 2, 3], [-4, 5, 6])),

    "polyline/open": expected =>
        expectCurve(
            expected,
            new Polyline([
                [0, 0],
                [2, 0],
                [2, 3],
                [5, 3],
            ]),
        ),
    "polyline/closed": expected =>
        expectCurve(
            expected,
            new Polyline(
                [
                    [0, 0],
                    [4, 0],
                    [4, 2],
                    [1, 3],
                ],
                { close: true },
            ),
        ),

    "polar-line/angle": expected => expectCurve(expected, new PolarLine([0, 0], 5, { angle: 30 })),
    "polar-line/direction": expected =>
        expectCurve(expected, new PolarLine([1, 1], 4, { direction: [1, 1] })),
    "polar-line/horizontal": expected =>
        expectCurve(
            expected,
            new PolarLine([0, 0], 3, { angle: 60, lengthMode: LengthMode.Horizontal }),
        ),
    "polar-line/vertical": expected =>
        expectCurve(
            expected,
            new PolarLine([0, 0], 3, { angle: 60, lengthMode: LengthMode.Vertical }),
        ),

    "center-arc/quarter": expected => expectCurve(expected, new CenterArc([1, 1], 2, 0, 90)),
    "center-arc/full": expected => expectCurve(expected, new CenterArc([0, 0], 3, 0, 360)),
    "center-arc/clockwise": expected => expectCurve(expected, new CenterArc([0, 0], 2, 30, -120)),

    "three-point-arc/basic": expected =>
        expectCurve(expected, new ThreePointArc([0, 0], [1, 1], [2, 0])),

    "radius-arc/short-sagitta": expected => expectCurve(expected, new RadiusArc([0, 0], [4, 0], 3)),
    "radius-arc/long-sagitta": expected =>
        expectCurve(expected, new RadiusArc([0, 0], [4, 0], 3, { shortSagitta: false })),
    "radius-arc/negative-radius": expected =>
        expectCurve(expected, new RadiusArc([0, 0], [4, 0], -3)),

    "sagitta-arc/positive": expected => expectCurve(expected, new SagittaArc([0, 0], [4, 0], 1)),
    "sagitta-arc/negative": expected => expectCurve(expected, new SagittaArc([0, 0], [4, 0], -1)),

    "tangent-arc/from-first": expected =>
        expectCurve(expected, new TangentArc([0, 0], [3, 3], [1, 0])),
    "tangent-arc/from-last": expected =>
        expectCurve(expected, new TangentArc([0, 0], [3, 3], [1, 0], { tangentFromFirst: false })),

    "jern-arc/quarter": expected => expectJernArc(expected, new JernArc([0, 0], [1, 0], 2, 90)),
    "jern-arc/clockwise": expected =>
        expectJernArc(expected, new JernArc([2, 1], [0, 1], 1.5, -135)),
    "jern-arc/full-circle": expected =>
        expectJernArc(expected, new JernArc([0, 0], [1, 0], 2, 360)),

    "elliptical-center-arc/default": expected =>
        expectCurve(expected, new EllipticalCenterArc([0, 0], 3, 2)),
    "elliptical-center-arc/rotated": expected =>
        expectCurve(
            expected,
            new EllipticalCenterArc([1, 2], 3, 2, { startAngle: 30, arcSize: 120, rotation: 15 }),
        ),
    "elliptical-center-arc/tall": expected =>
        expectCurve(expected, new EllipticalCenterArc([0, 0], 2, 5, { arcSize: 180 })),
    "elliptical-center-arc/clockwise": expected =>
        expectCurve(
            expected,
            new EllipticalCenterArc([0, 0], 4, 2, { startAngle: 200, arcSize: -140 }),
        ),

    "helix/basic": expected => expectCurve(expected, new Helix(1, 4, 1)),
    "helix/left-hand": expected => expectCurve(expected, new Helix(1.5, 6, 2, { leftHand: true })),
    "helix/cone": expected => expectCurve(expected, new Helix(1, 5, 1, { coneAngle: 10 })),
    "helix/placed": expected =>
        expectCurve(expected, new Helix(2, 6, 1.5, { center: [1, 2, 3], direction: [0, 1, 1] })),

    "spline/through-points": expected =>
        expectCurve(
            expected,
            new Spline([
                [0, 0],
                [1, 2],
                [3, 1],
                [5, 4],
            ]),
        ),
    "spline/end-tangents": expected =>
        expectCurve(
            expected,
            new Spline(
                [
                    [0, 0],
                    [3, 3],
                    [6, 0],
                ],
                {
                    tangents: [
                        [1, 0],
                        [1, 0],
                    ],
                },
            ),
        ),
    "spline/tangent-scalars": expected =>
        expectCurve(
            expected,
            new Spline(
                [
                    [0, 0],
                    [3, 3],
                    [6, 0],
                ],
                {
                    tangents: [
                        [1, 0],
                        [1, 0],
                    ],
                    tangentScalars: [2, 2],
                },
            ),
        ),
    "spline/periodic": expected =>
        expectCurve(
            expected,
            new Spline(
                [
                    [0, 0],
                    [2, 2],
                    [4, 0],
                    [2, -2],
                ],
                { periodic: true },
            ),
        ),
    "spline/spatial": expected =>
        expectCurve(
            expected,
            new Spline([
                [0, 0, 0],
                [1, 1, 2],
                [3, 0, 4],
                [4, -2, 3],
            ]),
        ),

    "bezier/quadratic": expected =>
        expectCurve(
            expected,
            new Bezier([
                [0, 0],
                [1, 3],
                [4, 0],
            ]),
        ),
    "bezier/weighted": expected =>
        expectCurve(
            expected,
            new Bezier(
                [
                    [0, 0],
                    [1, 3],
                    [4, 0],
                ],
                { weights: [1, 2, 1] },
            ),
        ),

    "bspline/cubic": expected =>
        expectCurve(
            expected,
            new BSpline(
                [
                    [0, 0],
                    [1, 2],
                    [3, 1],
                    [5, 4],
                ],
                [0, 0, 0, 0, 1, 1, 1, 1],
                3,
            ),
        ),
    "bspline/rational": expected =>
        expectCurve(
            expected,
            new BSpline(
                [
                    [0, 0],
                    [1, 2],
                    [3, 1],
                    [5, 4],
                ],
                [0, 0, 0, 0, 1, 1, 1, 1],
                3,
                {
                    weights: [1, 2, 0.5, 1],
                },
            ),
        ),

    "fillet-polyline/open": expected =>
        expectCurve(
            expected,
            new FilletPolyline(
                [
                    [0, 0],
                    [4, 0],
                    [4, 3],
                ],
                1,
            ),
        ),
    "fillet-polyline/closed": expected =>
        expectCurve(
            expected,
            new FilletPolyline(
                [
                    [0, 0],
                    [5, 0],
                    [5, 4],
                    [0, 4],
                ],
                1,
                { close: true },
            ),
        ),
    "fillet-polyline/radius-list": expected =>
        expectCurve(
            expected,
            new FilletPolyline(
                [
                    [0, 0],
                    [6, 0],
                    [6, 4],
                    [0, 4],
                ],
                [1, 2],
            ),
        ),

    "edge/make-circle-clockwise": expected =>
        expectCurve(
            expected,
            Edge.makeCircle(3, {
                startAngle: 0,
                endAngle: 90,
                angularDirection: AngularDirection.Clockwise,
            }),
        ),
    "edge/make-circle-on-plane": expected =>
        expectCurve(
            expected,
            Edge.makeCircle(2.5, { plane: Plane.XZ, startAngle: 20, endAngle: 200 }),
        ),
    "edge/make-ellipse-arc": expected =>
        expectCurve(expected, Edge.makeEllipse(4, 2, { startAngle: 10, endAngle: 250 })),
    "edge/make-ellipse-tall-arc": expected =>
        expectCurve(expected, Edge.makeEllipse(2, 6, { startAngle: 45, endAngle: 300 })),
    "edge/make-ellipse-clockwise": expected =>
        expectCurve(
            expected,
            Edge.makeEllipse(3, 2, {
                startAngle: 300,
                endAngle: 60,
                angularDirection: AngularDirection.Clockwise,
            }),
        ),
    "edge/make-spline-approx": expected =>
        expectCurve(
            expected,
            Edge.makeSplineApprox(
                [
                    [0, 0],
                    [1, 2],
                    [3, 1],
                    [5, 4],
                    [7, 2],
                ],
                { tolerance: 1e-3 },
            ),
        ),
    "edge/make-spline-approx-smoothing": expected =>
        expectCurve(
            expected,
            Edge.makeSplineApprox(
                [
                    [0, 0],
                    [1, 2],
                    [3, 1],
                    [5, 4],
                    [7, 2],
                ],
                {
                    tolerance: 1e-2,
                    smoothing: [1, 1, 1],
                },
            ),
        ),
    "edge/make-mid-way": expected =>
        expectCurve(
            expected,
            Edge.makeMidWay(Edge.makeLine([0, 0], [4, 0]), Edge.makeLine([0, 3], [4, 3])),
        ),
    "edge/trim": expected =>
        expectCurve(
            expected,
            Edge.makeCircle(4, { startAngle: 0, endAngle: 180 }).trim(0.25, 0.75),
        ),
    "edge/trim-to-length": expected =>
        expectCurve(expected, Edge.makeLine([0, 0], [10, 0]).trimToLength(0.2, 3)),

    "wire/make-polygon": expected =>
        expectCurve(
            expected,
            Wire.makePolygon([
                [0, 0],
                [4, 0],
                [4, 3],
                [0, 3],
            ]),
        ),
    "wire/make-polygon-open": expected =>
        expectCurve(
            expected,
            Wire.makePolygon(
                [
                    [0, 0],
                    [4, 0],
                    [4, 3],
                ],
                { close: false },
            ),
        ),
    "wire/make-rect": expected => expectCurve(expected, Wire.makeRect(8, 5)),
    "wire/make-circle": expected => expectCurve(expected, Wire.makeCircle(3, Plane.YZ)),
    "wire/make-ellipse-closed-arc": expected =>
        expectCurve(expected, Wire.makeEllipse(4, 2, { startAngle: 0, endAngle: 135 })),

    "wire/combine": expected => {
        let wires = Wire.combine([
            Edge.makeLine([0, 0], [2, 0]),
            Edge.makeLine([2, 0], [2, 2]),
            Edge.makeLine([5, 5], [6, 5]),
        ]);
        expect(wires.length, "wire count").toBe(fixtureNumber(expected, "count"));
        let sorted = [...wires].sort((left, right) => left.length - right.length);
        expectNumbersClose(
            expected,
            "lengths",
            sorted.map(wire => wire.length),
            LINEAR_TOLERANCE,
        );
        let shapes = fixtureValue(expected, "shapes");
        if (!Array.isArray(shapes)) throw new TypeError("expected recorded wire shapes");
        sorted.forEach((wire, index) =>
            expectShapeMetrics(
                { ...expected, path: `shapes[${index}]`, data: { shape: shapes[index] } },
                wire,
            ),
        );
    },

    // Only the hull's geometry is compared: which of its edges comes first follows the order the
    // hull algorithm reports its boundary segments in, and Qhull's order is not reproducible.
    "wire/make-convex-hull": expected => {
        let hull = Wire.makeConvexHull([
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
        ]);
        expectShapeMetrics(expected, hull);
        expectClose(expected, "length", hull.length, APPROXIMATION_TOLERANCE);
    },

    "wire/offset-2d-both": expected =>
        expectCurve(
            expected,
            Wire.makePolygon([
                [0, 0],
                [4, 0],
                [4, 3],
                [0, 3],
            ]).offset2D(0.5),
        ),
    "wire/offset-2d-intersection": expected =>
        expectCurve(
            expected,
            Wire.makePolygon([
                [0, 0],
                [4, 0],
                [4, 3],
                [0, 3],
            ]).offset2D(0.5, { kind: Kind.Intersection }),
        ),
    "wire/offset-2d-left": expected =>
        expectCurve(
            expected,
            new Wire([Edge.makeLine([0, 0], [4, 0]), Edge.makeLine([4, 0], [4, 3])]).offset2D(0.5, {
                side: Side.Left,
                closed: false,
            }),
        ),

    "wire/fillet-2d": expected => {
        let wire = Wire.makePolygon([
            [0, 0],
            [6, 0],
            [6, 4],
            [0, 4],
        ]);
        let corners = wire.vertices().filter(vertex => Math.abs(vertex.x - 6) < 1e-9);
        expectCurve(expected, wire.fillet2D(1, corners));
    },
    "wire/chamfer-2d": expected => {
        let wire = Wire.makePolygon([
            [0, 0],
            [6, 0],
            [6, 4],
            [0, 4],
        ]);
        let corners = wire.vertices().filter(vertex => Math.abs(vertex.x - 6) < 1e-9);
        expectCurve(expected, wire.chamfer2D(0.8, 0.8, corners));
    },

    "intersecting-line/basic": expected =>
        expectCurve(expected, new IntersectingLine([0, 0], [1, 1], new Line([4, 0], [4, 6]))),

    "constrained-arcs/2tan-rad-outside": expected => {
        let [left, right] = eggplantCircles();
        expectCurveGroup(
            expected,
            makeConstrainedArcs(
                [
                    [right, Tangency.Outside],
                    [left, Tangency.Outside],
                ],
                { radius: 6 },
            ),
        );
    },
    "constrained-arcs/2tan-rad-enclosing": expected => {
        let [left, right] = eggplantCircles();
        expectCurveGroup(
            expected,
            makeConstrainedArcs(
                [
                    [right, Tangency.Enclosing],
                    [left, Tangency.Enclosing],
                ],
                { radius: 8 },
            ),
        );
    },
    "constrained-arcs/2tan-rad-point": expected =>
        expectCurveGroup(
            expected,
            makeConstrainedArcs([new Line([-5, 3], [5, 3]), [5, 0]], { radius: 4 }),
        ),
    "constrained-arcs/2tan-rad-sagitta-long": expected => {
        let [left, right] = eggplantCircles();
        expectCurveGroup(
            expected,
            makeConstrainedArcs(
                [
                    [right, Tangency.Outside],
                    [left, Tangency.Outside],
                ],
                { radius: 6, sagitta: Sagitta.Long },
            ),
        );
    },
    "constrained-arcs/2tan-rad-sagitta-both": expected => {
        let [left, right] = eggplantCircles();
        expectCurveGroup(
            expected,
            makeConstrainedArcs(
                [
                    [right, Tangency.Outside],
                    [left, Tangency.Outside],
                ],
                { radius: 6, sagitta: Sagitta.Both },
            ),
        );
    },
    "constrained-arcs/2tan-center-on": expected => {
        let arc = new CenterArc([0, 20], 20, -90, 90);
        let lineTwo = new Line(arc.positionAt(1), [10, 20]);
        let lineThree = new Line([10, 10], lineTwo.positionAt(1));
        expectCurveGroup(
            expected,
            new ConstrainedArcs([arc, lineTwo], { centerOn: lineThree }).edges(),
        );
    },
    "constrained-arcs/2tan-center-on-points": expected =>
        expectCurveGroup(
            expected,
            makeConstrainedArcs(
                [
                    [0, 3],
                    [5, 0],
                ],
                { centerOn: new Line([0, -5], [0, 5]) },
            ),
        ),
    "constrained-arcs/2tan-center-on-axis": expected =>
        expectCurveGroup(
            expected,
            makeConstrainedArcs([new Line([-5, 3], [5, 3]), [5, 0]], { centerOn: Axis.Y }),
        ),
    "constrained-arcs/3tan": expected => {
        let lineOne = new PolarLine([0, 0], 4, { angle: 60 });
        let lineTwo = new PolarLine([0, 0], 4, { angle: 40 });
        let arc = new CenterArc([0, 0], 4, 0, 90);
        expectCurveGroup(
            expected,
            new ConstrainedArcs([lineOne, lineTwo, arc], { sagitta: Sagitta.Both }).edges(),
        );
    },
    "constrained-arcs/tan-cen": expected =>
        expectCurveGroup(
            expected,
            makeConstrainedArcs([[new PolarLine([0, 0], 4, { angle: 60 }), Tangency.Unqualified]], {
                center: [2, 1],
            }),
        ),
    "constrained-arcs/tan-cen-axis": expected =>
        expectCurveGroup(expected, makeConstrainedArcs([Axis.X], { center: [2, 1, 5] })),
    "constrained-arcs/tan-cen-point": expected =>
        expectCurveGroup(expected, makeConstrainedArcs([[3, 4]], { center: [0, 0] })),
    "constrained-arcs/tan-rad-center-on": expected => {
        let line = new PolarLine([0, 0], 4, { angle: -20, lengthMode: LengthMode.Horizontal });
        expectCurveGroup(expected, makeConstrainedArcs([line], { radius: 1, centerOn: Axis.X }));
    },
    "constrained-arcs/higher-level-axis": expected =>
        expectCurveGroup(
            expected,
            new ConstrainedArcs([Edge.makeCircle(1, { plane: Plane.XY }), Axis.Y], {
                radius: 1,
            }).edges(),
        ),

    "constrained-lines/two-circles": expected => {
        let circle = Edge.makeCircle(1, { plane: Plane.XY });
        expectCurveGroup(expected, makeConstrainedLines(circle, circle.translate([3, 0, 0])));
    },
    "constrained-lines/two-circles-enclosing": expected => {
        let circle = Edge.makeCircle(1, { plane: Plane.XY });
        expectCurveGroup(
            expected,
            makeConstrainedLines([circle, Tangency.Enclosing], circle.translate([3, 0, 0])),
        );
    },
    "constrained-lines/circle-and-point": expected =>
        expectCurveGroup(
            expected,
            makeConstrainedLines(Edge.makeCircle(1, { plane: Plane.XY }), [3, 0]),
        ),
    "constrained-lines/oblique-angle": expected =>
        expectCurveGroup(
            expected,
            makeConstrainedLines(Edge.makeCircle(1, { plane: Plane.XY }), Axis.X, { angle: 30 }),
        ),
    "constrained-lines/oblique-angle-y": expected =>
        expectCurveGroup(
            expected,
            makeConstrainedLines(
                [Edge.makeCircle(1, { plane: Plane.XY }), Tangency.Enclosing],
                Axis.Y,
                {
                    angle: 30,
                },
            ),
        ),
    "constrained-lines/oblique-direction": expected =>
        expectCurveGroup(
            expected,
            new ConstrainedLines(Edge.makeCircle(1, { plane: Plane.XY }), Axis.Y, {
                direction: [1, 1],
            }).edges(),
        ),

    "edge/make-parabola": expected =>
        expectCurve(expected, makeParabola(2, { startAngle: 0, endAngle: 120 })),
    "edge/make-hyperbola": expected =>
        expectCurve(expected, makeHyperbola(3, 2, { startAngle: 0, endAngle: 60 })),
    "edge/make-hyperbola-tall": expected =>
        expectCurve(expected, makeHyperbola(2, 3, { startAngle: 10, endAngle: 70 })),

    "elliptical-start-arc/start-angle": expected =>
        expectCurve(expected, new EllipticalStartArc([1, 2], [1, 1], 3, 2, 60, { startAngle: 30 })),
    "elliptical-start-arc/major-axis-dir": expected =>
        expectCurve(
            expected,
            new EllipticalStartArc([1, 2], [0, 1], 3, 2, -45, { majorAxisDir: [1, 0] }),
        ),

    "parabolic-center-arc/basic": expected =>
        expectCurve(expected, new ParabolicCenterArc([1, 1], 2, { arcSize: 120 })),
    "parabolic-center-arc/rotated": expected =>
        expectCurve(
            expected,
            new ParabolicCenterArc([0, 0], 1.5, { startAngle: 30, arcSize: 90, rotation: 45 }),
        ),
    "parabolic-center-arc/limit": expected =>
        expectCurve(
            expected,
            new ParabolicCenterArc([0, 0], 2, { arcSize: new Line([1, -4], [1, 4]) }),
        ),

    "hyperbolic-center-arc/basic": expected =>
        expectCurve(expected, new HyperbolicCenterArc([1, 1], 3, 2, { arcSize: 60 })),
    "hyperbolic-center-arc/rotated": expected =>
        expectCurve(
            expected,
            new HyperbolicCenterArc([0, 0], 2, 1, { startAngle: 10, arcSize: 50, rotation: 20 }),
        ),
    "hyperbolic-center-arc/limit": expected =>
        expectCurve(
            expected,
            new HyperbolicCenterArc([0, 0], 3, 2, { arcSize: new Line([6, -8], [6, 8]) }),
        ),

    "center-arc/limit-line": expected =>
        expectCurve(expected, new CenterArc([0, 0], 4, 0, new Line([0, 2], [6, 2]))),
    "center-arc/limit-axis": expected =>
        expectCurve(expected, new CenterArc([0, 0], 4, 0, new Axis([0, 3], [1, 0]))),
    "jern-arc/limit-line": expected =>
        expectJernArc(expected, new JernArc([0, 0], [1, 0], 4, new Line([3, -2], [3, 8]))),
    "elliptical-center-arc/limit-line": expected =>
        expectCurve(
            expected,
            new EllipticalCenterArc([0, 0], 4, 2, { arcSize: new Line([-1, 0], [-1, 4]) }),
        ),
    "polar-line/limit-line": expected =>
        expectCurve(expected, new PolarLine([0, 0], new Line([4, -4], [4, 4]), { angle: 30 })),
    "polar-line/limit-axis": expected =>
        expectCurve(expected, new PolarLine([0, 0], new Axis([3, 0], [0, 1]), { angle: 45 })),

    "blend-curve/c0": expected => {
        let [first, second] = blendInputs();
        expectCurve(expected, new BlendCurve(first, second, { continuity: ContinuityLevel.C0 }));
    },
    "blend-curve/c1": expected => {
        let [first, second] = blendInputs();
        expectCurve(expected, new BlendCurve(first, second, { continuity: ContinuityLevel.C1 }));
    },
    "blend-curve/c2": expected => {
        let [first, second] = blendInputs();
        expectCurve(expected, new BlendCurve(first, second, { continuity: ContinuityLevel.C2 }));
    },
    "blend-curve/c1-scaled": expected => {
        let [first, second] = blendInputs();
        expectCurve(
            expected,
            new BlendCurve(first, second, {
                continuity: ContinuityLevel.C1,
                tangentScalars: [1.2, 0.8],
            }),
        );
    },
    "blend-curve/end-points": expected =>
        expectCurve(
            expected,
            new BlendCurve(new CenterArc([0, 0], 2, 0, 90), new Line([5, 3], [7, 3]), {
                continuity: ContinuityLevel.C2,
                endPoints: [
                    [0, 2],
                    [5, 3],
                ],
            }),
        ),

    "airfoil/naca-2412": expected => expectCurve(expected, new Airfoil("2412", { points: 40 })),
    "airfoil/naca-0012-finite-te": expected =>
        expectCurve(expected, new Airfoil("0012", { points: 30, finiteTrailingEdge: true })),
    "airfoil/fractional-code": expected => {
        let foil = new Airfoil("2213.323", { points: 25 });
        expectCurve(fixtureRecord(expected, "profile"), foil);
        expectClose(expected, "max_camber", foil.maxCamber, LINEAR_TOLERANCE);
        expectClose(expected, "camber_pos", foil.camberPosition, LINEAR_TOLERANCE);
        expectClose(expected, "thickness", foil.thickness, LINEAR_TOLERANCE);
        expectCurve(fixtureRecord(expected, "camber_line"), foil.camberLine);
    },

    "double-tangent-arc/line-target": expected =>
        expectCurve(expected, new DoubleTangentArc([0, 0], [1, 0], new Line([-4, 3], [4, 3]))),
    "double-tangent-arc/arc-target": expected =>
        expectCurve(
            expected,
            new DoubleTangentArc([0, 0], [0, 1], new CenterArc([6, 0], 2, 0, 360)),
        ),
    "double-tangent-arc/keep-bottom": expected =>
        expectCurve(
            expected,
            new DoubleTangentArc([0, 0], [1, 0], new CenterArc([6, 0], 2, 0, 360), {
                keep: Keep.Bottom,
            }),
        ),

    "wire/fillet-2d-open": expected => {
        let wire = new Wire([Edge.makeLine([0, 0], [4, 0]), Edge.makeLine([4, 0], [4, 3])]);
        let corner = wire.vertices().sortByDistance([4, 0, 0]).first;
        expectCurve(expected, wire.fillet2D(1, [corner]));
    },
    "wire/fillet-2d-open-two-corners": expected => {
        let wire = new Wire([
            Edge.makeLine([0, 0], [5, 0]),
            Edge.makeLine([5, 0], [5, 4]),
            Edge.makeLine([5, 4], [1, 4]),
        ]);
        let corners = [
            wire.vertices().sortByDistance([5, 0, 0]).first,
            wire.vertices().sortByDistance([5, 4, 0]).first,
        ];
        expectCurve(expected, wire.fillet2D(0.8, corners));
    },
    "wire/fillet-2d-open-tangent-corner": expected => {
        let wire = new Wire([Edge.makeLine([0, 0], [1, 0]), Edge.makeLine([1, 0], [2, 0])]);
        let corner = wire.vertices().sortByDistance([1, 0, 0]).first;
        expectCurve(expected, wire.fillet2D(0.1, [corner]));
    },
    "wire/fillet-2d-open-arc-corner": expected => {
        let wire = new Wire([new CenterArc([0, 0], 3, 0, 90), Edge.makeLine([0, 3], [-4, 3])]);
        let corner = wire.vertices().sortByDistance([0, 3, 0]).first;
        expectCurve(expected, wire.fillet2D(0.75, [corner]));
    },
});

/** The two construction circles of build123d's eggplant arc test. */
function eggplantCircles(): [CenterArc, CenterArc] {
    return [new CenterArc([-2, 0], 0.75, 0, 360), new CenterArc([2, 0], 1, 0, 360)];
}

/** Two curves that leave a gap for a blend to bridge. */
function blendInputs(): [Line, Line] {
    return [new Line([0, 0], [2, 0]), new Line([5, 3], [7, 3])];
}

/** JernArc also records the centre and end of the arc it computed. */
function expectJernArc(expected: Parameters<typeof expectCurve>[0], arc: JernArc): void {
    expectCurve(expected, arc);
    expectVectorClose(expected, "center_point", arc.centerPoint.toTuple(), APPROXIMATION_TOLERANCE);
    expectVectorClose(expected, "end_of_arc", arc.endOfArc.toTuple(), APPROXIMATION_TOLERANCE);
}
