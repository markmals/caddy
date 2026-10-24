import type { FixtureCase } from "../../../../../reference/build123d/oracle.ts";
import type { Edge } from "../../../src/topology/index.ts";

import { fixtureRecord } from "../../../../../reference/build123d/oracle.ts";
import { expectCount, expectMeasures, expectPoints } from "../oracle/support.ts";

/** The `_edge_report` serializer: how many edges a wire orders into, and where each one runs. */
export function expectEdgeReport(expected: FixtureCase, key: string, edges: readonly Edge[]): void {
    let report = fixtureRecord(expected, key);
    expectCount(report, "count", edges.length);
    expectPoints(
        report,
        "starts",
        edges.map(edge => edge.positionAt(0)),
    );
    expectPoints(
        report,
        "ends",
        edges.map(edge => edge.positionAt(1)),
    );
    expectMeasures(
        report,
        "lengths",
        edges.map(edge => edge.length),
    );
}
