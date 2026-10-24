import { expect, test } from "vite-plus/test";

import { Edge } from "../../src/topology/index.ts";
import { box } from "./oracle/shapes.ts";

test("singular edge() rejects a shape with multiple edges", () => {
    expect(() => box().edge()).toThrow("Expected exactly one edge, found 12");
});

test("singular face() rejects a shape with multiple faces", () => {
    expect(() => box().face()).toThrow("Expected exactly one face, found 6");
});

test("non-circular edges cannot supply an arc radius or center", () => {
    let line = Edge.makeLine([0, 0, 0], [1, 0, 0]);
    expect(() => line.radius).toThrow("Shape could not be reduced to a circle");
    expect(() => line.arcCenter).toThrow("LINE has no arc center");
});

test("a point away from an edge cannot be parameterized on it", () => {
    let line = Edge.makeLine([0, 0, 0], [1, 0, 0]);
    expect(() => line.paramAtPoint([1, 1, 0])).toThrow();
});
