import type { OracleCases } from "./support.ts";

import { expectVectorClose } from "../../../../../reference/build123d/oracle.ts";
import {
    ANGULAR_TOLERANCE,
    LINEAR_TOLERANCE,
    ORIENTATION_TOLERANCE,
} from "../../../../../reference/build123d/tolerances.ts";
import { Axis, Location, Plane, Pos, Rotation, Vector } from "../../../src/index.ts";
import { expectFlags, expectLocation, expectPlane } from "./support.ts";

/** `Location`, `Pos` and `Rotation` composition, inversion and mirroring. */
export const locationCases: OracleCases = {
    "location/identity": expected => {
        expectLocation(expected, "identity", new Location());
    },

    "location/position": expected => {
        expectLocation(expected, "translation", Location.fromPosition([1, 2, 3]));
        expectLocation(expected, "with_angle", Location.fromPosition([1, 2, 3], 45));
        expectLocation(expected, "zero_angle", Location.fromPosition([1, 2, 3], 0));
    },

    "location/axis-angle": expected => {
        expectLocation(expected, "about_x", Location.fromAxisAngle([1, 2, 3], [1, 0, 0], 90));
        expectLocation(
            expected,
            "about_diagonal",
            Location.fromAxisAngle([0, 0, 0], [1, 1, 1], 120),
        );
        expectLocation(
            expected,
            "unnormalized_direction",
            Location.fromAxisAngle([0, 0, 0], [0, 0, 4], 30),
        );
    },

    "location/from-plane": expected => {
        expectLocation(expected, "xy", Location.fromPlane(Plane.XY));
        expectLocation(expected, "xz", Location.fromPlane(Plane.XZ));
        expectLocation(expected, "yz", Location.fromPlane(Plane.YZ));
        expectLocation(expected, "isometric", Location.fromPlane(Plane.isometric));
        expectLocation(
            expected,
            "offset",
            Location.fromPlane(new Plane({ origin: [1, 2, 3], zDir: [1, 1, 1] })),
        );
    },

    "location/accessors": expected => {
        let source = Location.fromOrientation([1, 2, 3], [25, -40, 15]);
        expectVectorClose(expected, "position", source.position.toTuple(), LINEAR_TOLERANCE);
        expectVectorClose(
            expected,
            "orientation",
            source.orientation.toTuple(),
            ORIENTATION_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "x_axis_position",
            source.xAxis.position.toTuple(),
            LINEAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "x_axis_direction",
            source.xAxis.direction.toTuple(),
            ANGULAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "y_axis_direction",
            source.yAxis.direction.toTuple(),
            ANGULAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "z_axis_direction",
            source.zAxis.direction.toTuple(),
            ANGULAR_TOLERANCE,
        );
        expectVectorClose(expected, "center", source.center().toTuple(), LINEAR_TOLERANCE);
    },

    "location/setters": expected => {
        let source = Location.fromOrientation([1, 2, 3], [25, -40, 15]);
        expectLocation(expected, "with_position", source.withPosition([7, 8, 9]));
        expectLocation(expected, "with_orientation", source.withOrientation([0, 0, 90]));
    },

    "location/inverse": expected => {
        let source = Location.fromOrientation([1, 2, 3], [25, -40, 15]);
        expectLocation(expected, "inverse", source.inverse());
        expectLocation(expected, "roundtrip", source.multiply(source.inverse()));
        expectLocation(expected, "identity_inverse", new Location().inverse());
    },

    "location/multiply": expected => {
        let first = Location.fromOrientation([1, 2, 3], [0, 0, 90]);
        let second = Location.fromOrientation([4, 0, 0], [90, 0, 0]);
        expectLocation(expected, "forward", first.multiply(second));
        expectLocation(expected, "backward", second.multiply(first));
        expectLocation(expected, "with_identity", first.multiply(new Location()));
        expectLocation(
            expected,
            "pos_times_rotation",
            new Pos(1, 2, 3).multiply(new Rotation(0, 0, 90)),
        );
        expectPlane(expected, "times_plane", first.multiply(Plane.YZ));
    },

    "location/power": expected => {
        let source = Location.fromOrientation([1, 0, 0], [0, 0, 30]);
        expectLocation(expected, "zero", source.power(0));
        expectLocation(expected, "one", source.power(1));
        expectLocation(expected, "two", source.power(2));
        expectLocation(expected, "three", source.power(3));
        expectLocation(expected, "five", source.power(5));
        expectLocation(expected, "minus_one", source.power(-1));
        expectLocation(expected, "minus_two", source.power(-2));
    },

    "location/negate": expected => {
        expectLocation(
            expected,
            "euler",
            Location.fromOrientation([1, 2, 3], [25, -40, 15]).negate(),
        );
        expectLocation(expected, "identity", new Location().negate());
    },

    "location/mirror": expected => {
        let source = Location.fromOrientation([1, 2, 3], [25, -40, 15]);
        expectLocation(expected, "across_xy", source.mirror(Plane.XY));
        expectLocation(expected, "across_yz", source.mirror(Plane.YZ));
        expectLocation(expected, "across_offset", source.mirror(Plane.XY.offset(5)));
        expectLocation(
            expected,
            "across_tilted",
            source.mirror(new Plane({ origin: [0, 0, 0], zDir: [1, 1, 0] })),
        );
    },

    "location/equality": expected => {
        let base = Location.fromOrientation([1, 2, 3], [0, 0, 90]);
        expectFlags(expected, {
            same: base.equals(Location.fromOrientation([1, 2, 3], [0, 0, 90])),
            different_position: base.equals(Location.fromOrientation([1, 2, 3.5], [0, 0, 90])),
            different_orientation: base.equals(Location.fromOrientation([1, 2, 3], [0, 0, 91])),
            equivalent_turn: base.equals(Location.fromOrientation([1, 2, 3], [0, 0, -270])),
        });
    },

    "location/pos-and-rotation": expected => {
        expectLocation(expected, "pos_xyz", new Pos(1, 2, 3));
        expectLocation(expected, "pos_vector", new Pos(new Vector(4, 5, 6)));
        expectLocation(expected, "pos_default", new Pos());
        expectLocation(expected, "rotation_default", new Rotation());
        expectLocation(expected, "rotation_angles", new Rotation([10, 20, 30]));
        expectLocation(
            expected,
            "rotation_about_axis",
            new Rotation(new Axis([1, 0, 0], [0, 0, 1]), 90),
        );
        expectLocation(
            expected,
            "rotation_about_axis_zero",
            new Rotation(new Axis([1, 0, 0], [0, 0, 1]), 0),
        );
    },
};
