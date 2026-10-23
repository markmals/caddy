import type { OracleCases } from "./support.ts";

import { expectClose, expectVectorClose } from "../../../../../reference/build123d/oracle.ts";
import {
    ANGULAR_TOLERANCE,
    EXACT_TOLERANCE,
    LINEAR_TOLERANCE,
} from "../../../../../reference/build123d/tolerances.ts";
import { Axis, Plane, Vector } from "../../../src/index.ts";
import { expectFlags } from "./support.ts";

/** `Vector` arithmetic, angles, projection and rounding. */
export const vectorCases: OracleCases = {
    "vector/construct": expected => {
        expectVectorClose(
            expected,
            "triple",
            new Vector(1.5, -2.25, 3.125).toTuple(),
            EXACT_TOLERANCE,
        );
        expectVectorClose(expected, "pair", Vector.from([1.5, -2.25]).toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "empty", new Vector().toTuple(), EXACT_TOLERANCE);
        expectVectorClose(
            expected,
            "from_tuple",
            Vector.from([4, 5, 6]).toTuple(),
            EXACT_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "from_vector",
            Vector.from(new Vector(7, 8, 9)).toTuple(),
            EXACT_TOLERANCE,
        );
        expectClose(expected, "length", new Vector(1, 2, 2).length, EXACT_TOLERANCE);
    },

    "vector/arithmetic": expected => {
        let a = new Vector(1, 2, 3);
        let b = new Vector(-4, 0.5, 6);
        expectVectorClose(expected, "add", a.add(b).toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "add_tuple", a.add([1, 1, 1]).toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "sub", a.sub(b).toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "multiply", a.multiply(-2.5).toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "divide", a.divide(4).toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "negate", a.negate().toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "reverse", a.reverse().toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "center", a.center().toTuple(), EXACT_TOLERANCE);
    },

    "vector/products": expected => {
        let a = new Vector(1, 2, 3);
        let b = new Vector(-4, 0.5, 6);
        expectClose(expected, "dot", a.dot(b), EXACT_TOLERANCE);
        expectVectorClose(expected, "cross", a.cross(b).toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "normalized", a.normalized().toTuple(), EXACT_TOLERANCE);
        expectClose(expected, "normalized_length", a.normalized().length, EXACT_TOLERANCE);
    },

    "vector/angles": expected => {
        let a = new Vector(1, 1, 0);
        let b = new Vector(0, 1, 1);
        expectClose(expected, "acute", new Vector(1, 0, 0).getAngle([1, 1, 0]), ANGULAR_TOLERANCE);
        expectClose(
            expected,
            "obtuse",
            new Vector(1, 0, 0).getAngle([-1, 0.2, 0]),
            ANGULAR_TOLERANCE,
        );
        expectClose(
            expected,
            "straight",
            new Vector(1, 0, 0).getAngle([-1, 0, 0]),
            ANGULAR_TOLERANCE,
        );
        expectClose(expected, "general", a.getAngle(b), ANGULAR_TOLERANCE);
        expectClose(
            expected,
            "signed_default_normal",
            new Vector(1, 0, 0).getSignedAngle([0, 1, 0]),
            ANGULAR_TOLERANCE,
        );
        expectClose(
            expected,
            "signed_with_normal",
            new Vector(1, 0, 0).getSignedAngle([0, 1, 0], [0, 0, 1]),
            ANGULAR_TOLERANCE,
        );
        expectClose(
            expected,
            "signed_obtuse",
            a.getSignedAngle([-1, 0.1, 0], [0, 0, 1]),
            ANGULAR_TOLERANCE,
        );
    },

    "vector/project": expected => {
        let point = new Vector(3, 4, 5);
        let tilted = new Plane({ origin: [0, 0, 1], zDir: [1, 1, 1] });
        expectVectorClose(
            expected,
            "to_line",
            point.projectToLine([0, 2, 0]).toTuple(),
            EXACT_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "to_plane_xy",
            point.projectToPlane(Plane.XY).toTuple(),
            LINEAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "to_plane_tilted",
            point.projectToPlane(tilted).toTuple(),
            LINEAR_TOLERANCE,
        );
        expectClose(expected, "distance_to_plane", point.distanceToPlane(tilted), LINEAR_TOLERANCE);
        expectClose(
            expected,
            "signed_distance",
            point.signedDistanceFromPlane(tilted),
            LINEAR_TOLERANCE,
        );
        expectClose(
            expected,
            "signed_distance_behind",
            new Vector(-3, -4, -5).signedDistanceFromPlane(tilted),
            LINEAR_TOLERANCE,
        );
    },

    "vector/rotate": expected => {
        let point = new Vector(1, 2, 3);
        expectVectorClose(
            expected,
            "about_x",
            point.rotate(Axis.X, 90).toTuple(),
            LINEAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "about_y",
            point.rotate(Axis.Y, 45).toTuple(),
            LINEAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "about_z",
            point.rotate(Axis.Z, -30).toTuple(),
            LINEAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "about_diagonal",
            point.rotate(new Axis([0, 0, 0], [1, 1, 1]), 120).toTuple(),
            LINEAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "about_offset_axis",
            point.rotate(new Axis([10, -5, 2], [0, 0, 1]), -30).toTuple(),
            LINEAR_TOLERANCE,
        );
    },

    "vector/transform": expected => {
        let point = new Vector(3, -1, 2);
        let frame = new Plane({ origin: [1, 2, 3], xDir: [1, 1, 0], zDir: [0, 0, 1] });
        expectVectorClose(
            expected,
            "point_forward",
            point.transform(frame.forwardTransform).toTuple(),
            LINEAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "point_reverse",
            point.transform(frame.reverseTransform).toTuple(),
            LINEAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "direction_forward",
            point.transform(frame.forwardTransform, true).toTuple(),
            ANGULAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "direction_reverse",
            point.transform(frame.reverseTransform, true).toTuple(),
            ANGULAR_TOLERANCE,
        );
    },

    "vector/rounded": expected => {
        let noisy = new Vector(1.2345678901234567, -6.123233995736766e-17, 0.9999999999999999);
        expectVectorClose(expected, "to_14", noisy.rounded(14).toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "to_6", noisy.rounded(6).toTuple(), EXACT_TOLERANCE);
        expectVectorClose(
            expected,
            "to_0",
            new Vector(1.4, -1.6, 2.5).rounded(0).toTuple(),
            EXACT_TOLERANCE,
        );
    },

    "vector/equality": expected => {
        let base = new Vector(1, 2, 3);
        expectFlags(expected, {
            same: base.equals(new Vector(1, 2, 3)),
            within_tolerance: base.equals(new Vector(1, 2, 3 + 1e-9)),
            outside_tolerance: base.equals(new Vector(1, 2, 3.001)),
        });
    },
};
