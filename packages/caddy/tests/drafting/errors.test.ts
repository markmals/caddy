import { isOcctError, OcctErrorCode } from "@roonieone/occt-native";
import { expect, test } from "vite-plus/test";

import { TEST_FONT_NAME, TEST_FONT_PATH } from "../../../../reference/build123d/oracle.ts";
import { DimensionLine, Draft, ExtensionLine } from "../../src/drafting/index.ts";
import { GeometryError, NativeKernelError } from "../../src/errors.ts";
import { Box } from "../../src/parts/index.ts";
import { Edge, Wire } from "../../src/topology/index.ts";

/** Labels render from the repository's font file, so these tests need no system font. */
function testDraft(): Draft {
    return new Draft({ font: TEST_FONT_NAME, fontPath: TEST_FONT_PATH });
}

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

test("a fractional precision that is not a power of two is rejected", () => {
    expect(() => new Draft({ fractionalPrecision: 10 })).toThrow(
        /fractionalPrecision values must be a factor of 2 not 10/,
    );
});

test("an angle label needs a path that is part of a circle", () => {
    let straight = new Wire([Edge.makeLine([0, 0, 0], [10, 0, 0])]);
    expect(() => new Draft().labelFor(straight, { labelAngle: true })).toThrow(
        /not part of a circle/,
    );
});

test("a dimension line takes exactly two points and at least one arrow", () => {
    expect(
        () =>
            new DimensionLine(
                [
                    [0, 0, 0],
                    [5, 0, 0],
                    [5, 5, 0],
                ],
                testDraft(),
            ),
    ).toThrow(/Only two points are allowed for dimension lines/);
    expect(
        () =>
            new DimensionLine(
                [
                    [0, 0, 0],
                    [50, 0, 0],
                ],
                testDraft(),
                { arrows: [false, false] },
            ),
    ).toThrow(/No output - no arrows selected/);
});

test("an extension line rejects offsets it cannot place a dimension line from", () => {
    let border: [number, number, number][] = [
        [0, 0, 0],
        [50, 0, 0],
    ];
    expect(() => new ExtensionLine(border, 0, testDraft())).toThrow(
        /A dimension line should be used if offset is 0/,
    );
    expect(() => new ExtensionLine(border, [0, 0, 20], testDraft())).toThrow(
        /offset vector must lie in the drawing \(XY\) plane/,
    );
    // Without a measurement direction the offset sets it, so an offset along the border reads
    // as a degenerate dimension; naming the direction is what exposes the perpendicularity rule.
    expect(
        () =>
            new ExtensionLine(border, [20, 0, 0], testDraft(), {
                measurementDirection: [1, 0, 0],
            }),
    ).toThrow(/offset vector must be perpendicular to the dimension line/);
    // A closed path is the border whose ends coincide; two equal points never reach the check,
    // because the line through them cannot be built in the first place.
    expect(() => new ExtensionLine(Edge.makeCircle(10), 20, testDraft())).toThrow(
        /Start and end points of border must be different/,
    );
});

test("a measurement direction must lie in the drawing plane and cross the border", () => {
    let border: [number, number, number][] = [
        [0, 0, 0],
        [40, 30, 0],
    ];
    expect(
        () => new ExtensionLine(border, 15, testDraft(), { measurementDirection: [0, 0, 0] }),
    ).toThrow(/measurementDirection must be non-zero/);
    expect(
        () => new ExtensionLine(border, 15, testDraft(), { measurementDirection: [0, 0, 1] }),
    ).toThrow(/measurementDirection must lie in the drawing \(XY\) plane/);
    expect(
        () =>
            new ExtensionLine(
                [
                    [0, 0, 0],
                    [0, 30, 0],
                ],
                15,
                testDraft(),
                { measurementDirection: [1, 0, 0] },
            ),
    ).toThrow(/no extent along the measurement direction/);
});
