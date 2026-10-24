/**
 * Asserts a Caddy curve against the oracle record for the equivalent build123d curve: the shared
 * shape metrics plus the sample positions and tangents that fix where the curve runs.
 */

import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { Edge } from "../../src/topology/index.ts";
import type { Wire } from "../../src/topology/index.ts";

import {
    expectClose,
    expectNumbersClose,
    expectVectorClose,
    fixtureNumber,
    fixtureValue,
} from "../../../../reference/build123d/oracle.ts";
import { APPROXIMATION_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import { expectShapeMetrics } from "../shape-metrics.ts";

/** Sampled positions along a curve, by the name the oracle records them under. */
const SAMPLES: readonly (readonly [string, number])[] = [
    ["start", 0],
    ["quarter", 0.25],
    ["middle", 0.5],
    ["end", 1],
];

export function expectCurve(expected: FixtureCase, curve: Edge | Wire): void {
    expectShapeMetrics(expected, curve);
    expectClose(expected, "length", curve.length, APPROXIMATION_TOLERANCE);
    for (let [name, position] of SAMPLES) {
        expectVectorClose(
            expected,
            name,
            curve.positionAt(position).toTuple(),
            APPROXIMATION_TOLERANCE,
        );
    }
    expectVectorClose(
        expected,
        "start_tangent",
        curve.tangentAt(0).toTuple(),
        APPROXIMATION_TOLERANCE,
    );
    expectVectorClose(
        expected,
        "end_tangent",
        curve.tangentAt(1).toTuple(),
        APPROXIMATION_TOLERANCE,
    );
}

/** Rounds like the oracle's sort key, so ties break the same way on both sides. */
function sortKey(edge: Edge): [number, number, number] {
    let start = edge.positionAt(0);
    let round = (value: number) => Math.round(value * 1e6) / 1e6;
    return [round(edge.length), round(start.x), round(start.y)];
}

/**
 * Asserts every edge of a solver result against the oracle record, in the same
 * length-then-start-point order the oracle sorts them into.
 */
export function expectCurveGroup(expected: FixtureCase, solutions: Iterable<Edge>): void {
    let edges = [...solutions].sort((left, right) => {
        let [leftKey, rightKey] = [sortKey(left), sortKey(right)];
        return leftKey[0] - rightKey[0] || leftKey[1] - rightKey[1] || leftKey[2] - rightKey[2];
    });
    expect(edges.length, "solution count").toBe(fixtureNumber(expected, "count"));
    expectNumbersClose(
        expected,
        "lengths",
        edges.map(edge => edge.length),
        APPROXIMATION_TOLERANCE,
    );
    let records = fixtureValue(expected, "edges");
    if (!Array.isArray(records)) throw new TypeError("expected recorded solution edges");
    edges.forEach((edge, index) => {
        let record = records[index];
        if (record === null || typeof record !== "object") {
            throw new TypeError(`missing solution edge ${index}`);
        }
        expectCurve(
            { ...expected, path: `edges[${index}]`, data: record as Record<string, unknown> },
            edge,
        );
    });
}
