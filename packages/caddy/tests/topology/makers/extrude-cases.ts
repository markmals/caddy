import type { OracleCases } from "../oracle/support.ts";

import { Pos } from "../../../src/geometry/index.ts";
import { Until } from "../../../src/operations/index.ts";
import { Edge, Face, Shell, Solid, Vertex, Wire } from "../../../src/topology/index.ts";
import { expectShapeMetrics } from "../../shape-metrics.ts";

function plateWithHole(): Face {
    return new Face(Wire.makeRect(10, 10), [Wire.makeCircle(2)]);
}

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

function slabAbove(): Solid {
    return Solid.makeBox(10, 10, 2).transform(new Pos(-5, -5, 5));
}

export const extrudeCases: OracleCases = {
    "extrude/vertex-to-edge": expected =>
        expectShapeMetrics(expected, Edge.extrude(new Vertex(1, 2, 3), [0, 0, 5])),
    "extrude/wire-to-shell": expected =>
        expectShapeMetrics(expected, Shell.extrude(openPolyline(), [0, 0, 4])),
    "extrude/face-to-solid": expected =>
        expectShapeMetrics(expected, Solid.extrude(plateWithHole(), [0, 0, 4])),
    "extrude-linear-with-rotation/face": expected =>
        expectShapeMetrics(
            expected,
            Solid.extrudeLinearWithRotation(Face.makeRect(6, 4), [0, 0, 0], [0, 0, 10], 45),
        ),
    "extrude-linear-with-rotation/face-with-hole": expected =>
        expectShapeMetrics(
            expected,
            Solid.extrudeLinearWithRotation(plateWithHole(), [0, 0, 0], [0, 0, 8], 30),
        ),
    "extrude-taper/prism": expected =>
        expectShapeMetrics(expected, Solid.extrudeTaper(Face.makeRect(10, 10), [0, 0, 5], 10)),
    "extrude-taper/hole-flipped": expected =>
        expectShapeMetrics(expected, Solid.extrudeTaper(plateWithHole(), [0, 0, 5], 10)),
    "extrude-taper/hole-unflipped": expected =>
        expectShapeMetrics(
            expected,
            Solid.extrudeTaper(plateWithHole(), [0, 0, 5], 10, { flipInner: false }),
        ),
    "extrude-until/next": expected =>
        expectShapeMetrics(
            expected,
            Solid.extrudeUntil(Face.makeRect(4, 4), slabAbove(), [0, 0, 1], {
                until: Until.Next,
            }),
        ),
    "extrude-until/last": expected =>
        expectShapeMetrics(
            expected,
            Solid.extrudeUntil(Face.makeRect(4, 4), slabAbove(), [0, 0, 1], {
                until: Until.Last,
            }),
        ),
};
