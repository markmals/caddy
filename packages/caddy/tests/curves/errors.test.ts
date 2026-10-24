import { describe, expect, it } from "vite-plus/test";

import {
    Bezier,
    BSpline,
    Edge,
    FilletPolyline,
    GeometryError,
    IntersectingLine,
    Line,
    PolarLine,
    Polyline,
    RadiusArc,
    Spline,
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

    it("refuses to fillet an open wire", () => {
        let wire = Wire.makePolygon(
            [
                [0, 0],
                [4, 0],
                [4, 3],
            ],
            false,
        );
        expect(() => wire.fillet2D(0.5, wire.vertices())).toThrow(/closed planar wire/);
    });
});
