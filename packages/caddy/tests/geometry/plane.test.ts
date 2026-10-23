import { describe, expect, it } from "vite-plus/test";

import { Axis, GeometryError, Location, Plane, Vector } from "../../src/index.ts";

describe("Plane", () => {
    it("builds a right-handed orthonormal frame", () => {
        let plane = new Plane({ origin: [1, 2, 3], xDir: [1, 1, 1], zDir: [0, 0, 1] });
        expect(plane.xDir.length).toBeCloseTo(1, 15);
        expect(plane.yDir.length).toBeCloseTo(1, 15);
        expect(plane.zDir.length).toBeCloseTo(1, 15);
        expect(plane.xDir.dot(plane.zDir)).toBeCloseTo(0, 15);
        expect(plane.xDir.cross(plane.yDir).dot(plane.zDir)).toBeCloseTo(1, 15);
    });

    it("defaults the origin to the world origin and the normal to +Z", () => {
        expect(new Plane().equals(Plane.XY)).toBe(true);
    });

    it("rejects contradictory or degenerate frames", () => {
        expect(() => new Plane({ xDir: [1, 0, 0], yDir: [0, 1, 0], zDir: [0, 0, 1] })).toThrow(
            /either yDir or zDir/,
        );
        expect(() => new Plane({ yDir: [0, 1, 0] })).toThrow(/xDir must be provided/);
        expect(() => new Plane({ xDir: [0, 0, 0], yDir: [0, 1, 0] })).toThrow(
            /xDir must be non-zero/,
        );
        expect(() => new Plane({ xDir: [1, 0, 0], yDir: [0, 0, 0] })).toThrow(
            /yDir must be non-zero/,
        );
        expect(() => new Plane({ xDir: [1, 0, 0], yDir: [2, 0, 0] })).toThrow(
            /must not be parallel/,
        );
        expect(() => new Plane({ zDir: [0, 0, 0] })).toThrow(/zDir must be non-zero/);
        expect(() => new Plane({ xDir: [0, 0, 0], zDir: [0, 0, 1] })).toThrow(
            /xDir must be non-zero/,
        );
        expect(() => new Plane({ xDir: [0, 0, 2], zDir: [0, 0, 1] })).toThrow(GeometryError);
    });

    it("keeps named planes right-handed", () => {
        let named = [
            Plane.XY,
            Plane.YZ,
            Plane.ZX,
            Plane.XZ,
            Plane.YX,
            Plane.ZY,
            Plane.front,
            Plane.back,
            Plane.left,
            Plane.right,
            Plane.top,
            Plane.bottom,
            Plane.isometric,
        ];
        for (let plane of named) {
            expect(plane.xDir.cross(plane.yDir).dot(plane.zDir)).toBeCloseTo(1, 12);
        }
    });

    it("round-trips local and world coordinates", () => {
        let plane = new Plane({ origin: [1, 2, 3], xDir: [1, 1, 0], zDir: [0, 0, 1] });
        let world = new Vector(4, -5, 6);
        expect(plane.fromLocalCoords(plane.toLocalCoords(world)).equals(world)).toBe(true);
    });

    it("puts the plane origin at the local origin", () => {
        let plane = new Plane({ origin: [1, 2, 3], zDir: [1, 1, 1] });
        expect(plane.toLocalCoords(plane.origin).equals(new Vector())).toBe(true);
    });

    it("moves the origin along the normal when offset", () => {
        let plane = new Plane({ origin: [0, 0, 0], zDir: [0, 0, 1] }).offset(2.5);
        expect(plane.origin.equals(new Vector(0, 0, 2.5))).toBe(true);
        expect(plane.zDir.equals(new Vector(0, 0, 1))).toBe(true);
    });

    it("reverses only the normal", () => {
        let plane = Plane.XY.reverse();
        expect(plane.zDir.equals(new Vector(0, 0, -1))).toBe(true);
        expect(plane.xDir.equals(Plane.XY.xDir)).toBe(true);
    });

    it("refuses to shift the origin off the plane", () => {
        expect(() => Plane.XY.shiftOrigin([1, 1, 1])).toThrow(/not located within plane/);
        expect(() => Plane.XY.shiftOrigin(new Axis([0, 0, 5], [1, 0, 0]))).toThrow(
            /does not intersect/,
        );
    });

    it("shifts the origin to where an axis crosses", () => {
        let shifted = Plane.XY.shiftOrigin(new Axis([2, 3, -4], [0, 0, 1]));
        expect(shifted.origin.equals(new Vector(2, 3, 0))).toBe(true);
        expect(shifted.xDir.equals(Plane.XY.xDir)).toBe(true);
    });

    it("recognises the points and axes it contains", () => {
        expect(Plane.XY.contains([5, -3, 0])).toBe(true);
        expect(Plane.XY.contains([5, -3, 0.1])).toBe(false);
        expect(Plane.XY.contains(Axis.X)).toBe(true);
        expect(Plane.XY.contains(Axis.Z)).toBe(false);
    });

    it("converts to and from a location without drift", () => {
        let plane = new Plane({ origin: [1, 2, 3], xDir: [1, 1, 0], zDir: [0, 1, 1] });
        expect(Plane.fromLocation(Location.fromPlane(plane)).equals(plane)).toBe(true);
    });

    it("reports zero for the location between a plane and itself", () => {
        let plane = new Plane({ origin: [1, 2, 3], zDir: [1, 1, 1] });
        let between = plane.locationBetween(plane);
        expect(between.equals(new Location())).toBe(true);
    });
});
