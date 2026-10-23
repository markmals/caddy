import type {
    FixtureCase,
    OracleImplementation,
} from "../../../../../reference/build123d/oracle.ts";
import type { BoundingBox, EulerOrdering, Location, Plane } from "../../../src/index.ts";

import {
    expectMatrixClose,
    expectVectorClose,
    fixtureBoolean,
    fixtureRecord,
} from "../../../../../reference/build123d/oracle.ts";
import {
    ANGULAR_TOLERANCE,
    LINEAR_TOLERANCE,
    ORIENTATION_TOLERANCE,
} from "../../../../../reference/build123d/tolerances.ts";
import { Extrinsic, Intrinsic, Quaternion } from "../../../src/index.ts";

/** One group of fixture-case implementations, keyed by case name. */
export type OracleCases = Record<string, OracleImplementation>;

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

/** The Euler angles every ordering case is generated from, in degrees. */
export const EULER_ANGLES: [number, number, number] = [10, 20, 30];

/** Fixture key to ordering; the Python side derives its keys the same way. */
export const ORDERINGS: Record<string, EulerOrdering> = Object.fromEntries(
    (
        [
            "XYZ",
            "XZY",
            "YZX",
            "YXZ",
            "ZXY",
            "ZYX",
            "XYX",
            "XZX",
            "YZY",
            "YXY",
            "ZXZ",
            "ZYZ",
        ] as const
    ).flatMap(name => [
        [`intrinsic-${name.toLowerCase()}`, Intrinsic[name]],
        [`extrinsic-${name.toLowerCase()}`, Extrinsic[name]],
    ]),
);

/** Compare against the `location()` serializer: position, orientation and the 3x4 transform. */
export function expectLocation(expected: FixtureCase, key: string, actual: Location): void {
    let record = fixtureRecord(expected, key);
    expectVectorClose(record, "position", actual.position.toTuple(), LINEAR_TOLERANCE);
    expectVectorClose(record, "orientation", actual.orientation.toTuple(), ORIENTATION_TOLERANCE);
    expectMatrixClose(record, "matrix", actual.transform.toRows(), LINEAR_TOLERANCE);
}

/** Compare against the `plane()` serializer: origin and all three directions. */
export function expectPlane(expected: FixtureCase, key: string, actual: Plane): void {
    let record = fixtureRecord(expected, key);
    expectVectorClose(record, "origin", actual.origin.toTuple(), LINEAR_TOLERANCE);
    expectVectorClose(record, "x_dir", actual.xDir.toTuple(), ANGULAR_TOLERANCE);
    expectVectorClose(record, "y_dir", actual.yDir.toTuple(), ANGULAR_TOLERANCE);
    expectVectorClose(record, "z_dir", actual.zDir.toTuple(), ANGULAR_TOLERANCE);
}

export function expectBounds(expected: FixtureCase, key: string, actual: BoundingBox): void {
    let record = fixtureRecord(expected, key);
    expectVectorClose(record, "min", actual.min.toTuple(), LINEAR_TOLERANCE);
    expectVectorClose(record, "max", actual.max.toTuple(), LINEAR_TOLERANCE);
    expectVectorClose(record, "size", actual.size.toTuple(), LINEAR_TOLERANCE);
}

/** Compare a batch of boolean predicates, naming the first one that disagrees. */
export function expectFlags(expected: FixtureCase, actual: Record<string, boolean>): void {
    for (let [key, value] of Object.entries(actual)) {
        if (fixtureBoolean(expected, key) !== value) {
            throw new Error(`${expected.name}.${key}: expected ${!value}, got ${value}`);
        }
    }
}

/** A quaternion from Euler angles given in degrees. */
export function eulerQuaternion(ordering: EulerOrdering, angles: readonly number[]): Quaternion {
    let [alpha = 0, beta = 0, gamma = 0] = angles;
    return Quaternion.fromEulerAngles(ordering, alpha * DEG2RAD, beta * DEG2RAD, gamma * DEG2RAD);
}
