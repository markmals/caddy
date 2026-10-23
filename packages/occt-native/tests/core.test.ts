import { describe, expect, test } from "vite-plus/test";

import {
    OcctErrorCode,
    ShapeType,
    booleans,
    io,
    isOcctError,
    measure,
    primitives,
    shapes,
    topology,
} from "../src/index.ts";

function expectOcctError(action: () => unknown, code: OcctErrorCode): void {
    try {
        action();
    } catch (error) {
        expect(isOcctError(error)).toBe(true);
        expect(isOcctError(error) && error.code).toBe(code);
        return;
    }
    throw new Error(`expected an OcctError with code ${code}`);
}

describe("primitives and measurement", () => {
    test("a box has the volume, bounds and topology of its dimensions", () => {
        let box = primitives.makeBox(2, 3, 4);
        expect(measure.massProperties(box, "volume").mass).toBeCloseTo(24, 12);
        expect(measure.boundingBox(box)).toEqual({ min: [0, 0, 0], max: [2, 3, 4] });
        expect(topology.subShapes(box, ShapeType.Face)).toHaveLength(6);
        expect(topology.subShapes(box, ShapeType.Edge)).toHaveLength(12);
        expect(topology.subShapes(box, ShapeType.Vertex)).toHaveLength(8);
        expect(measure.isValid(box)).toBe(true);
    });

    test("invalid dimensions are rejected with INVALID_ARGUMENT", () => {
        expectOcctError(() => primitives.makeBox(0, 1, 1), OcctErrorCode.InvalidArgument);
        expectOcctError(
            () =>
                primitives.makeCylinder(1, 1, {
                    origin: [0, 0, 0],
                    zDirection: [0, 0, 0],
                    xDirection: [1, 0, 0],
                }),
            OcctErrorCode.InvalidArgument,
        );
    });
});

describe("booleans", () => {
    test("cutting a cylinder through a plate removes its volume", () => {
        let plate = primitives.makeBox(80, 40, 5, {
            origin: [-40, -20, 0],
            zDirection: [0, 0, 1],
            xDirection: [1, 0, 0],
        });
        let hole = primitives.makeCylinder(5, 10, {
            origin: [20, 0, -1],
            zDirection: [0, 0, 1],
            xDirection: [1, 0, 0],
        });
        let part = booleans.cut([plate], [hole]);
        expect(measure.massProperties(part, "volume").mass).toBeCloseTo(
            80 * 40 * 5 - Math.PI * 25 * 5,
            8,
        );
        expect(topology.subShapes(part, ShapeType.Solid)).toHaveLength(1);
    });

    test("fusing overlapping boxes and unifying leaves a single six-faced solid", () => {
        let a = primitives.makeBox(2, 1, 1);
        let b = primitives.makeBox(2, 1, 1, {
            origin: [1, 0, 0],
            zDirection: [0, 0, 1],
            xDirection: [1, 0, 0],
        });
        let fused = booleans.unifySameDomain(booleans.fuse([a], [b]));
        expect(measure.massProperties(fused, "volume").mass).toBeCloseTo(3, 12);
        expect(topology.subShapes(fused, ShapeType.Face)).toHaveLength(6);
    });
});

describe("topology", () => {
    test("each box edge belongs to exactly two faces", () => {
        let box = primitives.makeBox(1, 1, 1);
        for (let edge of topology.subShapes(box, ShapeType.Edge)) {
            expect(topology.ancestors(box, edge, ShapeType.Face)).toHaveLength(2);
        }
    });

    test("a compound's children are the shapes it was made from", () => {
        let parts = [primitives.makeBox(1, 1, 1), primitives.makeSphere(1)];
        let children = topology.childShapes(topology.makeCompound(parts));
        expect(children.map(shape => shapes.shapeType(shape))).toEqual([
            ShapeType.Solid,
            ShapeType.Solid,
        ]);
        expect(children.every((child, index) => shapes.isSame(child, parts[index]!))).toBe(true);
    });

    test("hashes agree for shapes that are the same", () => {
        let box = primitives.makeBox(1, 1, 1);
        let [first] = topology.subShapes(box, ShapeType.Face);
        let again = topology.subShapes(box, ShapeType.Face)[0]!;
        expect(shapes.isSame(first!, again)).toBe(true);
        expect(shapes.hash(first!)).toBe(shapes.hash(again));
        expect(shapes.hash(shapes.reversed(first!))).toBe(shapes.hash(first!));
    });
});

describe("placement", () => {
    test("moving a shape translates its bounds without copying geometry", () => {
        let box = primitives.makeBox(1, 1, 1);
        let moved = shapes.moved(box, [1, 0, 0, 10, 0, 1, 0, 0, 0, 0, 1, 0]);
        expect(measure.boundingBox(moved)?.min).toEqual([10, 0, 0]);
        expect(shapes.isPartner(box, moved)).toBe(true);
        expect(shapes.location(moved)).toEqual([1, 0, 0, 10, 0, 1, 0, 0, 0, 0, 1, 0]);
    });
});

describe("serialization", () => {
    test("STEP and BREP round trips preserve volume", () => {
        let sphere = primitives.makeSphere(3);
        let volume = measure.massProperties(sphere, "volume").mass;
        let fromStep = io.readStep(io.writeStep(sphere));
        let fromBrep = io.readBrep(io.writeBrep(sphere));
        expect(measure.massProperties(fromStep, "volume").mass).toBeCloseTo(volume, 6);
        expect(measure.massProperties(fromBrep, "volume").mass).toBeCloseTo(volume, 12);
        expect(new TextDecoder().decode(io.writeStep(sphere).subarray(0, 13))).toBe(
            "ISO-10303-21;",
        );
    });

    test("malformed STEP data is reported as IMPORT_FAILED", () => {
        expectOcctError(
            () => io.readStep(new TextEncoder().encode("not a step file")),
            OcctErrorCode.ImportFailed,
        );
    });
});

describe("lifetime", () => {
    test("a disposed shape cannot be used", () => {
        let box = primitives.makeBox(1, 1, 1);
        shapes.dispose(box);
        expect(shapes.isDisposed(box)).toBe(true);
        expectOcctError(() => measure.isValid(box), OcctErrorCode.Disposed);
    });
});
