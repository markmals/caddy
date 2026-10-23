import type { OracleCases } from "./support.ts";

import {
    expectClose,
    expectMatrixClose,
    expectNumbersClose,
    expectVectorClose,
    fixtureRecord,
} from "../../../../../reference/build123d/oracle.ts";
import {
    ANGULAR_TOLERANCE,
    EXACT_TOLERANCE,
    LINEAR_TOLERANCE,
    ORIENTATION_TOLERANCE,
} from "../../../../../reference/build123d/tolerances.ts";
import { Intrinsic, Plane, Quaternion, Transform, Vector } from "../../../src/index.ts";
import { DEG2RAD, eulerQuaternion, RAD2DEG } from "./support.ts";

/** The OCCT primitives the classes above are built on: `gp_Trsf`, `gp_Quaternion`, `gp_Ax3`. */
export const occtCases: OracleCases = {
    "transform/compose": expected => {
        let rotation = Transform.fromAxisRotation(
            new Vector(1, 0, 0),
            new Vector(0, 0, 1),
            35 * DEG2RAD,
        );
        let translation = Transform.fromTranslation(new Vector(2, 3, 4));
        let scale = Transform.fromScale(new Vector(1, 1, 1), 2.5);
        expectMatrixClose(expected, "rotation", rotation.toRows(), EXACT_TOLERANCE);
        expectMatrixClose(expected, "translation", translation.toRows(), EXACT_TOLERANCE);
        expectMatrixClose(expected, "scale", scale.toRows(), EXACT_TOLERANCE);
        expectMatrixClose(
            expected,
            "rotation_then_translation",
            rotation.multiply(translation).toRows(),
            EXACT_TOLERANCE,
        );
        expectMatrixClose(
            expected,
            "translation_then_rotation",
            translation.multiply(rotation).toRows(),
            EXACT_TOLERANCE,
        );
        expectMatrixClose(
            expected,
            "scale_then_rotation",
            scale.multiply(rotation).toRows(),
            EXACT_TOLERANCE,
        );
        expectMatrixClose(
            expected,
            "rotation_then_scale",
            rotation.multiply(scale).toRows(),
            EXACT_TOLERANCE,
        );
    },

    "transform/invert": expected => {
        let rotation = Transform.fromAxisRotation(
            new Vector(1, 0, 0),
            new Vector(0, 1, 1),
            35 * DEG2RAD,
        );
        let scale = Transform.fromScale(new Vector(1, 1, 1), 2.5);
        let compound = rotation.multiply(scale);
        expectMatrixClose(expected, "rotation", rotation.inverse().toRows(), EXACT_TOLERANCE);
        expectMatrixClose(expected, "scale", scale.inverse().toRows(), EXACT_TOLERANCE);
        expectMatrixClose(expected, "compound", compound.inverse().toRows(), EXACT_TOLERANCE);
        expectMatrixClose(
            expected,
            "roundtrip",
            compound.multiply(compound.inverse()).toRows(),
            LINEAR_TOLERANCE,
        );
    },

    "transform/mirror": expected => {
        let axisMirror = Transform.fromAxisMirror(new Vector(1, 2, 0), new Vector(0, 0, 1));
        let planeMirror = Transform.fromPlaneMirror(new Vector(0, 0, 3), new Vector(0, 0, 1));
        let oblique = Transform.fromPlaneMirror(new Vector(1, 1, 1), new Vector(1, 1, 1));
        expectMatrixClose(expected, "axis", axisMirror.toRows(), LINEAR_TOLERANCE);
        expectClose(expected, "axis_scale", axisMirror.scale, EXACT_TOLERANCE);
        expectMatrixClose(expected, "plane", planeMirror.toRows(), LINEAR_TOLERANCE);
        expectClose(expected, "plane_scale", planeMirror.scale, EXACT_TOLERANCE);
        expectMatrixClose(
            expected,
            "plane_inverted",
            planeMirror.inverse().toRows(),
            LINEAR_TOLERANCE,
        );
        expectMatrixClose(expected, "oblique", oblique.toRows(), LINEAR_TOLERANCE);
        expectMatrixClose(
            expected,
            "oblique_inverted",
            oblique.inverse().toRows(),
            LINEAR_TOLERANCE,
        );
        expectMatrixClose(
            expected,
            "oblique_squared",
            oblique.multiply(oblique).toRows(),
            LINEAR_TOLERANCE,
        );
    },

    "transform/power": expected => {
        let rotation = Transform.fromAxisRotation(
            new Vector(1, 0, 0),
            new Vector(0, 0, 1),
            30 * DEG2RAD,
        );
        let scaled = Transform.fromScale(new Vector(1, 0, 0), 2);
        let mixed = rotation.multiply(scaled);
        expectMatrixClose(
            expected,
            "rotation_squared",
            rotation.power(2).toRows(),
            LINEAR_TOLERANCE,
        );
        expectMatrixClose(expected, "rotation_cubed", rotation.power(3).toRows(), LINEAR_TOLERANCE);
        expectMatrixClose(expected, "rotation_five", rotation.power(5).toRows(), LINEAR_TOLERANCE);
        expectMatrixClose(expected, "rotation_zero", rotation.power(0).toRows(), LINEAR_TOLERANCE);
        expectMatrixClose(
            expected,
            "rotation_minus_two",
            rotation.power(-2).toRows(),
            LINEAR_TOLERANCE,
        );
        expectMatrixClose(expected, "mixed_squared", mixed.power(2).toRows(), LINEAR_TOLERANCE);
        expectMatrixClose(
            expected,
            "mixed_minus_three",
            mixed.power(-3).toRows(),
            LINEAR_TOLERANCE,
        );
    },

    "transform/coordinate-system": expected => {
        let target = new Plane({ origin: [1, 2, 3], xDir: [1, 1, 0], zDir: [0, 0, 1] });
        let source = new Plane({ origin: [-1, 0, 2], xDir: [1, 0, 0], zDir: [0, 1, 0] });
        expectMatrixClose(
            expected,
            "single",
            Transform.fromCoordinateSystem(target).toRows(),
            LINEAR_TOLERANCE,
        );
        expectMatrixClose(
            expected,
            "between",
            Transform.betweenCoordinateSystems(source, target).toRows(),
            LINEAR_TOLERANCE,
        );
        expectMatrixClose(
            expected,
            "inverted",
            Transform.fromCoordinateSystem(target).inverse().toRows(),
            LINEAR_TOLERANCE,
        );
    },

    "transform/apply": expected => {
        let rotation = Transform.fromAxisRotation(
            new Vector(1, 0, 0),
            new Vector(0, 1, 1),
            35 * DEG2RAD,
        );
        let scale = Transform.fromScale(new Vector(1, 1, 1), -2);
        let compound = rotation.multiply(scale);
        let sample = new Vector(3, -1, 2);
        expectVectorClose(expected, "point", compound.apply(sample).toTuple(), LINEAR_TOLERANCE);
        expectVectorClose(
            expected,
            "vector",
            compound.applyVector(sample).toTuple(),
            LINEAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "direction",
            compound.applyDirection(sample).toTuple(),
            ANGULAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "direction_positive_scale",
            rotation.applyDirection(sample).toTuple(),
            ANGULAR_TOLERANCE,
        );
        expectClose(expected, "scale_factor", compound.scale, EXACT_TOLERANCE);
    },
    "quaternion/from-matrix": expected => {
        let poses: Record<string, [number, number, number]> = {
            identity: [0, 0, 0],
            small: [10, 20, 30],
            x_dominant: [180, 0, 0],
            y_dominant: [0, 180, 0],
            z_dominant: [0, 0, 180],
            half_turn_diagonal: [180, 90, 0],
        };
        for (let [key, angles] of Object.entries(poses)) {
            let record = fixtureRecord(expected, key);
            let source = eulerQuaternion(Intrinsic.XYZ, angles);
            let matrix = source.toMatrix();
            let recovered = Quaternion.fromMatrix(matrix);
            expectMatrixClose(record, "matrix", matrix.toRows(), EXACT_TOLERANCE);
            expectNumbersClose(
                record,
                "quaternion",
                [recovered.x, recovered.y, recovered.z, recovered.w],
                ORIENTATION_TOLERANCE,
            );
        }
    },

    "quaternion/axis-angle": expected => {
        let quaternion = Quaternion.fromAxisAngle(new Vector(1, 2, 2), 75 * DEG2RAD);
        let { axis, angle } = quaternion.toAxisAngle();
        let identity = new Quaternion().toAxisAngle();
        expectNumbersClose(
            expected,
            "quaternion",
            [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
            EXACT_TOLERANCE,
        );
        expectVectorClose(expected, "axis", axis.toTuple(), ANGULAR_TOLERANCE);
        expectClose(expected, "angle", angle * RAD2DEG, ANGULAR_TOLERANCE);
        expectVectorClose(expected, "identity_axis", identity.axis.toTuple(), EXACT_TOLERANCE);
        expectClose(expected, "identity_angle", identity.angle * RAD2DEG, EXACT_TOLERANCE);
        expectMatrixClose(expected, "matrix", quaternion.toMatrix().toRows(), EXACT_TOLERANCE);
    },

    "ax3/from-normal": expected => {
        let normals: Record<string, [number, number, number]> = {
            z: [0, 0, 1],
            x: [1, 0, 0],
            y: [0, 1, 0],
            x_dominant: [3, 1, 2],
            y_dominant: [1, 3, 2],
            z_dominant: [1, 2, 3],
            negative: [-2, 1, -3],
            equal: [1, 1, 1],
        };
        for (let [key, normal] of Object.entries(normals)) {
            let record = fixtureRecord(expected, key);
            let frame = new Plane({ zDir: normal });
            expectVectorClose(record, "x_dir", frame.xDir.toTuple(), ANGULAR_TOLERANCE);
            expectVectorClose(record, "y_dir", frame.yDir.toTuple(), ANGULAR_TOLERANCE);
            expectVectorClose(record, "z_dir", frame.zDir.toTuple(), ANGULAR_TOLERANCE);
        }
    },
};
