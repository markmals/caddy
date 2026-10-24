import { describe, expect, it } from "vite-plus/test";

import {
    chamfer2D,
    Rectangle,
    RectangleRounded,
    RegularPolygon,
    SlotCenterPoint,
    SlotCenterToCenter,
    SlotOverall,
    solveTriangle,
    Trapezoid,
    Triangle,
} from "../../src/index.ts";

describe("sketch objects reject invalid input", () => {
    it("needs a rounded rectangle wider than its corners", () => {
        expect(() => new RectangleRounded(4, 5, 2)).toThrow(/must be > 2\*radius/);
    });

    it("needs at least three sides for a regular polygon", () => {
        expect(() => new RegularPolygon(3, 2)).toThrow(/at least three sides/);
    });

    it("rejects a trapezoid whose sides cross at the bottom", () => {
        expect(() => new Trapezoid(2, 10, 130)).toThrow(/Trapezoid (bottom|top) invalid/);
    });

    it("rejects a trapezoid whose sides cross at the top", () => {
        expect(() => new Trapezoid(2, 10, 20)).toThrow(/Trapezoid (bottom|top) invalid/);
    });

    it("needs three triangle measures including a side", () => {
        expect(() => new Triangle({ A: 60, B: 60, C: 60 })).toThrow(
            /One length and two other values/,
        );
        expect(() => new Triangle({ a: 3, b: 4 })).toThrow(/One length and two other values/);
    });

    it("rejects triangle side lengths that cannot close", () => {
        expect(() => solveTriangle({ a: 1, b: 2, c: 10 })).toThrow(/No triangle/);
    });

    it("rejects an ambiguous side-side-angle triangle", () => {
        expect(() => solveTriangle({ a: 6, b: 8, A: 0.6 })).toThrow(/Two different triangles/);
    });

    it("needs a separated centre and point for a slot", () => {
        expect(() => new SlotCenterPoint([1, 1], [1, 1], 2)).toThrow(/greater than 0/);
    });

    it("rejects a negative slot separation", () => {
        expect(() => new SlotCenterToCenter(-1, 2)).toThrow(/center_separation/);
    });

    it("needs a slot at least as wide as it is high", () => {
        expect(() => new SlotOverall(3, 5)).toThrow(/width > height/);
    });

    it("rejects a chamfer given both a second length and an angle", () => {
        let corners = new Rectangle(8, 5).vertices;
        expect(() => chamfer2D(corners, 1, { length2: 2, angle: 30 })).toThrow(
            /Only one of length2 or angle/,
        );
    });

    it("rejects a chamfer reference without a second dimension", () => {
        let base = new Rectangle(8, 5);
        let reference = base.edges[0];
        if (reference === undefined) throw new Error("expected a rectangle edge");
        expect(() => chamfer2D(base.vertices, 1, { reference })).toThrow(
            /reference can only be used/,
        );
    });

    it("needs corners to fillet", () => {
        expect(() => chamfer2D([], 1)).toThrow(/No objects provided/);
    });
});
