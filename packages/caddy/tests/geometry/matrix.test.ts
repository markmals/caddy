import { describe, expect, it } from "vite-plus/test";

import { GeometryError, Matrix, Vector } from "../../src/index.ts";

describe("Matrix", () => {
    it("defaults to the identity", () => {
        expect(Matrix.IDENTITY.toRows()).toEqual([
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
        ]);
        expect(new Matrix().apply(new Vector(1, 2, 3)).toTuple()).toEqual([1, 2, 3]);
    });

    it("rejects rows that cannot describe an affine transform", () => {
        expect(() => new Matrix([[1, 0, 0, 0]])).toThrow(GeometryError);
        expect(
            () =>
                new Matrix([
                    [1, 0, 0],
                    [0, 1, 0],
                    [0, 0, 1],
                ]),
        ).toThrow(GeometryError);
        expect(
            () =>
                new Matrix([
                    [1, 0, 0, 0],
                    [0, 1, 0, 0],
                    [0, 0, 1, 0],
                    [0, 0, 1, 1],
                ]),
        ).toThrow(GeometryError);
        expect(
            () =>
                new Matrix([
                    [1, 0, 0, Number.NaN],
                    [0, 1, 0, 0],
                    [0, 0, 1, 0],
                ]),
        ).toThrow(GeometryError);
    });

    it("reads the implied fourth row", () => {
        let source = new Matrix([
            [1, 2, 3, 4],
            [5, 6, 7, 8],
            [9, 10, 11, 12],
        ]);
        expect(source.value(2, 3)).toBe(7);
        expect(source.value(2, 4)).toBe(8);
        expect(source.value(4, 4)).toBe(1);
        expect(source.value(4, 1)).toBe(0);
    });

    it("refuses to invert a singular matrix", () => {
        let flattened = new Matrix([
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 0, 0],
        ]);
        expect(() => flattened.inverse()).toThrow(GeometryError);
    });

    it("stretches each axis independently", () => {
        let stretch = new Matrix([
            [2, 0, 0, 0],
            [0, 3, 0, 0],
            [0, 0, 4, 1],
        ]);
        expect(stretch.apply(new Vector(1, 1, 1)).toTuple()).toEqual([2, 3, 5]);
        expect(
            stretch
                .inverse()
                .apply(new Vector(2, 3, 5))
                .toTuple(),
        ).toEqual([1, 1, 1]);
    });

    it("lays the transposed array out column by column", () => {
        let source = new Matrix([
            [1, 2, 3, 4],
            [5, 6, 7, 8],
            [9, 10, 11, 12],
        ]);
        expect(source.toTransposedArray()).toEqual([
            1, 5, 9, 0, 2, 6, 10, 0, 3, 7, 11, 0, 4, 8, 12, 1,
        ]);
    });
});
