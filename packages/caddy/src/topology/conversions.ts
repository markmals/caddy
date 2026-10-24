/** Conversions between Caddy geometry values and the native addon's plain-number formats. */

import type * as occt from "@roonieone/occt-native";

import { Location } from "../geometry/location.ts";
import { Matrix3 } from "../geometry/matrix3.ts";
import { Transform } from "../geometry/transform.ts";
import { Vector } from "../geometry/vector.ts";

export function toVec3(vector: Vector): occt.Vec3 {
    return [vector.x, vector.y, vector.z];
}

export function fromVec3(values: occt.Vec3): Vector {
    return new Vector(values[0], values[1], values[2]);
}

/** The 12-number row-major matrix the addon expects for `transform`. */
export function matrixOf(transform: Transform): occt.Matrix3x4 {
    return transform.toRows().flat();
}

/**
 * A location from a native 3x4 matrix. The uniform scale is the cube root of the determinant, as
 * `gp_Trsf::SetValues` recovers it, so the rotation part stays orthonormal.
 */
export function locationFromMatrix(values: occt.Matrix3x4): Location {
    let [a11 = 1, a12 = 0, a13 = 0, a14 = 0, a21 = 0, a22 = 1, a23 = 0, a24 = 0] = values;
    let [a31 = 0, a32 = 0, a33 = 1, a34 = 0] = values.slice(8);
    let scaledMatrix = new Matrix3(a11, a12, a13, a21, a22, a23, a31, a32, a33);
    let scale = Math.cbrt(scaledMatrix.determinant());
    return new Location(
        new Transform(scale, scaledMatrix.scaled(1 / scale), new Vector(a14, a24, a34)),
    );
}
