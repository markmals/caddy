import type { OracleCases } from "./support.ts";

import { expectClose, expectVectorClose } from "../../../../../reference/build123d/oracle.ts";
import {
    ANGULAR_TOLERANCE,
    EXACT_TOLERANCE,
    LINEAR_TOLERANCE,
} from "../../../../../reference/build123d/tolerances.ts";
import { Axis, Location } from "../../../src/index.ts";
import { expectFlags, expectLocation } from "./support.ts";

/** `Axis` construction, placement and the angular predicates. */
export const axisCases: OracleCases = {
    "axis/statics": expected => {
        expectVectorClose(expected, "x_position", Axis.X.position.toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "x_direction", Axis.X.direction.toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "y_position", Axis.Y.position.toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "y_direction", Axis.Y.direction.toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "z_position", Axis.Z.position.toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "z_direction", Axis.Z.direction.toTuple(), EXACT_TOLERANCE);
    },

    "axis/construct": expected => {
        let unnormalized = new Axis([1, 2, 3], [0, 0, 5]);
        let fromPoints = Axis.fromPoints([1, 1, 1], [4, 5, 1]);
        expectVectorClose(
            expected,
            "unnormalized_position",
            unnormalized.position.toTuple(),
            EXACT_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "unnormalized_direction",
            unnormalized.direction.toTuple(),
            ANGULAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "from_points_position",
            fromPoints.position.toTuple(),
            EXACT_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "from_points_direction",
            fromPoints.direction.toTuple(),
            ANGULAR_TOLERANCE,
        );
    },

    "axis/location": expected => {
        expectLocation(expected, "tilted", new Axis([1, 2, 3], [1, 2, 2]).location);
        expectLocation(expected, "z", Axis.Z.location);
        expectLocation(expected, "x", Axis.X.location);
    },

    "axis/from-location": expected => {
        let derived = Axis.fromLocation(Location.fromOrientation([1, 2, 3], [25, -40, 15]));
        expectVectorClose(expected, "position", derived.position.toTuple(), LINEAR_TOLERANCE);
        expectVectorClose(expected, "direction", derived.direction.toTuple(), ANGULAR_TOLERANCE);
    },

    "axis/located": expected => {
        let moved = new Axis([1, 0, 0], [0, 1, 0]).located(
            Location.fromOrientation([5, 5, 5], [0, 0, 90]),
        );
        expectVectorClose(expected, "position", moved.position.toTuple(), LINEAR_TOLERANCE);
        expectVectorClose(expected, "direction", moved.direction.toTuple(), ANGULAR_TOLERANCE);
    },

    "axis/predicates": expected => {
        let base = new Axis([0, 0, 0], [1, 0, 0]);
        let shifted = new Axis([5, 0, 0], [1, 0, 0]);
        let parallelOffset = new Axis([0, 1, 0], [1, 0, 0]);
        let reversed = new Axis([0, 0, 0], [-1, 0, 0]);
        let skew = new Axis([0, 0, 1], [0, 1, 0]);
        let crossing = new Axis([0, 0, 0], [0, 1, 0]);
        expectFlags(expected, {
            coaxial_shifted: base.isCoaxial(shifted),
            coaxial_offset: base.isCoaxial(parallelOffset),
            coaxial_reversed: base.isCoaxial(reversed),
            normal_crossing: base.isNormal(crossing),
            normal_shifted: base.isNormal(shifted),
            opposite_reversed: base.isOpposite(reversed),
            opposite_shifted: base.isOpposite(shifted),
            parallel_offset: base.isParallel(parallelOffset),
            parallel_crossing: base.isParallel(crossing),
            skew_crossing: base.isSkew(crossing),
            skew_offset_perpendicular: base.isSkew(skew),
            skew_parallel_offset: base.isSkew(parallelOffset),
            skew_shifted: base.isSkew(shifted),
        });
    },

    "axis/angle-between": expected => {
        expectClose(expected, "right", Axis.X.angleBetween(Axis.Y), ANGULAR_TOLERANCE);
        expectClose(expected, "straight", Axis.X.angleBetween(Axis.X.negate()), ANGULAR_TOLERANCE);
        expectClose(
            expected,
            "oblique",
            Axis.X.angleBetween(new Axis([0, 0, 0], [1, 1, 0])),
            ANGULAR_TOLERANCE,
        );
        expectClose(expected, "zero", Axis.Z.angleBetween(Axis.Z), ANGULAR_TOLERANCE);
    },

    "axis/reverse": expected => {
        let source = new Axis([1, 2, 3], [0, 3, 4]);
        expectVectorClose(
            expected,
            "position",
            source.reverse().position.toTuple(),
            EXACT_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "direction",
            source.reverse().direction.toTuple(),
            ANGULAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "negate_direction",
            source.negate().direction.toTuple(),
            ANGULAR_TOLERANCE,
        );
    },
};
