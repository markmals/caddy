import type { OracleCases } from "./support.ts";

import { Axis, Location, Plane, Vector } from "../../../src/index.ts";
import { expectIntersection } from "./support.ts";

/** `intersect` across every pairing of point, axis, plane and location. */
export const intersectCases: OracleCases = {
    "intersect/vector": expected => {
        let point = new Vector(3, 0, 0);
        expectIntersection(expected, "same_point", point.intersect([3, 0, 0]));
        expectIntersection(expected, "other_point", point.intersect([3, 1, 0]));
        expectIntersection(expected, "on_axis", point.intersect(Axis.X));
        expectIntersection(expected, "off_axis", point.intersect(Axis.Y));
        expectIntersection(expected, "on_plane", point.intersect(Plane.XY));
        expectIntersection(expected, "off_plane", point.intersect(Plane.XY.offset(1)));
        expectIntersection(
            expected,
            "on_location",
            point.intersect(Location.fromOrientation([3, 0, 0], [0, 0, 45])),
        );
        expectIntersection(
            expected,
            "off_location",
            point.intersect(Location.fromPosition([3, 0, 1])),
        );
    },

    "intersect/axis-axis": expected => {
        expectIntersection(expected, "coaxial", Axis.X.intersect(Axis.X));
        expectIntersection(
            expected,
            "coaxial_shifted",
            Axis.X.intersect(new Axis([5, 0, 0], [1, 0, 0])),
        );
        expectIntersection(
            expected,
            "antiparallel_coincident",
            Axis.X.intersect(new Axis([5, 0, 0], [-1, 0, 0])),
        );
        expectIntersection(
            expected,
            "antiparallel_oblique",
            new Axis([0, 0, 0], [1, 1, 0]).intersect(new Axis([4, 4, 0], [-1, -1, 0])),
        );
        expectIntersection(
            expected,
            "parallel_distinct",
            Axis.X.intersect(new Axis([0, 1, 0], [1, 0, 0])),
        );
        expectIntersection(expected, "crossing", Axis.X.intersect(new Axis([2, 0, 0], [0, 1, 0])));
        expectIntersection(
            expected,
            "crossing_oblique",
            new Axis([0, 0, 0], [1, 1, 0]).intersect(new Axis([2, 0, 0], [-1, 1, 0])),
        );
        expectIntersection(
            expected,
            "crossing_in_space",
            new Axis([0, 0, 1], [1, 0, 1]).intersect(new Axis([2, 0, 3], [0, 1, 0])),
        );
        expectIntersection(expected, "skew", Axis.X.intersect(new Axis([0, 0, 1], [0, 1, 0])));
    },

    "intersect/axis-other": expected => {
        expectIntersection(expected, "point_on", Axis.X.intersect([3, 0, 0]));
        expectIntersection(expected, "point_off", Axis.X.intersect([3, 1, 0]));
        expectIntersection(
            expected,
            "location_aligned",
            Axis.Z.intersect(Location.fromPosition([0, 0, 5])),
        );
        expectIntersection(
            expected,
            "location_turned",
            Axis.Z.intersect(Location.fromOrientation([0, 0, 5], [0, 90, 0])),
        );
        expectIntersection(
            expected,
            "location_spun",
            Axis.Z.intersect(Location.fromOrientation([0, 0, 5], [0, 0, 30])),
        );
        expectIntersection(
            expected,
            "location_off",
            Axis.Z.intersect(Location.fromPosition([1, 0, 5])),
        );
        expectIntersection(expected, "plane_crossing", Axis.Z.intersect(Plane.XY));
        expectIntersection(expected, "plane_contained", Axis.X.intersect(Plane.XY));
        expectIntersection(expected, "plane_parallel", Axis.X.intersect(Plane.XY.offset(2)));
    },

    "intersect/plane-plane": expected => {
        let tilted = new Plane({ origin: [1, 2, 3], xDir: [1, 1, 0], zDir: [0, 0, 1] });
        expectIntersection(expected, "same", Plane.XY.intersect(Plane.XY));
        expectIntersection(
            expected,
            "same_shifted_origin",
            Plane.XY.intersect(new Plane({ origin: [3, 4, 0], zDir: [0, 0, 1] })),
        );
        expectIntersection(expected, "reversed", Plane.XY.intersect(Plane.XY.reverse()));
        expectIntersection(expected, "parallel", Plane.XY.intersect(Plane.XY.offset(5)));
        expectIntersection(expected, "perpendicular", Plane.XY.intersect(Plane.YZ));
        expectIntersection(
            expected,
            "offset_perpendicular",
            new Plane({ origin: [1, 2, 3], zDir: [0, 0, 1] }).intersect(
                new Plane({ origin: [0, 0, 0], xDir: [1, 0, 0], zDir: [0, 1, 0] }),
            ),
        );
        expectIntersection(
            expected,
            "oblique",
            tilted.intersect(new Plane({ origin: [-1, 0, 2], xDir: [0, 1, 1], zDir: [1, 2, 3] })),
        );
        expectIntersection(
            expected,
            "shallow",
            Plane.XY.intersect(new Plane({ origin: [0, 0, 1], zDir: [1e-5, 0, 1] })),
        );
        expectIntersection(
            expected,
            "nearly_parallel",
            Plane.XY.intersect(new Plane({ origin: [0, 0, 1], zDir: [1e-7, 0, 1] })),
        );
    },

    "intersect/plane-other": expected => {
        expectIntersection(
            expected,
            "axis_contained",
            Plane.XY.intersect(new Axis([0, 0, 0], [1, 1, 0])),
        );
        expectIntersection(
            expected,
            "axis_crossing",
            Plane.XY.intersect(new Axis([1, 2, 3], [0, 0, 1])),
        );
        expectIntersection(
            expected,
            "axis_oblique",
            Plane.XY.intersect(new Axis([1, 2, 3], [1, 1, -1])),
        );
        expectIntersection(
            expected,
            "axis_parallel_off",
            Plane.XY.intersect(new Axis([0, 0, 1], [1, 0, 0])),
        );
        expectIntersection(expected, "point_on", Plane.XY.intersect([1, 2, 0]));
        expectIntersection(expected, "point_within_tolerance", Plane.XY.intersect([1, 2, 1e-7]));
        expectIntersection(expected, "point_off", Plane.XY.intersect([1, 2, 1e-5]));
        expectIntersection(
            expected,
            "location_on",
            Plane.XY.intersect(Location.fromPosition([1, 2, 0])),
        );
        expectIntersection(
            expected,
            "location_turned",
            Plane.XY.intersect(Location.fromOrientation([1, 2, 0], [0, 90, 0])),
        );
        expectIntersection(
            expected,
            "location_spun",
            Plane.XY.intersect(Location.fromOrientation([1, 2, 0], [0, 0, 30])),
        );
        expectIntersection(
            expected,
            "location_off",
            Plane.XY.intersect(Location.fromPosition([1, 2, 3])),
        );
    },

    "intersect/location": expected => {
        let source = Location.fromOrientation([1, 2, 3], [0, 0, 45]);
        expectIntersection(
            expected,
            "same",
            source.intersect(Location.fromOrientation([1, 2, 3], [0, 0, 45])),
        );
        expectIntersection(
            expected,
            "same_position",
            source.intersect(Location.fromOrientation([1, 2, 3], [0, 0, 90])),
        );
        expectIntersection(
            expected,
            "different",
            source.intersect(Location.fromOrientation([1, 2, 4], [0, 0, 45])),
        );
        expectIntersection(expected, "point_on", source.intersect([1, 2, 3]));
        expectIntersection(expected, "point_off", source.intersect([1, 2, 3.5]));
        expectIntersection(
            expected,
            "axis_through",
            Location.fromPosition([0, 0, 5]).intersect(Axis.Z),
        );
        expectIntersection(expected, "axis_off", source.intersect(Axis.Z));
        expectIntersection(
            expected,
            "plane_on",
            Location.fromPosition([1, 2, 0]).intersect(Plane.XY),
        );
        expectIntersection(expected, "plane_off", source.intersect(Plane.XY));
    },
};
