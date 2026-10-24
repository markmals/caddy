import type { OracleCases } from "../oracle/support.ts";

import { Axis, Plane, Pos } from "../../../src/geometry/index.ts";
import { Transition } from "../../../src/operations/index.ts";
import { Edge, Face, Shell, Solid, Wire } from "../../../src/topology/index.ts";
import { expectShapeMetrics } from "../../shape-metrics.ts";

function cornerPath(): Wire {
    return Wire.makePolygon(
        [
            [0, 0, 0],
            [10, 0, 0],
            [16, 6, 0],
        ],
        { close: false },
    );
}

function splinePath(): Wire {
    return new Wire([
        Edge.makeSpline([
            [0, 0, 0],
            [5, 3, 2],
            [10, 0, 5],
        ]),
    ]);
}

function straightPath(): Wire {
    return new Wire([Edge.makeLine([0, 0, 0], [10, 0, 0])]);
}

export const sweepCases: OracleCases = {
    "revolve/face": expected => {
        let profile = Face.makeRect(4, 6, Plane.XZ).moved(new Pos(5, 0, 0));
        expectShapeMetrics(expected, Solid.revolve(profile, 270, Axis.Z));
    },
    "revolve/wire-with-hole": expected => {
        let outer = Wire.makeRect(4, 6, Plane.XZ).moved(new Pos(8, 0, 0));
        let inner = Wire.makeCircle(1, Plane.XZ).moved(new Pos(8, 0, 0));
        expectShapeMetrics(expected, Solid.revolve(outer, 180, Axis.Z, { innerWires: [inner] }));
    },
    "revolve/shell": expected => {
        let profile = Wire.makePolygon(
            [
                [4, 0, 0],
                [6, 0, 2],
                [6, 0, 6],
            ],
            { close: false },
        );
        expectShapeMetrics(expected, Shell.revolve(profile, 220, Axis.Z));
    },
    "sweep/face-along-corner": expected =>
        expectShapeMetrics(expected, Solid.sweep(Face.makeRect(2, 2, Plane.YZ), cornerPath())),
    "sweep/face-with-hole": expected => {
        let section = new Face(Wire.makeRect(4, 4, Plane.YZ), [Wire.makeCircle(1, Plane.YZ)]);
        expectShapeMetrics(expected, Solid.sweep(section, straightPath()));
    },
    "sweep/frenet": expected =>
        expectShapeMetrics(
            expected,
            Solid.sweep(Face.makeRect(2, 1, Plane.YZ), splinePath(), { isFrenet: true }),
        ),
    "sweep/binormal-wire": expected => {
        let binormal = new Wire([Edge.makeLine([0, 2, 0], [10, 2, 5])]);
        expectShapeMetrics(
            expected,
            Solid.sweep(Face.makeRect(2, 1, Plane.YZ), splinePath(), { binormal }),
        );
    },
    "sweep/binormal-vector": expected =>
        expectShapeMetrics(
            expected,
            Solid.sweep(Face.makeRect(2, 1, Plane.YZ), splinePath(), { normal: [0, 1, 1] }),
        ),
    "sweep/wire-section-shell": expected =>
        expectShapeMetrics(
            expected,
            Solid.sweep(Wire.makeRect(2, 2, Plane.YZ), cornerPath(), { makeSolid: false }),
        ),
    "sweep/transition-right": expected =>
        expectShapeMetrics(
            expected,
            Solid.sweep(Face.makeRect(2, 2, Plane.YZ), cornerPath(), {
                transition: Transition.Right,
            }),
        ),
    "sweep-multi/two-sections": expected => {
        let profiles = [
            Wire.makeCircle(2, Plane.YZ),
            Wire.makeCircle(1, new Plane({ origin: [10, 0, 0], zDir: [1, 0, 0] })),
        ];
        expectShapeMetrics(expected, Solid.sweepMulti(profiles, straightPath()));
    },
    "sweep-multi/faces": expected => {
        let profiles = [
            Face.makeRect(4, 4, Plane.YZ),
            Face.makeRect(2, 2, new Plane({ origin: [10, 0, 0], zDir: [1, 0, 0] })),
        ];
        expectShapeMetrics(expected, Solid.sweepMulti(profiles, straightPath()));
    },
    "sweep/shell-profile-along-path": expected => {
        let profile = Wire.makePolygon(
            [
                [0, -2, 0],
                [0, 2, 0],
            ],
            { close: false },
        );
        expectShapeMetrics(expected, Shell.sweep(profile, cornerPath()));
    },
};
