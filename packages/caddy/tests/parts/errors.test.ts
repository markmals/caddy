import { OcctErrorCode, isOcctError } from "@roonieone/occt-native";
import { expect, test } from "vite-plus/test";

import { GeometryError, NativeKernelError } from "../../src/errors.ts";
import { Box, ConvexPolyhedron, Hole } from "../../src/parts/index.ts";

test("a primitive reports a native constructor failure with its original cause", () => {
    try {
        new Box(0, 1, 1);
    } catch (error) {
        expect(error).toBeInstanceOf(NativeKernelError);
        let cause = (error as NativeKernelError).cause;
        expect(isOcctError(cause)).toBe(true);
        expect(isOcctError(cause) && cause.code).toBe(OcctErrorCode.InvalidArgument);
        return;
    }
    throw new Error("expected an invalid box dimension to fail");
});

test("algebraic holes need an explicit depth outside a builder", () => {
    expect(() => new Hole(2, Number.NaN)).toThrow(GeometryError);
    expect(() => new Hole(2, 0)).toThrow(GeometryError);
});

test("a convex polyhedron needs points that enclose a volume", () => {
    expect(
        () =>
            new ConvexPolyhedron([
                [0, 0, 0],
                [1, 0, 0],
                [0, 1, 0],
                [1, 1, 0],
            ]),
    ).toThrow(GeometryError);
    expect(() => new ConvexPolyhedron([])).toThrow(GeometryError);
});
