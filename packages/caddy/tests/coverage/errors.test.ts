import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";

import { DraftAngleError, GeometryError, InvalidShapeError } from "../../src/errors.ts";
import { Axis, Intrinsic, Plane, Rotation } from "../../src/geometry/index.ts";
import { importDxf, importSvg } from "../../src/io/import2d/index.ts";
import { draft } from "../../src/operations/index.ts";
import { Box } from "../../src/parts/index.ts";
import { Edge, Face, Solid } from "../../src/topology/index.ts";

describe("Edge.makeBezier", () => {
    test("needs at least two control points", () => {
        expect(() => Edge.makeBezier([[1, 1]])).toThrow(GeometryError);
        expect(() => Edge.makeBezier([[1, 1]])).toThrow(
            "At least two control points must be provided (start, end)",
        );
    });

    test("takes at most 25 control points", () => {
        expect(() => Edge.makeBezier(Array.from({ length: 30 }, () => [1, 2, 3]))).toThrow(
            "The maximum number of control points is 25",
        );
    });

    test("needs one weight per control point", () => {
        expect(() =>
            Edge.makeBezier(
                [
                    [0, 0, 0],
                    [1, 1, 1],
                ],
                { weights: [1] },
            ),
        ).toThrow("A weight must be provided for each control point");
    });
});

describe("Edge.makeBspline", () => {
    test("needs knots", () => {
        expect(() =>
            Edge.makeBspline(
                [
                    [0, 0],
                    [1, 1],
                ],
                [],
                1,
            ),
        ).toThrow("B-spline requires at least one knot");
    });

    test("rejects a knot vector the degree does not fit", () => {
        expect(() =>
            Edge.makeBspline(
                [
                    [0, 0],
                    [1, 1],
                    [2, 0],
                ],
                [0, 0, 0, 1, 1, 1],
                5,
            ),
        ).toThrow();
    });
});

describe("Edge.makeThreePointArc", () => {
    test("rejects three points on one line", () => {
        expect(() => Edge.makeThreePointArc([0, 0], [1, 0], [2, 0])).toThrow();
    });
});

describe("Edge#trimToOther", () => {
    test("returns nothing when the two never meet", () => {
        expect(Edge.makeCircle(1).trimToOther(Edge.makeLine([5, 5], [6, 6]))).toBeUndefined();
    });
});

describe("Face.makeSurface", () => {
    test("rejects a boundary that does not close", () => {
        expect(() => Face.makeSurface([Edge.makeLine([0, 0], [1, 0])])).toThrow();
    });
});

describe("Face#radii", () => {
    test("is undefined for everything but a torus", () => {
        expect(Face.makeRect(1, 1).radii).toBeUndefined();
    });
});

describe("draft", () => {
    test("needs at least one face", () => {
        expect(() => draft([], Plane.XY, 5)).toThrow(InvalidShapeError);
    });

    test("needs every face to come from the same solid", () => {
        let first = new Box(1, 1, 1).solid();
        let second = new Box(1, 1, 1).solid();
        expect(() => draft([first.faces()[0]!, second.faces()[0]!], Plane.XY, 5)).toThrow(
            InvalidShapeError,
        );
    });

    test("reports the face it could not draft", () => {
        let box = new Box(10, 10, 10).solid();
        let bottom = box.faces().sortBy(Axis.Z)[0]!;
        let neutral = new Plane({ origin: bottom.center(), zDir: bottom.normalAt() });
        let failure = (): void => void draft([bottom], neutral, 5);
        expect(failure).toThrow(DraftAngleError);
        try {
            failure();
        } catch (error) {
            expect(error).toBeInstanceOf(DraftAngleError);
            if (!(error instanceof DraftAngleError)) return;
            expect(error.face?.isSame(bottom)).toBe(true);
            expect(error.problematicShape?.shapeType).toBe("Face");
        }
    });
});

describe("Rotation", () => {
    test("rejects an Euler ordering where an axis angle belongs", () => {
        let misused = (): Rotation => new Rotation(Axis.Z, Intrinsic.XYZ as unknown as number);
        expect(misused).toThrow(TypeError);
        expect(misused).toThrow("Rotation about an axis needs an angle in degrees");
    });
});

describe("Shape#isNull", () => {
    test("turns true once the shape is released, and using it then throws", () => {
        let solid = Solid.makeBox(1, 1, 1);
        expect(solid.isNull).toBe(false);
        solid[Symbol.dispose]();
        expect(solid.isNull).toBe(true);
        expect(() => solid.volume).toThrow();
    });
});

describe("the 2D importers", () => {
    test("reject a path that is not there", async () => {
        let missing = join(import.meta.dirname, "there-is-no-such-file.svg");
        await expect(importSvg(missing)).rejects.toThrow();
        await expect(importDxf(missing.replace(".svg", ".dxf"))).rejects.toThrow();
    });
});
