import { describe, expect, it } from "vite-plus/test";

import {
    Axis,
    Extrinsic,
    GeometryError,
    Intrinsic,
    Location,
    Plane,
    Pos,
    Rot,
    Rotation,
    Vector,
} from "../../src/index.ts";

describe("Location", () => {
    it("starts as the identity", () => {
        let identity = new Location();
        expect(identity.position.equals(new Vector())).toBe(true);
        expect(identity.orientation.equals(new Vector())).toBe(true);
    });

    it("composes right to left", () => {
        let turn = Location.fromOrientation([0, 0, 0], [0, 0, 90]);
        let move = Location.fromPosition([1, 0, 0]);
        expect(turn.multiply(move).position.equals(new Vector(0, 1, 0))).toBe(true);
        expect(move.multiply(turn).position.equals(new Vector(1, 0, 0))).toBe(true);
    });

    it("inverts back to the identity", () => {
        let source = Location.fromOrientation([1, 2, 3], [25, -40, 15]);
        expect(source.multiply(source.inverse()).equals(new Location())).toBe(true);
        expect(source.inverse().multiply(source).equals(new Location())).toBe(true);
    });

    it("raises a location to integer powers", () => {
        let step = Location.fromOrientation([1, 0, 0], [0, 0, 30]);
        expect(step.power(0).equals(new Location())).toBe(true);
        expect(step.power(3).equals(step.multiply(step).multiply(step))).toBe(true);
        expect(step.power(-1).equals(step.inverse())).toBe(true);
    });

    it("rejects fractional powers", () => {
        expect(() => Location.fromPosition([1, 0, 0]).power(0.5)).toThrow(GeometryError);
    });

    it("treats a half turn as equal regardless of quaternion sign", () => {
        let base = Location.fromOrientation([0, 0, 0], [0, 0, 90]);
        expect(base.equals(Location.fromOrientation([0, 0, 0], [0, 0, -270]))).toBe(true);
    });

    it("keeps the position when replacing the orientation and vice versa", () => {
        let source = Location.fromOrientation([1, 2, 3], [25, -40, 15]);
        expect(source.withPosition([7, 8, 9]).position.equals(new Vector(7, 8, 9))).toBe(true);
        expect(source.withPosition([7, 8, 9]).orientation.equals(source.orientation)).toBe(true);
        expect(source.withOrientation([0, 0, 90]).position.equals(source.position)).toBe(true);
        expect(source.withOrientation([0, 0, 90]).orientation.equals(new Vector(0, 0, 90))).toBe(
            true,
        );
    });

    it("rotates the axes with the frame", () => {
        let quarterTurn = Location.fromOrientation([0, 0, 0], [0, 0, 90]);
        expect(quarterTurn.xAxis.direction.equals(new Vector(0, 1, 0))).toBe(true);
        expect(quarterTurn.yAxis.direction.equals(new Vector(-1, 0, 0))).toBe(true);
        expect(quarterTurn.zAxis.direction.equals(new Vector(0, 0, 1))).toBe(true);
    });

    it("mirrors a position across a plane while staying right-handed", () => {
        let source = Location.fromOrientation([1, 2, 3], [25, -40, 15]);
        let mirrored = source.mirror(Plane.XY);
        expect(mirrored.position.equals(new Vector(1, 2, -3))).toBe(true);
        let frame = Plane.fromLocation(mirrored);
        expect(frame.xDir.cross(frame.yDir).dot(frame.zDir)).toBeCloseTo(1, 12);
    });

    it("flips the normal but keeps the position when negated", () => {
        let source = Location.fromOrientation([1, 2, 3], [0, 0, 0]);
        let flipped = source.negate();
        expect(flipped.position.equals(source.position)).toBe(true);
        expect(Plane.fromLocation(flipped).zDir.equals(new Vector(0, 0, -1))).toBe(true);
    });

    it("rotates about an axis through the world origin, not the position", () => {
        let placed = Location.fromAxisAngle([10, 0, 0], [0, 0, 1], 90);
        expect(placed.position.equals(new Vector(10, 0, 0))).toBe(true);
        expect(placed.orientation.equals(new Vector(0, 0, 90))).toBe(true);
    });

    it("distinguishes intrinsic from extrinsic orderings", () => {
        let intrinsic = Location.fromOrientation([0, 0, 0], [10, 20, 30], Intrinsic.XYZ);
        let extrinsic = Location.fromOrientation([0, 0, 0], [10, 20, 30], Extrinsic.XYZ);
        expect(intrinsic.equals(extrinsic)).toBe(false);
        // Intrinsic XYZ is extrinsic ZYX with the angles reversed.
        let reversed = Location.fromOrientation([0, 0, 0], [30, 20, 10], Extrinsic.ZYX);
        expect(intrinsic.equals(reversed)).toBe(true);
    });
});

describe("Pos", () => {
    it("translates without rotating", () => {
        expect(new Pos(1, 2, 3).position.equals(new Vector(1, 2, 3))).toBe(true);
        expect(new Pos(1, 2, 3).orientation.equals(new Vector())).toBe(true);
        expect(new Pos(new Vector(4, 5, 6)).position.equals(new Vector(4, 5, 6))).toBe(true);
        expect(new Pos().equals(new Location())).toBe(true);
    });

    it("is a Location", () => {
        expect(new Pos(1, 2, 3)).toBeInstanceOf(Location);
    });
});

describe("Rotation", () => {
    it("rotates without translating", () => {
        expect(new Rotation(0, 0, 90).position.equals(new Vector())).toBe(true);
        expect(new Rotation(0, 0, 90).orientation.equals(new Vector(0, 0, 90))).toBe(true);
    });

    it("accepts angles as a vector", () => {
        expect(new Rotation([10, 20, 30]).equals(new Rotation(10, 20, 30))).toBe(true);
    });

    it("rotates about an axis, honouring its position", () => {
        let aboutOffsetAxis = new Rotation(new Axis([1, 0, 0], [0, 0, 1]), 90);
        expect(aboutOffsetAxis.position.equals(new Vector(1, -1, 0))).toBe(true);
        expect(aboutOffsetAxis.orientation.equals(new Vector(0, 0, 90))).toBe(true);
    });

    it("is identity for a zero-angle turn", () => {
        expect(new Rotation(new Axis([5, 6, 7], [0, 0, 1]), 0).equals(new Location())).toBe(true);
    });

    it("is exported under the short name Rot", () => {
        expect(Rot).toBe(Rotation);
    });
});
