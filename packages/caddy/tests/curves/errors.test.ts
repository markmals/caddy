import { describe, expect, it } from "vite-plus/test";

import {
    Airfoil,
    Axis,
    Bezier,
    BlendCurve,
    BSpline,
    CenterArc,
    Edge,
    EllipticalStartArc,
    FilletPolyline,
    GeometryError,
    IntersectingLine,
    JernArc,
    Line,
    makeConstrainedArcs,
    makeConstrainedLines,
    parseNaca4,
    PolarLine,
    Polyline,
    RadiusArc,
    Spline,
    Tangency,
    Wire,
} from "../../src/index.ts";

describe("curve objects reject invalid input", () => {
    it("needs two or more points for a polyline", () => {
        expect(() => new Polyline([[0, 0]])).toThrow(/two or more pts/);
    });

    it("needs at least two control points for a Bezier", () => {
        expect(() => new Bezier([[0, 0]])).toThrow(/At least two control points/);
    });

    it("caps Bezier control points at 25", () => {
        let points = Array.from({ length: 26 }, (_unused, index) => [index, 0, 0] as const);
        expect(() => new Bezier(points)).toThrow(/maximum number of control points is 25/);
    });

    it("needs one Bezier weight per control point", () => {
        expect(
            () =>
                new Bezier(
                    [
                        [0, 0],
                        [1, 1],
                    ],
                    { weights: [1] },
                ),
        ).toThrow(/weight must be provided for each control point/);
    });

    it("needs a knot for a B-spline", () => {
        expect(
            () =>
                new BSpline(
                    [
                        [0, 0],
                        [1, 1],
                    ],
                    [],
                    1,
                ),
        ).toThrow(/at least one knot/);
    });

    it("rejects a radius arc that cannot reach its end point", () => {
        expect(() => new RadiusArc([0, 0], [10, 0], 2)).toThrow(GeometryError);
    });

    it("needs an angle or a direction for a polar line", () => {
        expect(() => new PolarLine([0, 0], 5)).toThrow(/angle or direction/);
    });

    it("rejects a vertical polar line with no vertical component", () => {
        expect(() => new PolarLine([0, 0], 5, { angle: 0, lengthMode: "VERTICAL" })).toThrow(
            GeometryError,
        );
    });

    it("needs one spline parameter per point", () => {
        expect(() =>
            Edge.makeSpline(
                [
                    [0, 0],
                    [1, 1],
                    [2, 0],
                ],
                { parameters: [0, 1] },
            ),
        ).toThrow(/one parameter for each interpolation point/);
    });

    it("needs matching spline tangent and point counts", () => {
        expect(() =>
            Edge.makeSpline(
                [
                    [0, 0],
                    [1, 1],
                    [2, 0],
                ],
                {
                    tangents: [
                        [1, 0],
                        [1, 0],
                        [1, 0],
                        [1, 0],
                    ],
                },
            ),
        ).toThrow(/one tangent for each interpolation point/);
    });

    it("needs one scalar per spline tangent", () => {
        expect(
            () =>
                new Spline(
                    [
                        [0, 0],
                        [1, 1],
                        [2, 0],
                    ],
                    {
                        tangents: [
                            [1, 0],
                            [1, 0],
                        ],
                        tangentScalars: [1],
                    },
                ),
        ).toThrow(/One tangent scalar/);
    });

    it("rejects negative fillet radii on a polyline", () => {
        expect(
            () =>
                new FilletPolyline(
                    [
                        [0, 0],
                        [4, 0],
                        [4, 3],
                    ],
                    -1,
                ),
        ).toThrow(/must be non-negative/);
    });

    it("needs a radius for every corner of an open fillet polyline", () => {
        expect(
            () =>
                new FilletPolyline(
                    [
                        [0, 0],
                        [4, 0],
                        [4, 3],
                        [0, 3],
                    ],
                    [1],
                ),
        ).toThrow(/radius list length/);
    });

    it("reports a line that never meets its target", () => {
        expect(() => new IntersectingLine([0, 0], [0, 1], new Line([4, 0], [4, 6]))).toThrow(
            /No intersections found/,
        );
    });

    it("rejects a zero-width trim", () => {
        expect(() => Edge.makeLine([0, 0], [1, 0]).trim(0.5, 0.5)).toThrow(
            /start and end must differ/,
        );
    });

    it("refuses to fillet the loose end of an open wire", () => {
        let wire = Wire.makePolygon(
            [
                [0, 0],
                [4, 0],
                [4, 3],
            ],
            { close: false },
        );
        expect(() => wire.fillet2D(0.5, wire.vertices())).toThrow(/must join exactly two edges/);
    });

    it("reports a fillet vertex that is not on the wire", () => {
        let wire = Wire.makePolygon(
            [
                [0, 0],
                [4, 0],
                [4, 3],
            ],
            { close: false },
        );
        let elsewhere = Wire.makePolygon(
            [
                [100, 100],
                [101, 100],
            ],
            { close: false },
        );
        expect(() => wire.fillet2D(0.5, elsewhere.vertices())).toThrow(
            /Could not find fillet vertex/,
        );
    });

    it("rounds a corner of an open wire the closed-face fillet cannot take", () => {
        let wire = Wire.makePolygon(
            [
                [0, 0],
                [4, 0],
                [4, 3],
            ],
            { close: false },
        );
        let corner = wire.vertices().sortByDistance([4, 0, 0]).first;
        expect(wire.fillet2D(0.5, [corner]).edges().length, "edge count").toBe(3);
    });
});

describe("the constrained solvers reject invalid input", () => {
    let unitCircle = (): Edge => Edge.makeCircle(1);

    it("needs between one and three tangency targets", () => {
        expect(() => makeConstrainedArcs([], { radius: 1 })).toThrow(GeometryError);
        expect(() =>
            makeConstrainedArcs([Axis.X, Axis.Y, new Line([0, 2], [2, 2]), [3, 3]], {
                radius: 1,
            }),
        ).toThrow(/1 to 3 tangency targets/);
    });

    it("needs a positive radius", () => {
        expect(() => makeConstrainedArcs([Axis.X, Axis.Y], { radius: 0 })).toThrow(
            /radius must be greater than 0/,
        );
    });

    it("rejects constraint combinations no solver covers", () => {
        expect(() =>
            makeConstrainedArcs([unitCircle(), Axis.Y], { radius: 1, center: [0, 0] }),
        ).toThrow(/ambiguous combination/);
        expect(() => makeConstrainedArcs([unitCircle()], {})).toThrow(/ambiguous combination/);
    });

    it("reports when no arc satisfies the constraints", () => {
        expect(() =>
            makeConstrainedArcs([new Line([-5, 3], [5, 3]), new Line([-5, 0], [5, 0])], {
                centerOn: new Line([-5, -1], [5, -1]),
            }),
        ).toThrow(/no arc is tangent to both targets/);
    });

    it("needs three curves, not points, for the three-tangent solver", () => {
        expect(() => makeConstrainedArcs([unitCircle(), Axis.Y, [4, 4]], {})).toThrow(
            /three tangency curves/,
        );
    });

    it("takes either an angle or a direction for an oblique line, not both", () => {
        expect(() =>
            makeConstrainedLines(unitCircle(), Axis.X, { angle: 30, direction: [1, 1] }),
        ).toThrow(/either angle or direction/);
    });

    it("needs a reference axis that is not perpendicular to the XY plane", () => {
        expect(() => makeConstrainedLines(unitCircle(), Axis.Z, { angle: 30 })).toThrow(
            /perpendicular to the XY plane/,
        );
    });

    it("needs a curve as the first tangency target of a line", () => {
        expect(() => makeConstrainedLines([0, 0], [3, 0])).toThrow(/must be a curve/);
    });

    it("reports when no line is tangent to both targets", () => {
        expect(() => makeConstrainedLines(unitCircle(), [0, 0])).toThrow(
            /no line is tangent to both targets/,
        );
    });

    it("keeps the qualifier of a tangency pair", () => {
        let enclosing = makeConstrainedLines(
            [unitCircle(), Tangency.Enclosing],
            unitCircle().translate([3, 0, 0]),
        );
        expect(enclosing.length, "enclosing solutions").toBe(2);
    });
});

describe("arc limits report when they are never reached", () => {
    it("fails when a center arc misses its limit", () => {
        expect(() => new CenterArc([0, 0], 1, 0, new Line([5, -2], [5, 2]))).toThrow(
            /CenterArc doesn't intersect its arc limit/,
        );
    });

    it("fails when a Jern arc misses its limit", () => {
        expect(() => new JernArc([0, 0], [1, 0], 1, new Line([9, -2], [9, 2]))).toThrow(
            /JernArc doesn't intersect its arc limit/,
        );
    });

    it("fails when a polar line misses its limit", () => {
        expect(() => new PolarLine([0, 0], new Line([-4, -2], [-4, 2]), { angle: 0 })).toThrow(
            /doesn't intersect its length limit/,
        );
    });
});

describe("the conic and blend objects reject invalid input", () => {
    it("needs a start angle or a major axis direction", () => {
        expect(() => new EllipticalStartArc([0, 0], [1, 0], 3, 2, 45)).toThrow(
            /startAngle or majorAxisDir/,
        );
    });

    it("needs blend end points at an end of each curve", () => {
        expect(
            () =>
                new BlendCurve(new Line([0, 0], [2, 0]), new Line([5, 3], [7, 3]), {
                    endPoints: [
                        [1, 0],
                        [5, 3],
                    ],
                }),
        ).toThrow(/at either the start or end of a curve/);
    });

    it("rejects airfoil codes that are not NACA 4-digit", () => {
        expect(() => parseNaca4("24")).toThrow(/NACA 4-digit/);
        expect(() => new Airfoil("abcd")).toThrow(/NACA 4-digit/);
    });
});
