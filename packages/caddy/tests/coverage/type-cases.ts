import type { RotationLike, VectorLike } from "../../src/index.ts";
import type { OracleCases } from "../topology/oracle/support.ts";

import { Extrinsic, Pos, Rotation, Vector, Wire } from "../../src/index.ts";
import { Edge } from "../../src/topology/index.ts";
import { expectLocation } from "../joints/support.ts";
import { expectPoint, expectShapeMetrics } from "../topology/oracle/support.ts";
import { expectEdge } from "./edge-metrics.ts";

/** How Caddy reads a `RotationLike` wherever one is accepted (`parts/placement.ts`). */
function asRotation(value: RotationLike): Rotation {
    return value instanceof Rotation ? value : new Rotation(value);
}

export const typeCases: OracleCases = {
    "types/rotation-like": expected => {
        expectLocation(expected, "from_angles", new Rotation(10, 20, 30));
        expectLocation(expected, "from_tuple", asRotation([10, 20, 30]));
        expectLocation(expected, "from_two_tuple", asRotation([10, 20]));
        expectLocation(expected, "from_vector", asRotation(new Vector(10, 20, 30)));
        expectLocation(expected, "from_rotation", asRotation(new Rotation(10, 20, 30)));
        expectLocation(expected, "extrinsic", new Rotation([10, 20, 30], Extrinsic.XYZ));
        expectLocation(expected, "applied", asRotation([10, 20, 30]).multiply(new Pos(1, 0, 0)));
    },
    "types/vector-like": expected => {
        let points: VectorLike[] = [[1, 2], [1, 2, 3], new Vector(1, 2, 3)];
        expectPoint(expected, "from_two_tuple", Vector.from(points[0]!));
        expectPoint(expected, "from_three_tuple", Vector.from(points[1]!));
        expectPoint(expected, "from_vector", Vector.from(points[2]!));
        expectEdge(expected, "line_from_two_tuples", Edge.makeLine([0, 0], [3, 4]));
        expectShapeMetrics(
            expected,
            "polygon_from_mixed",
            Wire.makePolygon([new Vector(0, 0), [4, 0], [4, 3, 0]]),
        );
    },
};
