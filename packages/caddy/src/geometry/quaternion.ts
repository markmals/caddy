import type { EulerOrdering } from "./enums.ts";
import type { MatrixIndex } from "./matrix3.ts";

import { GeometryError } from "../errors.ts";
import { RESOLUTION } from "./constants.ts";
import { Extrinsic, Intrinsic } from "./enums.ts";
import { Matrix3 } from "./matrix3.ts";
import { Vector } from "./vector.ts";

/**
 * Decomposition of an Euler sequence into the axis permutation OCCT uses, after Ken Shoemake's
 * "Euler Angle Conversion" (Graphics Gems IV).
 */
interface EulerSequenceParameters {
    /** First rotation axis, one-based. */
    readonly i: MatrixIndex;
    /** Second rotation axis, one-based. */
    readonly j: MatrixIndex;
    /** Third rotation axis, one-based. */
    readonly k: MatrixIndex;
    /** The first two axes form an odd permutation (e.g. XZ). */
    readonly isOdd: boolean;
    /** The third rotation repeats the first axis (proper Euler angles). */
    readonly isTwoAxes: boolean;
    /** Rotations are about fixed world axes rather than the moving frame. */
    readonly isExtrinsic: boolean;
}

function parameters(
    firstAxis: MatrixIndex,
    isOdd: boolean,
    isTwoAxes: boolean,
    isExtrinsic: boolean,
): EulerSequenceParameters {
    let axes: readonly MatrixIndex[] = [1, 2, 3];
    let next = (offset: number): MatrixIndex => axes[(firstAxis + offset) % 3] ?? 1;
    return {
        i: firstAxis,
        j: next(isOdd ? 1 : 0),
        k: next(isOdd ? 0 : 1),
        isOdd,
        isTwoAxes,
        isExtrinsic,
    };
}

/**
 * OCCT's `translateEulerSequence` table.
 *
 * Intrinsic sequences reuse the extrinsic code path through the equivalence "an intrinsic
 * rotation equals the extrinsic rotation by the same angles applied in reverse order", which is
 * why the intrinsic rows name a different first axis than their label suggests.
 */
const EULER_SEQUENCES: Record<EulerOrdering, EulerSequenceParameters> = {
    [Extrinsic.XYZ]: parameters(1, false, false, true),
    [Extrinsic.XZY]: parameters(1, true, false, true),
    [Extrinsic.YZX]: parameters(2, false, false, true),
    [Extrinsic.YXZ]: parameters(2, true, false, true),
    [Extrinsic.ZXY]: parameters(3, false, false, true),
    [Extrinsic.ZYX]: parameters(3, true, false, true),
    [Intrinsic.XYZ]: parameters(3, true, false, false),
    [Intrinsic.XZY]: parameters(2, false, false, false),
    [Intrinsic.YZX]: parameters(1, true, false, false),
    [Intrinsic.YXZ]: parameters(3, false, false, false),
    [Intrinsic.ZXY]: parameters(2, true, false, false),
    [Intrinsic.ZYX]: parameters(1, false, false, false),
    [Extrinsic.XYX]: parameters(1, false, true, true),
    [Extrinsic.XZX]: parameters(1, true, true, true),
    [Extrinsic.YZY]: parameters(2, false, true, true),
    [Extrinsic.YXY]: parameters(2, true, true, true),
    [Extrinsic.ZXZ]: parameters(3, false, true, true),
    [Extrinsic.ZYZ]: parameters(3, true, true, true),
    [Intrinsic.XYX]: parameters(1, false, true, false),
    [Intrinsic.XZX]: parameters(1, true, true, false),
    [Intrinsic.YZY]: parameters(2, false, true, false),
    [Intrinsic.YXY]: parameters(2, true, true, false),
    [Intrinsic.ZXZ]: parameters(3, false, true, false),
    [Intrinsic.ZYZ]: parameters(3, true, true, false),
};

/** Below this, OCCT treats an Euler decomposition as gimbal-locked. */
const GIMBAL_LOCK_EPSILON = 16 * Number.EPSILON;

/** An immutable unit quaternion with OCCT's `gp_Quaternion` conversions. */
export class Quaternion {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;

    constructor(x = 0, y = 0, z = 0, w = 1) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
    }

    static readonly IDENTITY: Quaternion = new Quaternion(0, 0, 0, 1);

    /** Rotation of `angle` radians about `axis` (`gp_Quaternion::SetVectorAndAngle`). */
    static fromAxisAngle(axis: Vector, angle: number): Quaternion {
        let unit = axis.normalized();
        let half = 0.5 * angle;
        let sin = Math.sin(half);
        return new Quaternion(unit.x * sin, unit.y * sin, unit.z * sin, Math.cos(half));
    }

    /** Euler angles in radians, applied in the order given by `ordering`. */
    static fromEulerAngles(
        ordering: EulerOrdering,
        alpha: number,
        beta: number,
        gamma: number,
    ): Quaternion {
        let o = EULER_SEQUENCES[ordering];
        let a = o.isExtrinsic ? alpha : gamma;
        let b = o.isOdd ? -beta : beta;
        let c = o.isExtrinsic ? gamma : alpha;

        let ci = Math.cos(0.5 * a);
        let cj = Math.cos(0.5 * b);
        let ch = Math.cos(0.5 * c);
        let si = Math.sin(0.5 * a);
        let sj = Math.sin(0.5 * b);
        let sh = Math.sin(0.5 * c);
        let cc = ci * ch;
        let cs = ci * sh;
        let sc = si * ch;
        let ss = si * sh;

        // values[0] is w; values[1..3] are x, y, z.
        let values = [0, 0, 0, 0];
        if (o.isTwoAxes) {
            values[o.i] = cj * (cs + sc);
            values[o.j] = sj * (cc + ss);
            values[o.k] = sj * (cs - sc);
            values[0] = cj * (cc - ss);
        } else {
            values[o.i] = cj * sc - sj * cs;
            values[o.j] = cj * ss + sj * cc;
            values[o.k] = cj * cs - sj * sc;
            values[0] = cj * cc + sj * ss;
        }
        if (o.isOdd) {
            values[o.j] = -(values[o.j] ?? 0);
        }
        return new Quaternion(values[1] ?? 0, values[2] ?? 0, values[3] ?? 0, values[0] ?? 0);
    }

    /** Recover a rotation from a matrix (`gp_Quaternion::SetMatrix`). */
    static fromMatrix(matrix: Matrix3): Quaternion {
        let trace = matrix.trace();
        if (trace > 0) {
            // A positive trace means w is the largest component and the safest to divide by.
            let raw = new Quaternion(
                matrix.m32 - matrix.m23,
                matrix.m13 - matrix.m31,
                matrix.m21 - matrix.m12,
                trace + 1,
            );
            return raw.scaled(0.5 / Math.sqrt(raw.w));
        }
        if (matrix.m11 > matrix.m22 && matrix.m11 > matrix.m33) {
            let raw = new Quaternion(
                1 + matrix.m11 - matrix.m22 - matrix.m33,
                matrix.m12 + matrix.m21,
                matrix.m13 + matrix.m31,
                matrix.m32 - matrix.m23,
            );
            return raw.scaled(0.5 / Math.sqrt(raw.x));
        }
        if (matrix.m22 > matrix.m33) {
            let raw = new Quaternion(
                matrix.m12 + matrix.m21,
                1 + matrix.m22 - matrix.m11 - matrix.m33,
                matrix.m23 + matrix.m32,
                matrix.m13 - matrix.m31,
            );
            return raw.scaled(0.5 / Math.sqrt(raw.y));
        }
        let raw = new Quaternion(
            matrix.m13 + matrix.m31,
            matrix.m23 + matrix.m32,
            1 + matrix.m33 - matrix.m11 - matrix.m22,
            matrix.m21 - matrix.m12,
        );
        return raw.scaled(0.5 / Math.sqrt(raw.z));
    }

    squareNorm(): number {
        return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
    }

    norm(): number {
        return Math.sqrt(this.squareNorm());
    }

    scaled(factor: number): Quaternion {
        return new Quaternion(this.x * factor, this.y * factor, this.z * factor, this.w * factor);
    }

    normalized(): Quaternion {
        let magnitude = this.norm();
        if (magnitude < RESOLUTION) {
            throw new GeometryError("Cannot normalize a quaternion of zero norm");
        }
        return this.scaled(1 / magnitude);
    }

    /** Rotation matrix for this quaternion (`gp_Quaternion::GetMatrix`). */
    toMatrix(): Matrix3 {
        let s = 2 / this.squareNorm();
        let x2 = this.x * s;
        let y2 = this.y * s;
        let z2 = this.z * s;
        let xx = this.x * x2;
        let xy = this.x * y2;
        let xz = this.x * z2;
        let yy = this.y * y2;
        let yz = this.y * z2;
        let zz = this.z * z2;
        let wx = this.w * x2;
        let wy = this.w * y2;
        let wz = this.w * z2;
        return new Matrix3(
            1 - (yy + zz),
            xy - wz,
            xz + wy,
            xy + wz,
            1 - (xx + zz),
            yz - wx,
            xz - wy,
            yz + wx,
            1 - (xx + yy),
        );
    }

    /** Euler angles in radians for `ordering` (`gp_Quaternion::GetEulerAngles`). */
    toEulerAngles(ordering: EulerOrdering): [number, number, number] {
        let m = this.toMatrix();
        let o = EULER_SEQUENCES[ordering];
        let alpha: number;
        let beta: number;
        let gamma: number;

        if (o.isTwoAxes) {
            let sy = Math.sqrt(m.value(o.i, o.j) ** 2 + m.value(o.i, o.k) ** 2);
            if (sy > GIMBAL_LOCK_EPSILON) {
                alpha = Math.atan2(m.value(o.i, o.j), m.value(o.i, o.k));
                gamma = Math.atan2(m.value(o.j, o.i), -m.value(o.k, o.i));
            } else {
                alpha = Math.atan2(-m.value(o.j, o.k), m.value(o.j, o.j));
                gamma = 0;
            }
            beta = Math.atan2(sy, m.value(o.i, o.i));
        } else {
            let cy = Math.sqrt(m.value(o.i, o.i) ** 2 + m.value(o.j, o.i) ** 2);
            if (cy > GIMBAL_LOCK_EPSILON) {
                alpha = Math.atan2(m.value(o.k, o.j), m.value(o.k, o.k));
                gamma = Math.atan2(m.value(o.j, o.i), m.value(o.i, o.i));
            } else {
                alpha = Math.atan2(-m.value(o.j, o.k), m.value(o.j, o.j));
                gamma = 0;
            }
            beta = Math.atan2(-m.value(o.k, o.i), cy);
        }

        if (o.isOdd) {
            alpha = -alpha;
            beta = -beta;
            gamma = -gamma;
        }
        return o.isExtrinsic ? [alpha, beta, gamma] : [gamma, beta, alpha];
    }

    /** Rotation axis and angle in radians (`gp_Quaternion::GetVectorAndAngle`). */
    toAxisAngle(): { axis: Vector; angle: number } {
        let magnitude = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
        if (magnitude <= RESOLUTION) {
            return { axis: new Vector(0, 0, 1), angle: 0 };
        }
        let axis = new Vector(this.x, this.y, this.z).divide(magnitude);
        let angle =
            this.w < 0 ? 2 * Math.atan2(-magnitude, -this.w) : 2 * Math.atan2(magnitude, this.w);
        return { axis, angle };
    }

    equals(other: Quaternion, tolerance: number): boolean {
        return (
            Math.abs(this.x - other.x) <= tolerance &&
            Math.abs(this.y - other.y) <= tolerance &&
            Math.abs(this.z - other.z) <= tolerance &&
            Math.abs(this.w - other.w) <= tolerance
        );
    }

    toString(): string {
        return `Quaternion(x=${this.x}, y=${this.y}, z=${this.z}, w=${this.w})`;
    }
}
