import { describe, expect, test } from "vite-plus/test";

import { Box, GeometryError, pack, packRectangles } from "../../src/index.ts";

describe("pack", () => {
    test("packing nothing is an error, as build123d's packer is", () => {
        expect(() => pack([], 1)).toThrow(GeometryError);
        expect(() => packRectangles([])).toThrow(GeometryError);
    });

    test("one object is placed at the origin, padding and all", () => {
        let [packed] = pack([new Box(4, 6, 2)], 1);
        let box = packed!.boundingBox;
        expect(box.min.toTuple()).toEqual([0, 0, -1]);
        expect(box.max.toTuple()).toEqual([4, 6, 1]);
    });

    test("alignZ lifts every object onto Plane.XY", () => {
        let packed = pack([new Box(2, 2, 2), new Box(3, 1, 4)], 0.5, { alignZ: true });
        for (let shape of packed) {
            expect(shape.boundingBox.min.z).toBeCloseTo(0, 10);
        }
    });
});
