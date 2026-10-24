import type { OracleCases } from "../oracle/support.ts";

import { expectClose, expectNumbersClose } from "../../../../../reference/build123d/oracle.ts";
import {
    APPROXIMATION_TOLERANCE,
    LINEAR_TOLERANCE,
    MASS_TOLERANCE,
    ORIENTATION_TOLERANCE,
} from "../../../../../reference/build123d/tolerances.ts";
import { Axis, Plane } from "../../../src/geometry/index.ts";
import { Curve, Edge, Face, PositionMode, Solid, Wire } from "../../../src/topology/index.ts";
import { expectCount, expectMeasures } from "../oracle/support.ts";
import { expectLocationClose, expectRows, sortedTriples } from "./support.ts";

/** Each edge as its two end points, in the order the edges came in. */
function endPoints(edges: Iterable<Edge>): number[][] {
    return [...edges].map(edge => [
        ...edge.positionAt(0).toTuple(),
        ...edge.positionAt(1).toTuple(),
    ]);
}

export const curveCases: OracleCases = {
    "distribute-locations/edge": expected => {
        let circle = Edge.makeCircle(5);
        let spread = circle.distributeLocations(5);
        let plain = circle.distributeLocations(3, { positionsOnly: true });
        expectRows(
            expected,
            "positions",
            spread.map(location => location.position.toTuple()),
        );
        expectRows(
            expected,
            "orientations",
            spread.map(location => location.orientation.toTuple()),
            ORIENTATION_TOLERANCE,
        );
        expectRows(
            expected,
            "plain_positions",
            plain.map(location => location.position.toTuple()),
        );
        expectRows(
            expected,
            "plain_orientations",
            plain.map(location => location.orientation.toTuple()),
            ORIENTATION_TOLERANCE,
        );
    },

    "distribute-locations/partial-range": expected => {
        let line = Edge.makeLine([0, 0, 0], [10, 0, 0]);
        expectRows(
            expected,
            "positions",
            line
                .distributeLocations(4, { start: 0.25, stop: 0.75 })
                .map(location => location.position.toTuple()),
        );
    },

    "locations/along-wire": expected => {
        let wire = new Wire([
            Edge.makeLine([0, 0, 0], [4, 0, 0]),
            Edge.makeLine([4, 0, 0], [4, 3, 0]),
        ]);
        expectRows(
            expected,
            "by_parameter",
            wire.locations([0, 0.25, 0.5, 1]).map(location => location.position.toTuple()),
        );
        expectRows(
            expected,
            "by_length",
            wire
                .locations([0, 2, 5, 7], PositionMode.Length)
                .map(location => location.position.toTuple()),
        );
    },

    "perpendicular-line/circle": expected => {
        let circle = Edge.makeCircle(5);
        let line = circle.perpendicularLine(4, 0.25);
        let other = circle.perpendicularLine(4, 0.25, Plane.XZ);
        expectNumbersClose(
            expected,
            "ends",
            [...line.positionAt(0).toTuple(), ...line.positionAt(1).toTuple()],
            LINEAR_TOLERANCE,
        );
        expectClose(expected, "length", line.length, MASS_TOLERANCE);
        expectNumbersClose(
            expected,
            "other_plane_ends",
            [...other.positionAt(0).toTuple(), ...other.positionAt(1).toTuple()],
            LINEAR_TOLERANCE,
        );
    },

    "tangent-angle-at/circle": expected => {
        let circle = Edge.makeCircle(2);
        let line = Edge.makeLine([0, 0, 0], [1, 1, 0]);
        expectNumbersClose(
            expected,
            "circle",
            Array.from({ length: 8 }, (_, index) => circle.tangentAngleAt(index / 8)),
            ORIENTATION_TOLERANCE,
        );
        expectClose(expected, "line", line.tangentAngleAt(), ORIENTATION_TOLERANCE);
        expectClose(
            expected,
            "line_in_xz",
            line.tangentAngleAt(0.5, PositionMode.Parameter, Plane.XZ),
            ORIENTATION_TOLERANCE,
        );
    },

    "curvature-comb/circle": expected => {
        let comb = Edge.makeCircle(5).curvatureComb({ count: 8 });
        expectCount(expected, "count", comb.length);
        expectMeasures(
            expected,
            "lengths",
            comb.map(edge => edge.length),
        );
        expectRows(expected, "ends", endPoints(comb));
    },

    "curvature-comb/spline": expected => {
        let spline = Edge.makeSpline([
            [0, 0, 0],
            [3, 2, 0],
            [6, -2, 0],
            [9, 0, 0],
        ]);
        let comb = spline.curvatureComb({ count: 10, maxToothSize: 2 });
        expectCount(expected, "count", comb.length);
        expectMeasures(
            expected,
            "lengths",
            comb.map(edge => edge.length),
        );
        expectRows(expected, "ends", endPoints(comb));
    },

    "curvature-comb/line-has-no-teeth": expected => {
        expectCount(
            expected,
            "count",
            Edge.makeLine([0, 0, 0], [5, 0, 0]).curvatureComb({ count: 5 }).length,
        );
    },

    "find-intersection-points/edge-edge": expected => {
        let circle = Edge.makeCircle(5);
        let line = Edge.makeLine([-8, 3, 0], [8, 3, 0]);
        expectRows(
            expected,
            "points",
            sortedTriples(circle.findIntersectionPoints(line).map(point => point.toTuple())),
        );
    },

    "find-intersection-points/edge-axis": expected => {
        let circle = Edge.makeCircle(5);
        expectRows(
            expected,
            "points",
            sortedTriples(circle.findIntersectionPoints(Axis.X).map(point => point.toTuple())),
        );
        expectRows(
            expected,
            "offset",
            sortedTriples(
                circle
                    .findIntersectionPoints(new Axis([0, 3, 0], [1, 0, 0]))
                    .map(point => point.toTuple()),
            ),
        );
    },

    "find-intersection-points/self-crossing": expected => {
        let spline = Edge.makeSpline([
            [-4, -2, 0],
            [4, 2, 0],
            [-4, 2, 0],
            [4, -2, 0],
        ]);
        expectRows(
            expected,
            "points",
            sortedTriples(spline.findIntersectionPoints().map(point => point.toTuple())),
            APPROXIMATION_TOLERANCE,
        );
    },

    "find-intersection-points/no-crossing": expected => {
        let circle = Edge.makeCircle(2);
        let line = Edge.makeLine([-8, 6, 0], [8, 6, 0]);
        expectCount(expected, "count", circle.findIntersectionPoints(line).length);
    },

    "find-intersection-points/face-and-solid": expected => {
        let face = new Face(Plane.XY);
        let box = Solid.makeBox(2, 2, 2, { plane: Plane.XY.withOrigin([-1, -1, -1]) });
        let axis = new Axis([0, 0, -10], [0, 0, 1]);
        expectRows(
            expected,
            "face",
            face
                .findIntersectionPoints(axis)
                .map(([point, normal]) => [...point.toTuple(), ...normal.toTuple()]),
        );
        expectRows(
            expected,
            "solid",
            box
                .findIntersectionPoints(axis)
                .map(([point, normal]) => [...point.toTuple(), ...normal.toTuple()]),
        );
        expectCount(
            expected,
            "missing",
            box.findIntersectionPoints(new Axis([9, 9, -10], [0, 0, 1])).length,
        );
    },

    "find-tangent/circle-and-line": expected => {
        let circle = Edge.makeCircle(5);
        let line = Edge.makeLine([0, 0, 0], [1, 1, 0]);
        expectNumbersClose(
            expected,
            "circle_90",
            circle.findTangent(90).sort((a, b) => a - b),
            APPROXIMATION_TOLERANCE,
        );
        expectNumbersClose(
            expected,
            "circle_180",
            circle.findTangent(180).sort((a, b) => a - b),
            APPROXIMATION_TOLERANCE,
        );
        expectNumbersClose(expected, "line_45", line.findTangent(45), MASS_TOLERANCE);
        expectNumbersClose(expected, "line_90", line.findTangent(90), MASS_TOLERANCE);
    },

    "curve-location-at/joined-edges": expected => {
        let curve = new Curve([
            Edge.makeLine([0, 0, 0], [4, 0, 0]),
            Edge.makeLine([4, 0, 0], [4, 3, 0]),
        ]);
        expectLocationClose(expected, "start", curve.locationAt(0));
        expectLocationClose(expected, "middle", curve.locationAt(0.5));
        expectLocationClose(expected, "end", curve.locationAt(1));
    },
};
