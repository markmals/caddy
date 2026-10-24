import { expect } from "vite-plus/test";

import type { OracleCases } from "./support.ts";

import {
    expectClose,
    expectNumbersClose,
    fixtureBoolean,
    fixtureNumber,
    fixtureString,
} from "../../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE, MASS_TOLERANCE } from "../../../../../reference/build123d/tolerances.ts";
import { Plane } from "../../../src/geometry/index.ts";
import { Edge, FrameMethod, PositionMode, Wire } from "../../../src/topology/index.ts";
import { expectLocation } from "../../geometry/oracle/support.ts";
import { polygon } from "./shapes.ts";
import { expectPoint, expectPoints } from "./support.ts";

export const curveCases: OracleCases = {
    "edge/line": expected => {
        let edge = Edge.makeLine([1, 2, 3], [7, 10, 3]);
        expectClose(expected, "length", edge.length, MASS_TOLERANCE);
        expectPoint(expected, "start", edge.startPoint());
        expectPoint(expected, "end", edge.endPoint());
        expectPoint(expected, "position_at", edge.positionAt(0.25));
        expectPoint(expected, "position_at_length", edge.positionAt(2.5, PositionMode.Length));
        expectPoints(expected, "positions", edge.positions([0, 0.5, 1]));
        expectPoint(expected, "tangent_at", edge.tangentAt(0.25));
        expectClose(expected, "param_at", edge.paramAt(0.25), LINEAR_TOLERANCE);
        expectClose(expected, "param_at_point", edge.paramAtPoint([4, 6, 3]), LINEAR_TOLERANCE);
        expectPoint(expected, "center", edge.center());
        expect(edge.isClosed).toBe(fixtureBoolean(expected, "is_closed"));
        expect(edge.geomType).toBe(fixtureString(expected, "geom_type"));
    },
    "edge/circle": expected => {
        let edge = Edge.makeCircle(5, { plane: Plane.XY.withOrigin([1, 2, 3]) });
        expectClose(expected, "length", edge.length, MASS_TOLERANCE);
        expectClose(expected, "radius", edge.radius, LINEAR_TOLERANCE);
        expectPoint(expected, "arc_center", edge.arcCenter);
        expectPoint(expected, "position_at", edge.positionAt(0.25));
        expectPoint(expected, "tangent_at", edge.tangentAt(0.25));
        expectClose(expected, "param_at", edge.paramAt(0.25), LINEAR_TOLERANCE);
        expectClose(expected, "param_at_point", edge.paramAtPoint([1, 7, 3]), LINEAR_TOLERANCE);
        expectPoint(expected, "start", edge.startPoint());
        expectPoint(expected, "end", edge.endPoint());
        expect(edge.isClosed).toBe(fixtureBoolean(expected, "is_closed"));
        expect(edge.geomType).toBe(fixtureString(expected, "geom_type"));
    },
    "edge/arc": expected => {
        let edge = Edge.makeCircle(5, { startAngle: 20, endAngle: 160 });
        expectClose(expected, "length", edge.length, MASS_TOLERANCE);
        expectClose(expected, "radius", edge.radius, LINEAR_TOLERANCE);
        expectPoint(expected, "arc_center", edge.arcCenter);
        expectPoint(expected, "start", edge.startPoint());
        expectPoint(expected, "end", edge.endPoint());
        expectPoint(expected, "position_at", edge.positionAt(0.25));
        expectPoint(expected, "tangent_at_point", edge.tangentAt(edge.positionAt(0.25)));
        expectClose(expected, "param_at", edge.paramAt(0.5), LINEAR_TOLERANCE);
        expectClose(
            expected,
            "param_at_point",
            edge.paramAtPoint(edge.positionAt(0.75)),
            LINEAR_TOLERANCE,
        );
        expectPoint(expected, "center_geometry", edge.center());
    },
    "edge/derivative": expected => {
        let edge = Edge.makeCircle(5);
        expectPoint(expected, "first", edge.derivativeAt(0.25, 1));
        expectPoint(expected, "second", edge.derivativeAt(0.25, 2));
        expectPoint(expected, "third", edge.derivativeAt(0.25, 3));
    },
    "wire/polygon": expected => {
        let wire = polygon();
        expectClose(expected, "length", wire.length, MASS_TOLERANCE);
        expect(wire.isClosed).toBe(fixtureBoolean(expected, "is_closed"));
        expectPoint(expected, "start", wire.startPoint());
        expectPoint(expected, "end", wire.endPoint());
        expectPoint(expected, "position_at", wire.positionAt(0.25));
        expectPoint(expected, "position_at_length", wire.positionAt(12, PositionMode.Length));
        expectPoint(expected, "tangent_at", wire.tangentAt(0.25));
        expectClose(expected, "param_at_point", wire.paramAtPoint([10, 2.5, 0]), LINEAR_TOLERANCE);
        expectPoint(expected, "center", wire.center());
        expect(wire.edges()).toHaveLength(fixtureNumber(expected, "edge_count"));
    },
    "wire/circle": expected => {
        let wire = Wire.makeCircle(4, Plane.XY.withOrigin([0, 0, 2]));
        expectClose(expected, "length", wire.length, MASS_TOLERANCE);
        expectClose(expected, "radius", wire.radius, LINEAR_TOLERANCE);
        expect(wire.isClosed).toBe(fixtureBoolean(expected, "is_closed"));
        expectPoint(expected, "position_at", wire.positionAt(0.25));
        expectPoint(expected, "tangent_at", wire.tangentAt(0.25));
        expectPoint(expected, "center", wire.center());
    },
    "wire/param-at": expected => {
        let wire = polygon();
        expectNumbersClose(
            expected,
            "polygon",
            [0, 0.25, 0.5, 0.75, 1].map(position => wire.paramAt(position)),
            LINEAR_TOLERANCE,
        );
        let circle = Wire.makeCircle(4);
        expectNumbersClose(
            expected,
            "circle",
            [0, 0.25, 0.5, 1].map(position => circle.paramAt(position)),
            LINEAR_TOLERANCE,
        );
    },
    "edge/location-at": expected => {
        let line = Edge.makeLine([0, 0, 0], [10, 0, 0]);
        let circle = Edge.makeCircle(5);
        expectLocation(expected, "line_frenet", line.locationAt(0.25));
        expectLocation(
            expected,
            "line_x_dir",
            line.locationAt(0.25, PositionMode.Parameter, FrameMethod.Frenet, [0, 0, 1]),
        );
        expectLocation(expected, "circle_frenet", circle.locationAt(0.25));
        expectLocation(
            expected,
            "circle_corrected",
            circle.locationAt(0.25, PositionMode.Parameter, FrameMethod.Corrected),
        );
    },
    "wire/location-at": expected => {
        let wire = Wire.makeCircle(4);
        expectLocation(expected, "frenet", wire.locationAt(0.25));
        expectLocation(
            expected,
            "corrected",
            wire.locationAt(0.25, PositionMode.Parameter, FrameMethod.Corrected),
        );
        expectLocation(
            expected,
            "length_mode",
            wire.locationAt(wire.length * 0.25, PositionMode.Length),
        );
    },
};
