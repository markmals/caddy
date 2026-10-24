import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { Shape, VectorLike } from "../../src/index.ts";
import type { OracleCases } from "../topology/oracle/support.ts";

import {
    expectClose,
    expectVectorClose,
    fixtureRecord,
    fixtureValue,
} from "../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE, MASS_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import { Axis, Plane, extrude } from "../../src/index.ts";
import { Edge, Face, Wire } from "../../src/topology/index.ts";
import { expectPoint } from "../topology/oracle/support.ts";
import { expectEdge } from "./edge-metrics.ts";

/** Control points of the quadratic B-spline, shared by both spellings. */
function bsplineControlPoints(): VectorLike[] {
    return [
        [0, 0],
        [1, 1],
        [2, 0],
    ];
}

/**
 * The objects build123d's `test_trim_to_other` trims an arc against: a square with one corner
 * at the origin and its diagonal along +Y, in every topological form, plus the axis and plane
 * through that diagonal and one line the arc never reaches.
 */
function trimTargets(): Record<string, Shape | Axis | Plane> {
    let corners: VectorLike[] = [
        [0, 0, 0],
        [-1, 0, 0],
        [-1, 1, 0],
        [0, 1, 0],
    ];
    let face = new Face(Wire.makePolygon(corners)).rotate(Axis.Z, -45);
    return {
        edge: Edge.makeLine([0, 0], [1, 1]),
        arc: Edge.makeCircle(1, { startAngle: 45, endAngle: 90 }),
        wire: Wire.makePolygon(corners).rotate(Axis.Z, -45),
        face,
        solid: extrude(face, 1, { both: true }).solid(),
        axis: new Axis([0, 0, 0], [1, 1, 0]),
        plane: new Plane({ origin: [0, 0, 0], xDir: [1, 1, 0], zDir: [-1, 1, 0] }),
        missing: Edge.makeLine([5, 5], [6, 6]),
    };
}

function expectTrimmed(expected: FixtureCase, key: string, edge: Edge): void {
    let record = fixtureRecord(expected, key);
    for (let [name, other] of Object.entries(trimTargets())) {
        let piece = edge.trimToOther(other);
        if (fixtureValue(record, name) === null) {
            expect(piece, `${key}.${name}`).toBeUndefined();
            continue;
        }
        expect(piece, `${key}.${name}`).toBeDefined();
        if (piece === undefined) continue;
        let result = fixtureRecord(record, name);
        expectClose(result, "length", piece.length, MASS_TOLERANCE);
        expectVectorClose(result, "end", piece.endPoint().toTuple(), LINEAR_TOLERANCE);
    }
}

export const edgeCases: OracleCases = {
    "edge/bezier": expected => {
        let points: VectorLike[] = [
            [0, 0],
            [0, 1],
            [1, 1],
            [1, 0],
        ];
        expectEdge(expected, "plain", Edge.makeBezier(points));
        expectEdge(expected, "weighted", Edge.makeBezier(points, { weights: [1, 3, 3, 1] }));
    },
    "edge/bspline": expected => {
        let knots = [0, 0, 0, 1, 1, 1];
        expectEdge(expected, "plain", Edge.makeBspline(bsplineControlPoints(), knots, 2));
        expectEdge(
            expected,
            "weighted",
            Edge.makeBspline(bsplineControlPoints(), knots, 2, { weights: [1, 2, 1] }),
        );
    },
    "edge/helix": expected => {
        expectEdge(expected, "cylindrical", Edge.makeHelix(1, 4, 1));
        expectEdge(
            expected,
            "conical",
            Edge.makeHelix(1, 4, 1, { normal: [-1, 0, 0], coneAngle: 10, leftHand: true }),
        );
        expectEdge(expected, "centered", Edge.makeHelix(2, 6, 1, { center: [1, 2, 3] }));
    },
    "edge/three-point-arc": expected => {
        let flat = Edge.makeThreePointArc([1, 0], [0, 1], [-1, 0]);
        let tilted = Edge.makeThreePointArc([1, 0, 0], [0, 0, 1], [-1, 0, 0]);
        expectEdge(expected, "flat", flat);
        expectEdge(expected, "tilted", tilted);
        expectClose(expected, "flat_radius", flat.radius, LINEAR_TOLERANCE);
        expectClose(expected, "tilted_radius", tilted.radius, LINEAR_TOLERANCE);
        expectPoint(expected, "flat_center", flat.arcCenter);
    },
    "edge/trim-to-other": expected => {
        expectTrimmed(
            expected,
            "half_circle",
            Edge.makeCircle(1, { startAngle: 0, endAngle: 180 }),
        );
        expectTrimmed(expected, "full_circle", Edge.makeCircle(1));
    },
};
