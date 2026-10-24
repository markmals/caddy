/**
 * Asserts a Caddy curve against the oracle record for the equivalent build123d curve: the shared
 * shape metrics plus the sample positions and tangents that fix where the curve runs.
 */

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { Edge } from "../../src/topology/index.ts";
import type { Wire } from "../../src/topology/index.ts";

import { expectClose, expectVectorClose } from "../../../../reference/build123d/oracle.ts";
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
