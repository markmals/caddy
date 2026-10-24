import type { OracleCases } from "./support.ts";

import {
    expectClose,
    expectMatrixClose,
    expectNumbersClose,
    expectVectorClose,
} from "../../../../../reference/build123d/oracle.ts";
import { EXACT_TOLERANCE } from "../../../../../reference/build123d/tolerances.ts";
import { Axis, DEG2RAD, Matrix, Transform, Vector } from "../../../src/index.ts";

const RAMP = new Matrix([
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [9, 10, 11, 12],
]);

/** The general affine `Matrix`: construction, access, products and inversion. */
export const matrixCases: OracleCases = {
    "matrix/basics": expected => {
        let rigid = Matrix.fromTransform(
            Transform.fromAxisRotation(new Vector(1, 0, 0), new Vector(0, 0, 1), 35 * DEG2RAD),
        );
        expectMatrixClose(expected, "rows", RAMP.toRows(), EXACT_TOLERANCE);
        expectMatrixClose(expected, "identity", Matrix.IDENTITY.toRows(), EXACT_TOLERANCE);
        expectMatrixClose(
            expected,
            "four_rows",
            new Matrix([
                [1, 2, 3, 4],
                [5, 6, 7, 8],
                [9, 10, 11, 12],
                [0, 0, 0, 1],
            ]).toRows(),
            EXACT_TOLERANCE,
        );
        expectMatrixClose(expected, "from_transform", rigid.toRows(), EXACT_TOLERANCE);
        expectClose(expected, "first", RAMP.value(1, 1), EXACT_TOLERANCE);
        expectClose(expected, "translation_z", RAMP.value(3, 4), EXACT_TOLERANCE);
        expectClose(expected, "implied_corner", RAMP.value(4, 4), EXACT_TOLERANCE);
        expectClose(expected, "implied_zero", RAMP.value(4, 2), EXACT_TOLERANCE);
        expectNumbersClose(expected, "transposed", RAMP.toTransposedArray(), EXACT_TOLERANCE);
    },

    "matrix/multiply": expected => {
        let scale = new Matrix([
            [2, 0, 0, 1],
            [0, 3, 0, 2],
            [0, 0, 4, 3],
        ]);
        let shear = new Matrix([
            [1, 0.5, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
        ]);
        let quarterTurn = Matrix.fromTransform(
            Transform.fromAxisRotation(new Vector(), new Vector(0, 0, 1), 90 * DEG2RAD),
        );
        expectMatrixClose(
            expected,
            "scale_then_shear",
            shear.multiply(scale).toRows(),
            EXACT_TOLERANCE,
        );
        expectMatrixClose(
            expected,
            "shear_then_scale",
            scale.multiply(shear).toRows(),
            EXACT_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "point",
            quarterTurn.apply(new Vector(1, 2, 3)).toTuple(),
            EXACT_TOLERANCE,
        );
    },

    "matrix/inverse": expected => {
        let general = new Matrix([
            [2, 0.5, 0, 1],
            [0, 3, 0, 2],
            [0, 0, 4, 3],
        ]);
        let rigid = Matrix.fromTransform(
            Transform.fromAxisRotation(new Vector(1, 2, 0), new Vector(0, 1, 0), 40 * DEG2RAD),
        );
        expectMatrixClose(expected, "general", general.inverse().toRows(), EXACT_TOLERANCE);
        expectMatrixClose(
            expected,
            "roundtrip",
            general.multiply(general.inverse()).toRows(),
            EXACT_TOLERANCE,
        );
        expectMatrixClose(expected, "rigid", rigid.inverse().toRows(), EXACT_TOLERANCE);
    },

    "matrix/rotate": expected => {
        let translation = new Matrix([
            [1, 0, 0, 1],
            [0, 1, 0, 2],
            [0, 0, 1, 3],
        ]);
        let scaled = new Matrix([
            [2, 0, 0, 0],
            [0, 2, 0, 0],
            [0, 0, 2, 0],
        ]);
        expectMatrixClose(
            expected,
            "about_z",
            translation.rotated(Axis.Z, 45).toRows(),
            EXACT_TOLERANCE,
        );
        expectMatrixClose(
            expected,
            "about_offset_x",
            scaled.rotated(new Axis([0, 1, 0], [1, 0, 0]), 90).toRows(),
            EXACT_TOLERANCE,
        );
    },
};
