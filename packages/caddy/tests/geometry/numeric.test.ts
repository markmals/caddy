import { describe, expect, it } from "vite-plus/test";

import {
    Axis,
    CaddyError,
    GeometryError,
    Intrinsic,
    Matrix3,
    Plane,
    Quaternion,
    roundTo,
    Transform,
    Vector,
} from "../../src/index.ts";

const DEG2RAD = Math.PI / 180;

describe("roundTo", () => {
    it("rounds ties to the even neighbour, as Python does", () => {
        expect(roundTo(2.5, 0)).toBe(2);
        expect(roundTo(3.5, 0)).toBe(4);
        expect(roundTo(-2.5, 0)).toBe(-2);
        expect(roundTo(0.125, 2)).toBe(0.12);
        expect(roundTo(0.375, 2)).toBe(0.38);
    });

    it("rounds non-ties the usual way", () => {
        expect(roundTo(1.4, 0)).toBe(1);
        expect(roundTo(-1.6, 0)).toBe(-2);
        expect(roundTo(1.2345678901234567, 6)).toBe(1.234568);
        expect(roundTo(1234, -2)).toBe(1200);
    });

    it("snaps trigonometric residue to signed zero", () => {
        expect(roundTo(-6.123233995736766e-17, 14)).toBeCloseTo(0, 20);
        expect(Object.is(roundTo(-6.123233995736766e-17, 14), -0)).toBe(true);
        expect(Object.is(roundTo(6.123233995736766e-17, 14), 0)).toBe(true);
    });

    it("passes non-finite values through and rejects fractional digits", () => {
        expect(roundTo(Number.NaN, 2)).toBeNaN();
        expect(roundTo(Number.POSITIVE_INFINITY, 2)).toBe(Number.POSITIVE_INFINITY);
        expect(() => roundTo(1.5, 1.5)).toThrow(RangeError);
    });
});

describe("Matrix3", () => {
    it("reads rows and columns back out", () => {
        let rows = Matrix3.fromRows(new Vector(1, 2, 3), new Vector(4, 5, 6), new Vector(7, 8, 9));
        expect(rows.toRows()).toEqual([
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
        ]);
        expect(
            Matrix3.fromColumns(
                new Vector(1, 2, 3),
                new Vector(4, 5, 6),
                new Vector(7, 8, 9),
            ).toRows(),
        ).toEqual([
            [1, 4, 7],
            [2, 5, 8],
            [3, 6, 9],
        ]);
        expect(rows.value(2, 3)).toBe(6);
    });

    it("keeps rotations orthonormal with unit determinant", () => {
        let rotation = Matrix3.rotation(new Vector(1, 2, 2), 37 * DEG2RAD);
        expect(rotation.determinant()).toBeCloseTo(1, 12);
        expect(rotation.multiply(rotation.transposed()).equals(Matrix3.IDENTITY, 1e-12)).toBe(true);
    });

    it("multiplies in left-to-right application order", () => {
        let scale = Matrix3.IDENTITY.scaled(2);
        let rotation = Matrix3.rotation(new Vector(0, 0, 1), Math.PI / 2);
        expect(
            rotation
                .multiply(scale)
                .transform(new Vector(1, 0, 0))
                .equals(new Vector(0, 2, 0)),
        ).toBe(true);
    });
});

describe("Quaternion", () => {
    it("round-trips Euler angles for every ordering it is given", () => {
        let angles: [number, number, number] = [0.2, 0.3, -0.4];
        for (let ordering of [Intrinsic.XYZ, Intrinsic.ZYX, Intrinsic.ZXZ]) {
            let quaternion = Quaternion.fromEulerAngles(ordering, ...angles);
            let recovered = quaternion.toEulerAngles(ordering);
            recovered.forEach((value, index) => {
                expect(value).toBeCloseTo(angles[index] ?? 0, 12);
            });
        }
    });

    it("round-trips through its matrix", () => {
        let quaternion = Quaternion.fromAxisAngle(new Vector(1, 2, 2), 75 * DEG2RAD);
        let recovered = Quaternion.fromMatrix(quaternion.toMatrix());
        expect(recovered.equals(quaternion, 1e-12)).toBe(true);
    });

    it("reports a unit norm for rotations", () => {
        expect(Quaternion.fromAxisAngle(new Vector(0, 0, 1), 1.23).norm()).toBeCloseTo(1, 15);
    });

    it("refuses to normalize a zero quaternion", () => {
        expect(() => new Quaternion(0, 0, 0, 0).normalized()).toThrow(GeometryError);
    });
});

describe("Transform", () => {
    it("applies rotation, scale and translation in OCCT's order", () => {
        let transform = new Transform(
            2,
            Matrix3.rotation(new Vector(0, 0, 1), Math.PI / 2),
            new Vector(1, 0, 0),
        );
        expect(transform.apply(new Vector(1, 0, 0)).equals(new Vector(1, 2, 0))).toBe(true);
        expect(transform.applyVector(new Vector(1, 0, 0)).equals(new Vector(0, 2, 0))).toBe(true);
        expect(transform.applyDirection(new Vector(1, 0, 0)).equals(new Vector(0, 1, 0))).toBe(
            true,
        );
    });

    it("keeps in-plane directions and flips the normal under a mirror", () => {
        let mirror = Transform.fromPlaneMirror(new Vector(), new Vector(0, 0, 1));
        expect(mirror.scale).toBe(-1);
        // gp_Dir::Transform re-reverses after a negative scale, so X survives untouched.
        expect(mirror.applyDirection(new Vector(1, 0, 0)).equals(new Vector(1, 0, 0))).toBe(true);
        expect(mirror.applyDirection(new Vector(0, 0, 1)).equals(new Vector(0, 0, -1))).toBe(true);
        expect(mirror.apply(new Vector(1, 2, 3)).equals(new Vector(1, 2, -3))).toBe(true);
    });

    it("is its own inverse for a plane mirror", () => {
        let mirror = Transform.fromPlaneMirror(new Vector(0, 0, 3), new Vector(0, 0, 1));
        expect(mirror.multiply(mirror).equals(Transform.IDENTITY, 1e-12)).toBe(true);
    });

    it("turns a half turn into the identity for an axis mirror", () => {
        let mirror = Transform.fromAxisMirror(new Vector(1, 2, 0), new Vector(0, 0, 1));
        expect(mirror.scale).toBe(1);
        expect(mirror.power(2).equals(Transform.IDENTITY, 1e-12)).toBe(true);
    });

    it("inverts a scaled rotation", () => {
        let transform = Transform.fromAxisRotation(
            new Vector(1, 0, 0),
            new Vector(0, 1, 1),
            0.6,
        ).multiply(Transform.fromScale(new Vector(1, 1, 1), 2.5));
        expect(transform.multiply(transform.inverse()).equals(Transform.IDENTITY, 1e-12)).toBe(
            true,
        );
    });

    it("rejects a zero scale factor", () => {
        expect(() => Transform.fromScale(new Vector(), 0)).toThrow(GeometryError);
        expect(() => new Transform(0, Matrix3.IDENTITY, new Vector()).inverse()).toThrow(
            GeometryError,
        );
    });

    it("maps world coordinates into a plane's frame", () => {
        let plane = new Plane({ origin: [1, 2, 3], xDir: [0, 1, 0], zDir: [0, 0, 1] });
        let forward = Transform.fromCoordinateSystem(plane);
        expect(forward.apply(new Vector(1, 2, 3)).equals(new Vector())).toBe(true);
        expect(forward.apply(new Vector(1, 3, 3)).equals(new Vector(1, 0, 0))).toBe(true);
    });

    it("exposes the affine matrix one-based, as gp_Trsf does", () => {
        let transform = new Transform(2, Matrix3.IDENTITY, new Vector(7, 8, 9));
        expect(transform.value(1, 1)).toBe(2);
        expect(transform.value(2, 4)).toBe(8);
        expect(transform.toRows()[2]).toEqual([0, 0, 2, 9]);
    });
});

describe("errors", () => {
    it("names each error and shares a base class", () => {
        let error = new GeometryError("bad axis");
        expect(error).toBeInstanceOf(CaddyError);
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe("GeometryError");
        expect(error.message).toBe("bad axis");
    });

    it("is thrown for degenerate geometry", () => {
        expect(() => new Axis([0, 0, 0], [0, 0, 0])).toThrow(GeometryError);
    });
});
