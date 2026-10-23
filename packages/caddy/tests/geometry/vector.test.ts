import { describe, expect, it } from "vite-plus/test";

import { Axis, GeometryError, Plane, Vector } from "../../src/index.ts";

describe("Vector", () => {
    it("defaults missing components to zero", () => {
        expect(new Vector().toTuple()).toEqual([0, 0, 0]);
        expect(new Vector(1).toTuple()).toEqual([1, 0, 0]);
        expect(Vector.from([1, 2]).toTuple()).toEqual([1, 2, 0]);
    });

    it("returns the same instance when coercing a Vector", () => {
        let source = new Vector(1, 2, 3);
        expect(Vector.from(source)).toBe(source);
    });

    it("rejects coordinate lists that cannot be a point", () => {
        expect(() => Vector.from([1, 2, 3, 4])).toThrow(GeometryError);
        expect(() => Vector.from([1, Number.NaN, 3])).toThrow(GeometryError);
        expect(() => Vector.from([1, Number.POSITIVE_INFINITY])).toThrow(GeometryError);
    });

    it("is iterable as x, y, z", () => {
        expect([...new Vector(1, 2, 3)]).toEqual([1, 2, 3]);
        let [x, y, z] = new Vector(4, 5, 6);
        expect([x, y, z]).toEqual([4, 5, 6]);
    });

    it("never mutates the receiver", () => {
        let source = new Vector(1, 2, 3);
        source.add([9, 9, 9]);
        source.multiply(5);
        source.normalized();
        expect(source.toTuple()).toEqual([1, 2, 3]);
    });

    it("refuses to normalize a zero-length vector", () => {
        expect(() => new Vector().normalized()).toThrow(GeometryError);
    });

    it("compares with an absolute tolerance", () => {
        let base = new Vector(1, 2, 3);
        expect(base.equals(new Vector(1, 2, 3 + 1e-6))).toBe(true);
        expect(base.equals(new Vector(1, 2, 3 + 1e-4))).toBe(false);
        expect(base.equals(new Vector(1, 2, 3.5), 1)).toBe(true);
    });

    it("keeps a unit length through normalization", () => {
        expect(new Vector(3, 4, 12).normalized().length).toBeCloseTo(1, 15);
    });

    it("reports a readable string", () => {
        expect(new Vector(1, -2, 0.5).toString()).toBe("Vector: (x=1, y=-2, z=0.5)");
    });

    it("ignores the axis position when rotating, as OCCT does for free vectors", () => {
        let atOrigin = new Vector(1, 0, 0).rotate(Axis.Z, 90);
        let offAxis = new Vector(1, 0, 0).rotate(new Axis([50, -20, 7], [0, 0, 1]), 90);
        expect(offAxis.equals(atOrigin)).toBe(true);
    });

    it("projects onto a plane by removing the normal component", () => {
        let projected = new Vector(3, 4, 5).projectToPlane(Plane.XY);
        expect(projected.equals(new Vector(3, 4, 0))).toBe(true);
        expect(projected.signedDistanceFromPlane(Plane.XY)).toBeCloseTo(0, 12);
    });

    it("signs the distance from a plane by the normal direction", () => {
        expect(new Vector(0, 0, 2).signedDistanceFromPlane(Plane.XY)).toBe(2);
        expect(new Vector(0, 0, -2).signedDistanceFromPlane(Plane.XY)).toBe(-2);
        expect(new Vector(0, 0, -2).distanceToPlane(Plane.XY)).toBe(2);
    });

    it("measures signed angles about an explicit normal", () => {
        let from = new Vector(1, 0, 0);
        expect(from.getSignedAngle([0, 1, 0], [0, 0, 1])).toBeCloseTo(90, 12);
        expect(from.getSignedAngle([0, 1, 0], [0, 0, -1])).toBeCloseTo(-90, 12);
    });
});
