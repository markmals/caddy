import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { Size } from "../../src/index.ts";
import type { Shape } from "../../src/topology/index.ts";

import {
    expectVectorClose,
    fixtureMatrix,
    fixtureRecord,
    fixtureValue,
    oracleSuite,
} from "../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import { Box, pack, packRectangles, Part, Sketch, SlotOverall } from "../../src/index.ts";

/** The `[width, height]` pairs a case ships so both sides pack the same rectangles. */
function sizes(expected: FixtureCase): Size[] {
    return fixtureMatrix(expected, "sizes").map(([width, height]) => {
        if (width === undefined || height === undefined) {
            throw new Error(`${expected.name}: every size needs a width and a height`);
        }
        return [width, height];
    });
}

/** Compare every packed object against its recorded bounding box, in input order. */
function expectBounds(expected: FixtureCase, key: string, shapes: readonly Shape[]): void {
    let packed = fixtureRecord(expected, key);
    for (let [index, shape] of shapes.entries()) {
        let record = fixtureRecord(packed, String(index));
        let box = shape.boundingBox();
        expectVectorClose(record, "min", box.min.toTuple(), LINEAR_TOLERANCE);
        expectVectorClose(record, "max", box.max.toTuple(), LINEAR_TOLERANCE);
    }
}

function expectOverall(expected: FixtureCase, combined: Shape): void {
    let record = fixtureRecord(expected, "overall");
    let box = combined.boundingBox();
    expectVectorClose(record, "min", box.min.toTuple(), LINEAR_TOLERANCE);
    expectVectorClose(record, "max", box.max.toTuple(), LINEAR_TOLERANCE);
}

oracleSuite("pack", {
    "rectangles/prefers-horizontal-growth": expected => {
        expect(packRectangles(sizes(expected))).toEqual(fixtureValue(expected, "translations"));
    },

    "rectangles/many": expected => {
        expect(packRectangles(sizes(expected))).toEqual(fixtureValue(expected, "translations"));
    },

    "pack/simple": expected => {
        expectBounds(
            expected,
            "packed",
            pack([new Box(10, 2, 1), new Box(1, 5, 1), new Box(1, 5, 1)], 1),
        );
    },

    "pack/align-z": expected => {
        let objects = [new Box(4, 4, 2), new Box(2, 6, 3), new Box(3, 3, 1)];
        expectBounds(expected, "packed", pack(objects, 0.5));
        expectBounds(expected, "aligned", pack(objects, 0.5, { alignZ: true }));
    },

    "pack/boxes": expected => {
        let boxes = sizes(expected).map(([length, width]) => new Box(length, width, 1));
        let packed = pack(boxes, 1);
        expectBounds(expected, "packed", packed);
        expectOverall(expected, new Part(packed));
    },

    "pack/slots": expected => {
        let slots = sizes(expected).map(([width, height]) => new SlotOverall(width, height));
        let packed = pack(slots, 1);
        expectBounds(expected, "packed", packed);
        expectOverall(expected, new Sketch(packed));
    },
});
