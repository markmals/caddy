import { expect, test } from "vite-plus/test";

import { Pos } from "../../src/geometry/index.ts";
import { Convexity, Edge, Face, Shell, Vertex } from "../../src/topology/index.ts";
import { box } from "./oracle/shapes.ts";

test("singular edge() rejects a shape with multiple edges", () => {
    expect(() => box().edge).toThrow("Expected exactly one edge, found 12");
});

test("singular face() rejects a shape with multiple faces", () => {
    expect(() => box().face).toThrow("Expected exactly one face, found 6");
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

test("an edge built on its own has no convexity", () => {
    expect(() => Edge.makeLine([0, 0, 0], [1, 0, 0]).convexity).toThrow(
        "not selected from a shape",
    );
});

test("a boundary edge of a lone face has no crease to classify", () => {
    let face = Face.makeRect(4, 4);
    expect(() => face.edges.first.convexity).toThrow("lies on one face only");
});

test("only vertices, edges and faces have a convexity", () => {
    expect(() => box().convexity).toThrow("has no convexity");
    expect(() => box().wires.first.convexity).toThrow();
});

test("a vertex taken off a lone face classifies as a corner of it", () => {
    let face = Face.makeRect(4, 4);
    expect(face.vertices.first.convexity).toBe(Convexity.Convex);
});

test("a vertex built on its own has nothing to classify it against", () => {
    expect(() => new Vertex(1, 2, 3).convexity).toThrow("not selected from a shape");
});

test("a shell needs faces that sew together", () => {
    expect(() => new Shell([])).toThrow("Cannot create a Shell without faces");
    expect(
        () => new Shell([Face.makeRect(4, 4), Face.makeRect(4, 4).moved(new Pos(20, 0, 0))]),
    ).toThrow("do not sew into a single shell");
});

test("shapes that do not meet have no boundary contacts", () => {
    expect(box().touch(Face.makeRect(1, 1).moved(new Pos(50, 0, 0))).length).toBe(0);
});
