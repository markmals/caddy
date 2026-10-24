import type { OracleCases } from "../oracle/support.ts";

import { Axis, Plane } from "../../../src/geometry/index.ts";
import { Shell, Solid, Vertex, Wire } from "../../../src/topology/index.ts";
import { expectShapeMetrics } from "../../shape-metrics.ts";

export const primitiveCases: OracleCases = {
    "box/default": expected => expectShapeMetrics(expected, Solid.makeBox(10, 6, 4)),
    "box/plane": expected =>
        expectShapeMetrics(expected, Solid.makeBox(10, 6, 4, { plane: Plane.YZ })),
    "cone/full": expected => expectShapeMetrics(expected, Solid.makeCone(5, 2, 8)),
    "cone/partial": expected =>
        expectShapeMetrics(expected, Solid.makeCone(5, 0, 8, { angle: 120 })),
    "cylinder/full": expected => expectShapeMetrics(expected, Solid.makeCylinder(3, 10)),
    "cylinder/partial-plane": expected =>
        expectShapeMetrics(expected, Solid.makeCylinder(3, 10, { plane: Plane.XZ, angle: 90 })),
    "sphere/full": expected => expectShapeMetrics(expected, Solid.makeSphere(5)),
    "sphere/partial": expected =>
        expectShapeMetrics(expected, Solid.makeSphere(5, { angle1: -30, angle2: 60, angle3: 210 })),
    "torus/full": expected => expectShapeMetrics(expected, Solid.makeTorus(8, 2)),
    "torus/partial": expected =>
        expectShapeMetrics(
            expected,
            Solid.makeTorus(8, 2, { startAngle: 0, endAngle: 180, majorAngle: 270 }),
        ),
    "wedge/default": expected =>
        expectShapeMetrics(expected, Solid.makeWedge(10, 8, 6, 2, 1, 8, 5)),
    "wedge/plane": expected =>
        expectShapeMetrics(expected, Solid.makeWedge(10, 8, 6, 2, 1, 8, 5, { plane: Plane.XZ })),
    "from-bounding-box/rotated-cone": expected => {
        let cone = Solid.makeCone(5, 2, 8, { plane: Plane.XZ });
        expectShapeMetrics(expected, Solid.fromBoundingBox(cone.boundingBox));
    },
    "from-bounding-box/oriented": expected => {
        let wedge = Solid.makeWedge(10, 8, 6, 2, 1, 8, 5).rotate(Axis.Z, 35);
        expectShapeMetrics(expected, Solid.fromBoundingBox(wedge.orientedBoundingBox));
    },
    "loft/wires": expected => {
        let sections = [Wire.makeRect(10, 6), Wire.makeCircle(3, new Plane({ origin: [0, 0, 8] }))];
        expectShapeMetrics(expected, Solid.makeLoft(sections));
    },
    "loft/ruled-to-vertex": expected => {
        let sections = [
            Wire.makeRect(10, 6),
            Wire.makeRect(4, 3, new Plane({ origin: [0, 0, 5] })),
            new Vertex(0, 0, 9),
        ];
        expectShapeMetrics(expected, Solid.makeLoft(sections, { ruled: true }));
    },
    "loft/shell-open-wires": expected => {
        let sections = [
            Wire.makePolygon(
                [
                    [0, 0, 0],
                    [6, 0, 0],
                    [6, 4, 0],
                ],
                { close: false },
            ),
            Wire.makePolygon(
                [
                    [0, 0, 5],
                    [3, 0, 5],
                    [3, 2, 5],
                ],
                { close: false },
            ),
        ];
        expectShapeMetrics(expected, Shell.makeLoft(sections));
    },
};
