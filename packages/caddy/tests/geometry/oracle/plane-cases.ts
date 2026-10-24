import type { OracleCases } from "./support.ts";

import { expectMatrixClose, expectVectorClose } from "../../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE } from "../../../../../reference/build123d/tolerances.ts";
import { Axis, BoundingBox, Location, Plane } from "../../../src/index.ts";
import { expectBounds, expectFlags, expectLocation, expectPlane } from "./support.ts";

/** `Plane` construction, frame derivation and coordinate conversion. */
export const planeCases: OracleCases = {
    "plane/default-x-direction": expected => {
        let normals: Record<string, [number, number, number]> = {
            z: [0, 0, 1],
            neg_z: [0, 0, -1],
            x: [1, 0, 0],
            y: [0, 1, 0],
            diagonal: [1, 1, 1],
            x_dominant: [3, 1, 2],
            y_dominant: [1, 3, 2],
            z_dominant: [1, 2, 3],
            xy_tie: [1, 1, 0],
            xz_tie: [1, 0, 1],
            yz_tie: [0, 1, 1],
            negative_mix: [-2, 1, -3],
        };
        for (let [key, normal] of Object.entries(normals)) {
            expectPlane(expected, key, new Plane({ origin: [0, 0, 0], zDir: normal }));
        }
    },

    "plane/construct": expected => {
        expectPlane(expected, "origin_only", new Plane({ origin: [1, 2, 3] }));
        expectPlane(
            expected,
            "oblique_x",
            new Plane({ origin: [1, 2, 3], xDir: [1, 1, 1], zDir: [0, 0, 1] }),
        );
        expectPlane(
            expected,
            "unnormalized",
            new Plane({ origin: [0, 0, 0], xDir: [5, 0, 0], zDir: [0, 0, 9] }),
        );
        expectPlane(
            expected,
            "y_dir_form",
            new Plane({ origin: [1, 0, 0], xDir: [1, 0, 0], yDir: [1, 1, 0] }),
        );
        expectPlane(
            expected,
            "y_dir_oblique",
            new Plane({ origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 1, 1] }),
        );
    },

    "plane/from-points": expected => {
        expectPlane(expected, "triangle", Plane.fromPoints([0, 0, 0], [2, 0, 0], [0, 3, 0]));
        expectPlane(expected, "tilted", Plane.fromPoints([1, 1, 1], [3, 1, 1], [1, 2, 4]));
    },

    "plane/from-axis": expected => {
        let axis = new Axis([1, 2, 3], [0, 1, 1]);
        expectPlane(expected, "without_x", Plane.fromAxis(axis));
        expectPlane(expected, "with_x", Plane.fromAxis(axis, [1, 0, 0]));
    },

    "plane/from-location": expected => {
        expectPlane(
            expected,
            "euler",
            Plane.fromLocation(Location.fromOrientation([1, 2, 3], [10, 20, 30])),
        );
        expectPlane(
            expected,
            "quarter_turn",
            Plane.fromLocation(Location.fromOrientation([0, 0, 0], [90, 0, 0])),
        );
        expectPlane(expected, "translation", Plane.fromLocation(Location.fromPosition([4, 5, 6])));
    },

    "plane/offset": expected => {
        expectPlane(expected, "xy", Plane.XY.offset(2.5));
        expectPlane(
            expected,
            "tilted",
            new Plane({ origin: [1, 1, 1], zDir: [1, 2, 2] }).offset(-3),
        );
    },

    "plane/reverse": expected => {
        let source = new Plane({ origin: [1, 2, 3], xDir: [1, 0, 0], zDir: [0, 0, 1] });
        expectPlane(expected, "reversed", source.reverse());
        expectPlane(expected, "negated", source.negate());
    },

    "plane/set-directions": expected => {
        let source = new Plane({ origin: [1, 2, 3], xDir: [1, 0, 0], zDir: [0, 0, 1] });
        expectPlane(expected, "with_origin", source.withOrigin([7, 8, 9]));
        expectPlane(expected, "with_x_dir", source.withXDir([1, 1, 0]));
        expectPlane(expected, "with_y_dir", source.withYDir([1, 1, 0]));
    },

    "plane/shift-origin": expected => {
        let tilted = new Plane({ origin: [0, 0, 2], zDir: [0, 0, 1] });
        expectPlane(expected, "by_point", tilted.shiftOrigin([3, 4, 2]));
        expectPlane(expected, "by_axis", tilted.shiftOrigin(new Axis([1, 1, 0], [0, 0, 1])));
        expectPlane(
            expected,
            "by_oblique_axis",
            tilted.shiftOrigin(new Axis([0, 0, 0], [1, 1, 1])),
        );
    },

    "plane/rotated-default": expected => {
        expectPlane(expected, "about_z", Plane.XY.rotated([0, 0, 45]));
        expectPlane(expected, "compound", Plane.XZ.rotated([15, 25, 35]));
    },

    "plane/moved": expected => {
        let source = new Plane({ origin: [1, 0, 0], xDir: [1, 0, 0], zDir: [0, 0, 1] });
        expectPlane(
            expected,
            "by_location",
            source.moved(Location.fromOrientation([0, 2, 0], [0, 0, 90])),
        );
        expectPlane(expected, "by_plane", source.moved(Plane.YZ));
    },

    "plane/transforms": expected => {
        let source = new Plane({ origin: [1, 2, 3], xDir: [1, 1, 0], zDir: [0, 0, 1] });
        expectMatrixClose(expected, "forward", source.forwardTransform.toRows(), LINEAR_TOLERANCE);
        expectMatrixClose(expected, "reverse", source.reverseTransform.toRows(), LINEAR_TOLERANCE);
    },

    "plane/local-coords": expected => {
        let source = new Plane({ origin: [1, 2, 3], xDir: [1, 1, 0], zDir: [0, 0, 1] });
        let box = new BoundingBox([0, 0, 0], [1, 2, 3]);
        expectVectorClose(
            expected,
            "to_local",
            source.toLocalCoords([4, 5, 6]).toTuple(),
            LINEAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "from_local",
            source.fromLocalCoords([4, 5, 6]).toTuple(),
            LINEAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "roundtrip",
            source.fromLocalCoords(source.toLocalCoords([4, 5, 6])).toTuple(),
            LINEAR_TOLERANCE,
        );
        expectBounds(expected, "box_to_local", source.toLocalCoords(box));
        expectBounds(expected, "box_from_local", source.fromLocalCoords(box));
    },

    "plane/location-between": expected => {
        let first = new Plane({ origin: [1, 0, 0], xDir: [1, 0, 0], zDir: [0, 0, 1] });
        let second = new Plane({ origin: [0, 4, 0], xDir: [0, 1, 0], zDir: [1, 0, 0] });
        expectLocation(expected, "forward", first.locationBetween(second));
        expectLocation(expected, "backward", second.locationBetween(first));
    },

    "plane/contains": expected => {
        let tilted = new Plane({ origin: [0, 0, 1], zDir: [0, 0, 1] });
        expectFlags(expected, {
            point_on: tilted.contains([5, -3, 1]),
            point_off: tilted.contains([5, -3, 1.5]),
            point_within_tolerance: tilted.contains([0, 0, 1 + 1e-9]),
            axis_in: tilted.contains(new Axis([0, 0, 1], [1, 1, 0])),
            axis_crossing: tilted.contains(new Axis([0, 0, 1], [0, 0, 1])),
            axis_parallel_off: tilted.contains(new Axis([0, 0, 2], [1, 0, 0])),
        });
    },

    "plane/multiply": expected => {
        let source = new Plane({ origin: [1, 2, 3], xDir: [0, 1, 0], zDir: [1, 0, 0] });
        expectLocation(
            expected,
            "by_location",
            source.multiply(Location.fromOrientation([1, 0, 0], [0, 0, 45])),
        );
        expectLocation(expected, "by_plane", source.multiply(Plane.YZ));
        expectLocation(expected, "plane_location", source.location);
    },

    "plane/move": expected => {
        let source = new Plane({ origin: [1, 0, 0], xDir: [1, 0, 0], zDir: [0, 0, 1] });
        let moved = source.move(Location.fromOrientation([0, 2, 0], [0, 0, 90]));
        expectPlane(expected, "by_location", moved);
        // build123d relocates the source plane itself; the immutable copy must match what the
        // mutated plane became, and the source must be left alone.
        expectPlane(expected, "mutated_in_place", moved);
        expectPlane(expected, "by_plane", source.move(Plane.YZ));
    },
};
