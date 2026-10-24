import type { OracleCases } from "../oracle/support.ts";

import { Edge, Wire } from "../../../src/topology/index.ts";
import { expectShapeMetrics } from "../../shape-metrics.ts";
import { expectCount, expectFlags, expectPoints } from "../oracle/support.ts";
import { expectEdgeReport } from "./support.ts";

function openPolyline(): Wire {
    return Wire.makePolygon(
        [
            [0, 0, 0],
            [10, 0, 0],
            [10, 6, 0],
        ],
        { close: false },
    );
}

/** A rectangle whose bottom edge is split in two by a corner 0.4 µm away from it. */
function degenerateWire(): Wire {
    return Wire.makePolygon([
        [0, 0, 0],
        [10, 0, 0],
        [10.0004, 0, 0],
        [10, 6, 0],
        [0, 6, 0],
    ]);
}

export const wireCases: OracleCases = {
    "wire/order-edges": expected => {
        let scrambled = new Wire([
            Edge.makeLine([10, 6, 0], [10, 0, 0]),
            Edge.makeLine([0, 0, 0], [10, 0, 0]),
        ]);
        expectEdgeReport(expected, "edges", scrambled.orderEdges());
    },
    "wire/order-edges-circle": expected =>
        expectEdgeReport(expected, "edges", Wire.makeCircle(4).orderEdges()),
    "wire/geom-equal": expected => {
        let wire = Wire.makeRect(10, 6);
        expectFlags(expected, {
            same_geometry: wire.geomEqual(Wire.makeRect(10, 6)),
            different_geometry: wire.geomEqual(Wire.makeRect(10, 6.5)),
            reversed_build: wire.geomEqual(new Wire([...wire.edges].reverse())),
        });
    },
    "wire/stitch": expected => {
        let first = Wire.makePolygon(
            [
                [0, 0, 0],
                [10, 0, 0],
            ],
            { close: false },
        );
        let second = Wire.makePolygon(
            [
                [10, 0, 0],
                [10, 6, 0],
                [0, 6, 0],
            ],
            { close: false },
        );
        let stitched = first.stitch(second);
        expectShapeMetrics(expected, stitched);
        expectEdgeReport(expected, "edges", stitched.orderEdges());
    },
    "wire/trim-positions": expected => {
        let trimmed = openPolyline().trim(0.25, 0.75);
        expectShapeMetrics(expected, trimmed);
        expectEdgeReport(expected, "edges", trimmed.orderEdges());
    },
    "wire/trim-single-edge": expected => {
        let trimmed = new Wire([Edge.makeLine([0, 0, 0], [10, 0, 0])]).trim(0.2, 0.6);
        expectShapeMetrics(expected, trimmed);
        expectEdgeReport(expected, "edges", trimmed.orderEdges());
    },
    "wire/trim-points": expected => {
        let trimmed = openPolyline().trim([4, 0, 0], [10, 3, 0]);
        expectShapeMetrics(expected, trimmed);
        expectEdgeReport(expected, "edges", trimmed.orderEdges());
    },
    "wire/fix-degenerate-edges": expected => {
        let wire = degenerateWire();
        let fixed = wire.fixDegenerateEdges(0.001);
        expectCount(expected, "before", wire.edges.length);
        expectCount(expected, "after", fixed.edges.length);
        expectShapeMetrics(expected, fixed);
    },
    "wire/order-chamfer-edges": expected => {
        let edges = Wire.makeRect(10, 6).edges;
        let pair = [edges[0]!, edges[1]!] as const;
        expectPoints(
            expected,
            "unchanged",
            Wire.orderChamferEdges(undefined, pair).map(edge => edge.center),
        );
        expectPoints(
            expected,
            "swapped",
            Wire.orderChamferEdges(pair[1], pair).map(edge => edge.center),
        );
    },
};
