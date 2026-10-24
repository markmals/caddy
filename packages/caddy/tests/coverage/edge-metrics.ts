/** Asserts the `edge_record` serializer of `cases/coverage.py`: kind, size, ends and shape. */

import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { Edge } from "../../src/topology/index.ts";

import {
    expectClose,
    expectMatrixClose,
    expectVectorClose,
    fixtureBoolean,
    fixtureRecord,
    fixtureString,
} from "../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE, MASS_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";

/** How many points `curve_points` samples along an edge. */
const SAMPLES = 5;

export function expectEdge(expected: FixtureCase, key: string, edge: Edge): void {
    let record = fixtureRecord(expected, key);
    expect(edge.geomType, `${key} geom type`).toBe(fixtureString(record, "geom_type"));
    expectClose(record, "length", edge.length, MASS_TOLERANCE);
    expect(edge.isClosed, `${key} closed`).toBe(fixtureBoolean(record, "is_closed"));
    expectVectorClose(record, "start", edge.startPoint().toTuple(), LINEAR_TOLERANCE);
    expectVectorClose(record, "end", edge.endPoint().toTuple(), LINEAR_TOLERANCE);
    let box = edge.boundingBox();
    expectVectorClose(record, "min", box.min.toTuple(), LINEAR_TOLERANCE);
    expectVectorClose(record, "max", box.max.toTuple(), LINEAR_TOLERANCE);
    expectMatrixClose(
        record,
        "points",
        Array.from({ length: SAMPLES }, (_, index) =>
            edge.positionAt(index / (SAMPLES - 1)).toTuple(),
        ),
        LINEAR_TOLERANCE,
    );
}
