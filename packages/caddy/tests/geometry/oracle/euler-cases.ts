import type { FixtureCase } from "../../../../../reference/build123d/oracle.ts";
import type { EulerOrdering } from "../../../src/index.ts";
import type { OracleCases } from "./support.ts";

import {
    expectMatrixClose,
    expectNumbersClose,
    expectVectorClose,
    fixtureRecord,
} from "../../../../../reference/build123d/oracle.ts";
import {
    EXACT_TOLERANCE,
    ORIENTATION_TOLERANCE,
} from "../../../../../reference/build123d/tolerances.ts";
import { Extrinsic, Intrinsic, Location, Rotation } from "../../../src/index.ts";
import { EULER_ANGLES, eulerQuaternion, expectLocation, ORDERINGS, RAD2DEG } from "./support.ts";

/**
 * One case per Euler sequence: the quaternion, its matrix, the angles recovered from it, and the
 * `Location`/`Rotation` built from the same angles.
 */
export const eulerCases: OracleCases = {
    ...Object.fromEntries(
        Object.entries(ORDERINGS).map(([key, ordering]) => [
            `euler/${key}`,
            (expected: FixtureCase) => {
                let quaternion = eulerQuaternion(ordering, EULER_ANGLES);
                expectNumbersClose(
                    expected,
                    "quaternion",
                    [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
                    EXACT_TOLERANCE,
                );
                expectMatrixClose(
                    expected,
                    "matrix",
                    quaternion.toMatrix().toRows(),
                    EXACT_TOLERANCE,
                );
                expectVectorClose(
                    expected,
                    "angles_roundtrip",
                    quaternion.toEulerAngles(ordering).map(angle => angle * RAD2DEG),
                    ORIENTATION_TOLERANCE,
                );
                expectLocation(
                    expected,
                    "location",
                    Location.fromOrientation([1, 2, 3], EULER_ANGLES, ordering),
                );
                expectLocation(expected, "rotation", new Rotation(10, 20, 30, ordering));
            },
        ]),
    ),

    "euler/gimbal-lock": expected => {
        let poses: [string, EulerOrdering, [number, number, number]][] = [
            ["three-axis-pitch-up", Intrinsic.XYZ, [0, 90, 0]],
            ["three-axis-pitch-down", Intrinsic.XYZ, [0, -90, 0]],
            ["three-axis-extrinsic", Extrinsic.XYZ, [30, 90, 0]],
            ["two-axis-aligned", Intrinsic.ZXZ, [0, 0, 0]],
            ["two-axis-flat", Intrinsic.XYX, [40, 0, 0]],
        ];
        for (let [key, ordering, angles] of poses) {
            let record = fixtureRecord(expected, key);
            let quaternion = eulerQuaternion(ordering, angles);
            expectNumbersClose(
                record,
                "quaternion",
                [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
                EXACT_TOLERANCE,
            );
            expectVectorClose(
                record,
                "angles_roundtrip",
                quaternion.toEulerAngles(ordering).map(angle => angle * RAD2DEG),
                ORIENTATION_TOLERANCE,
            );
        }
    },
};
