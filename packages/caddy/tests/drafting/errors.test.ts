import { isOcctError, OcctErrorCode } from "@roonieone/occt-native";
import { expect, test } from "vite-plus/test";

import { GeometryError, NativeKernelError } from "../../src/errors.ts";
import { Box } from "../../src/parts/index.ts";

test("a viewport placed on the point it looks at has no projection direction", () => {
    expect(() => new Box(1, 1, 1).projectToViewport([5, 0, 0], { lookAt: [5, 0, 0] })).toThrow(
        GeometryError,
    );
});

test("a perspective projection needs a positive focal length", () => {
    try {
        new Box(1, 1, 1).projectToViewport([0, 0, 10], { focus: 0 });
    } catch (error) {
        expect(error).toBeInstanceOf(NativeKernelError);
        let cause = (error as NativeKernelError).cause;
        expect(isOcctError(cause) && cause.code).toBe(OcctErrorCode.InvalidArgument);
        expect((error as Error).message).toContain("focal length");
        return;
    }
    throw new Error("expected a non-positive focal length to fail");
});

test("projecting a released shape fails as a wrapped kernel error", () => {
    let box = new Box(1, 1, 1);
    box[Symbol.dispose]();
    try {
        box.projectToViewport([0, 0, 10], { lookAt: [0, 0, 0] });
    } catch (error) {
        expect(error).toBeInstanceOf(NativeKernelError);
        expect(isOcctError((error as NativeKernelError).cause)).toBe(true);
        return;
    }
    throw new Error("expected a released shape to fail");
});
