import type { FixtureCase } from "../../../../../reference/build123d/oracle.ts";
import type { OrientedBounds } from "../../../src/index.ts";
import type { OracleCases } from "./support.ts";

import {
    expectClose,
    expectNumbersClose,
    expectVectorClose,
    fixtureRecord,
} from "../../../../../reference/build123d/oracle.ts";
import {
    ANGULAR_TOLERANCE,
    LINEAR_TOLERANCE,
} from "../../../../../reference/build123d/tolerances.ts";
import { OrientedBoundBox, Vector } from "../../../src/index.ts";
import { expectFlags, expectLocation, expectPlane } from "./support.ts";

const AXIS_ALIGNED = {
    xDirection: [1, 0, 0],
    yDirection: [0, 1, 0],
    zDirection: [0, 0, 1],
} as const;

/** Compare against the `oriented_bounds()` serializer. */
function expectOrientedBox(expected: FixtureCase, key: string, actual: OrientedBoundBox): void {
    let record = fixtureRecord(expected, key);
    expectVectorClose(record, "center", actual.center().toTuple(), LINEAR_TOLERANCE);
    expectVectorClose(record, "size", actual.size.toTuple(), LINEAR_TOLERANCE);
    expectVectorClose(record, "x_direction", actual.xDirection.toTuple(), ANGULAR_TOLERANCE);
    expectVectorClose(record, "y_direction", actual.yDirection.toTuple(), ANGULAR_TOLERANCE);
    expectVectorClose(record, "z_direction", actual.zDirection.toTuple(), ANGULAR_TOLERANCE);
    expectClose(record, "diagonal", actual.diagonal, LINEAR_TOLERANCE);
    expectPlane(record, "plane", actual.plane);
    expectLocation(record, "location", actual.location);
    expectNumbersClose(
        record,
        "corners",
        actual.corners.flatMap(corner => corner.toTuple()),
        LINEAR_TOLERANCE,
    );
}

function box(bounds: OrientedBounds): OrientedBoundBox {
    return new OrientedBoundBox(bounds);
}

/** `OrientedBoundBox` built straight from `Bnd_OBB` data, without the kernel. */
export const obbCases: OracleCases = {
    "obb/solid": expected => {
        expectOrientedBox(
            expected,
            "turned",
            box({
                center: [1, 2, 3],
                xDirection: new Vector(1, 1, 0).normalized(),
                yDirection: new Vector(-1, 1, 0).normalized(),
                zDirection: [0, 0, 1],
                halfSizes: [2, 1, 0.5],
            }),
        );
        expectOrientedBox(
            expected,
            "axis_aligned",
            box({ center: [0, 0, 0], ...AXIS_ALIGNED, halfSizes: [1, 2, 3] }),
        );
    },

    "obb/degenerate": expected => {
        expectOrientedBox(
            expected,
            "flat_z",
            box({ center: [0, 0, 1], ...AXIS_ALIGNED, halfSizes: [2, 1, 0] }),
        );
        expectOrientedBox(
            expected,
            "flat_x",
            box({ center: [0, 0, 0], ...AXIS_ALIGNED, halfSizes: [0, 1, 2] }),
        );
        expectOrientedBox(
            expected,
            "flat_y",
            box({ center: [0, 0, 0], ...AXIS_ALIGNED, halfSizes: [1, 0, 2] }),
        );
        expectOrientedBox(
            expected,
            "line_x",
            box({ center: [0, 0, 0], ...AXIS_ALIGNED, halfSizes: [3, 0, 0] }),
        );
        expectOrientedBox(
            expected,
            "line_z",
            box({ center: [1, 1, 0], ...AXIS_ALIGNED, halfSizes: [0, 0, 2] }),
        );
    },

    "obb/predicates": expected => {
        let outer = box({ center: [0, 0, 0], ...AXIS_ALIGNED, halfSizes: [5, 5, 5] });
        let inner = box({
            center: [1, 0, 0],
            xDirection: new Vector(1, 1, 0).normalized(),
            yDirection: new Vector(-1, 1, 0).normalized(),
            zDirection: [0, 0, 1],
            halfSizes: [1, 1, 1],
        });
        let straddling = box({ center: [4, 0, 0], ...AXIS_ALIGNED, halfSizes: [2, 1, 1] });
        expectFlags(expected, {
            inner_inside: outer.isCompletelyInside(inner),
            outer_inside_inner: inner.isCompletelyInside(outer),
            straddling_inside: outer.isCompletelyInside(straddling),
            self_inside: outer.isCompletelyInside(outer),
            center_outside: outer.isOutside([0, 0, 0]),
            corner_outside: outer.isOutside([5, 5, 5]),
            beyond_outside: outer.isOutside([5, 5, 5.001]),
            rotated_outside: inner.isOutside([2.4, 0, 0]),
            rotated_inside_corner: inner.isOutside([2.41, 0, 0]),
        });
    },
};
