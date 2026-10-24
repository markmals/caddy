import { describe, expect, test } from "vite-plus/test";

import { Axis, Location, Plane } from "../../src/geometry/index.ts";
import { fullRound } from "../../src/sketch/index.ts";
import { Edge, Face, Wire } from "../../src/topology/index.ts";
import { cylinderWall, polygonWire } from "./shapes.ts";

describe("Face.wrap rejects geometry it cannot follow", () => {
    test("reports running off the edge of the surface", () => {
        let alongAxis = Location.fromPlane(
            new Plane({ origin: [0, 10, 10], xDir: [0, 0, 1], zDir: [0, 1, 0] }),
        );
        expect(() => cylinderWall().wrap(Edge.makeLine([0, 0], [30, 0]), alongAxis)).toThrow(
            /wrapping over surface boundary/,
        );
    });
});

describe("Face.wrapFaces needs faces to lay out", () => {
    test("rejects an empty sequence", () => {
        let path = Edge.makeCircle(10, { plane: new Plane({ origin: [0, 0, 10] }) });
        expect(() => cylinderWall().wrapFaces([], path)).toThrow("No faces to wrap");
    });
});

describe("fullRound rejects geometry it cannot round", () => {
    test("needs an edge taken from a face", () => {
        expect(() => fullRound(Edge.makeLine([0, 0], [1, 0]))).toThrow(
            "edge must be extracted from shape",
        );
    });

    test("needs the edge to have two neighbours", () => {
        let lens = new Face(
            new Wire([
                Edge.makeThreePointArc([-1, 0], [0, 1], [1, 0]),
                Edge.makeLine([1, 0], [-1, 0]),
            ]),
        );
        expect(() => fullRound(lens.edges().first)).toThrow(
            "Invalid geometry - 3 or more edges required",
        );
    });

    test("rounds a triangle taken from a face", () => {
        let triangle = new Face(
            polygonWire([
                [0, 0],
                [6, 0],
                [2, 4],
            ]),
        );
        expect(fullRound(triangle.edges().sortBy(Axis.X).first).area).toBeLessThan(triangle.area);
    });
});
