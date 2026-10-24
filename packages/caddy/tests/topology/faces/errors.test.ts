import { describe, expect, test } from "vite-plus/test";

import { ContinuityLevel } from "../../../src/curves/index.ts";
import { GeometryError, InvalidShapeError } from "../../../src/errors.ts";
import { Edge, Face, Wire } from "../../../src/topology/index.ts";
import { cylinderWall, patchEdges } from "./shapes.ts";

describe("Face.makeBezierSurface", () => {
    test("needs at least two control points in each direction", () => {
        expect(() =>
            Face.makeBezierSurface([
                [
                    [0, 0, 0],
                    [1, 0, 0],
                ],
            ]),
        ).toThrow(GeometryError);
        expect(() => Face.makeBezierSurface([[[0, 0, 0]], [[1, 0, 0]]])).toThrow(
            "At least two control points must be provided (start, end)",
        );
    });

    test("rejects more than 25 control points in a direction", () => {
        let row = [...Array(26).keys()].map(x => [x, 0, 0]);
        expect(() => Face.makeBezierSurface([row, row.map(([x]) => [x!, 1, 0])])).toThrow(
            "The maximum number of control points is 25",
        );
    });

    test("needs one weight per control point", () => {
        let points = [
            [
                [0, 0, 0],
                [1, 0, 0],
            ],
            [
                [0, 1, 0],
                [1, 1, 1],
            ],
        ];
        expect(() => Face.makeBezierSurface(points, { weights: [[1, 1]] })).toThrow(
            "A weight must be provided for each control point",
        );
    });
});

describe("Face.makeSurfaceFromCurves", () => {
    test("rejects a mixed edge and wire pair", () => {
        let edge = Edge.makeLine([0, 0, 0], [1, 0, 0]);
        let wire = Wire.makeCircle(1);
        expect(() =>
            (Face.makeSurfaceFromCurves as (first: unknown, second: unknown) => unknown)(
                edge,
                wire,
            ),
        ).toThrow(InvalidShapeError);
    });
});

describe("Face.makeSurfacePatch", () => {
    test("fills a closed run of boundary edges", () => {
        let patch = Face.makeSurfacePatch({ edgeConstraints: patchEdges() });
        expect(patch.isValid).toBe(true);
        expect(patch.isPlanar).toBeUndefined();
        expect(patch.edges()).toHaveLength(3);
    });

    test("reports an unfillable boundary", () => {
        expect(() =>
            Face.makeSurfacePatch({ edgeConstraints: [Edge.makeLine([0, 0, 0], [1, 0, 0])] }),
        ).toThrow();
    });

    test("needs the constraint edge to belong to its support face", () => {
        let [first, second] = patchEdges();
        let support = Face.extrude(second!, [0, -1, 0]);
        expect(() =>
            Face.makeSurfacePatch({
                edgeFaceConstraints: [{ edge: first, support, continuity: ContinuityLevel.C1 }],
            }),
        ).toThrow("A patch constraint edge must be an edge of its support face");
    });
});

describe("Face.sweep", () => {
    test("rejects a multi-edge profile", () => {
        let profile = Wire.makePolygon(
            [
                [0, 0, 0],
                [1, 0, 0],
                [1, 1, 0],
            ],
            { close: false },
        );
        expect(() => Face.sweep(profile, Wire.makeCircle(1))).toThrow(
            "Use Shell.sweep for multi Edge objects",
        );
    });
});

describe("Face#locationAt", () => {
    test("needs both u and v", () => {
        let face = Face.makeRect(1, 1);
        expect(() => (face.locationAt as (u: number) => unknown).call(face, 0)).toThrow(
            "Both u & v values must be specified",
        );
    });
});

describe("Face#axesOfSymmetry", () => {
    test("only supports planar faces", () => {
        expect(() => cylinderWall().axesOfSymmetry).toThrow(
            "axes_of_symmetry only supports for planar faces",
        );
    });
});
