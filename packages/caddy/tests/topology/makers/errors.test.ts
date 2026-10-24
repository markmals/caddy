import { describe, expect, test } from "vite-plus/test";

import { GeometryError, InvalidShapeError } from "../../../src/errors.ts";
import { Axis, Plane } from "../../../src/geometry/index.ts";
import { Edge, Face, Solid, Vertex, Wire } from "../../../src/topology/index.ts";

describe("extrusion dispatch", () => {
    test("vertices cannot be built by extrusion", () => {
        expect(() => Vertex.extrude()).toThrow(InvalidShapeError);
    });

    test("wires cannot be built by extrusion", () => {
        expect(() => Wire.extrude()).toThrow(InvalidShapeError);
    });
});

describe("Solid.makeLoft", () => {
    test("rejects a single section", () => {
        expect(() => Solid.makeLoft([Wire.makeRect(4, 4)])).toThrow(GeometryError);
    });

    test("rejects a vertex between wires", () => {
        let sections = [
            Wire.makeRect(4, 4),
            new Vertex(0, 0, 2),
            Wire.makeRect(2, 2, new Plane({ origin: [0, 0, 4] })),
        ];
        expect(() => Solid.makeLoft(sections)).toThrow(/beginning or end/);
    });

    test("rejects three vertices", () => {
        let sections = [
            new Vertex(0, 0, -1),
            new Vertex(0, 0, 0),
            Wire.makeRect(4, 4, new Plane({ origin: [0, 0, 2] })),
            new Vertex(0, 0, 4),
        ];
        expect(() => Solid.makeLoft(sections)).toThrow(/Only two vertices/);
    });

    test("rejects two vertices on their own", () => {
        expect(() => Solid.makeLoft([new Vertex(0, 0, 0), new Vertex(0, 0, 4)])).toThrow(
            /adding some wires/,
        );
    });
});

describe("Solid.extrudeLinearWithRotation", () => {
    test("rejects a zero rotation", () => {
        expect(() =>
            Solid.extrudeLinearWithRotation(Face.makeRect(4, 4), [0, 0, 0], [0, 0, 5], 0),
        ).toThrow(GeometryError);
    });

    test("rejects a zero direction", () => {
        expect(() =>
            Solid.extrudeLinearWithRotation(Face.makeRect(4, 4), [0, 0, 0], [0, 0, 0], 45),
        ).toThrow(GeometryError);
    });
});

describe("Solid.extrudeUntil", () => {
    test("reports a target the profile never reaches", () => {
        let target = Solid.makeBox(2, 2, 2).transform(new Plane({ origin: [20, 20, 20] }));
        expect(() => Solid.extrudeUntil(Face.makeRect(2, 2), target, [0, 0, 1])).toThrow(
            InvalidShapeError,
        );
    });
});

describe("Wire edits", () => {
    test("orderChamferEdges rejects a reference outside the pair", () => {
        let edges = Wire.makeRect(10, 6).edges;
        expect(() => Wire.orderChamferEdges(edges[2]!, [edges[0]!, edges[1]!])).toThrow(
            /reference edge not in edges/,
        );
    });

    test("stitch rejects wires that do not meet", () => {
        let first = new Wire([Edge.makeLine([0, 0, 0], [10, 0, 0])]);
        let second = new Wire([Edge.makeLine([20, 5, 0], [30, 5, 0])]);
        expect(() => first.stitch(second)).toThrow(/stitch/);
    });

    test("geomEqual separates wires with different edge counts", () => {
        let rectangle = Wire.makeRect(10, 6);
        let triangle = Wire.makePolygon([
            [0, 0, 0],
            [10, 0, 0],
            [5, 6, 0],
        ]);
        expect(rectangle.geomEqual(triangle)).toBe(false);
    });

    test("revolve rejects a zero angle", () => {
        expect(() => Solid.revolve(Face.makeRect(2, 4, Plane.XZ), 0, Axis.Z)).toThrow();
    });
});
