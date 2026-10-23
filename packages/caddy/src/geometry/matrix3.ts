import { Vector } from "./vector.ts";

/** One-based row/column index, matching OCCT's `gp_Mat` accessors. */
export type MatrixIndex = 1 | 2 | 3;

/**
 * An immutable 3x3 matrix with OCCT's `gp_Mat` arithmetic, including its exact operand ordering
 * so that results agree with Open CASCADE to the last bit where the inputs do.
 *
 * Fields are named `m<row><column>` with one-based indices, as in OCCT.
 */
export class Matrix3 {
    readonly m11: number;
    readonly m12: number;
    readonly m13: number;
    readonly m21: number;
    readonly m22: number;
    readonly m23: number;
    readonly m31: number;
    readonly m32: number;
    readonly m33: number;

    constructor(
        m11: number,
        m12: number,
        m13: number,
        m21: number,
        m22: number,
        m23: number,
        m31: number,
        m32: number,
        m33: number,
    ) {
        this.m11 = m11;
        this.m12 = m12;
        this.m13 = m13;
        this.m21 = m21;
        this.m22 = m22;
        this.m23 = m23;
        this.m31 = m31;
        this.m32 = m32;
        this.m33 = m33;
    }

    static readonly IDENTITY: Matrix3 = new Matrix3(1, 0, 0, 0, 1, 0, 0, 0, 1);

    /** Build from row vectors (`gp_Mat::SetRows`). */
    static fromRows(row1: Vector, row2: Vector, row3: Vector): Matrix3 {
        return new Matrix3(row1.x, row1.y, row1.z, row2.x, row2.y, row2.z, row3.x, row3.y, row3.z);
    }

    /** Build from column vectors (`gp_Mat(col1, col2, col3)`). */
    static fromColumns(column1: Vector, column2: Vector, column3: Vector): Matrix3 {
        return new Matrix3(
            column1.x,
            column2.x,
            column3.x,
            column1.y,
            column2.y,
            column3.y,
            column1.z,
            column2.z,
            column3.z,
        );
    }

    /** Outer product `ref ⊗ ref` (`gp_Mat::SetDot`). */
    static outerProduct(ref: Vector): Matrix3 {
        let { x, y, z } = ref;
        return new Matrix3(x * x, x * y, x * z, x * y, y * y, y * z, x * z, y * z, z * z);
    }

    /** Rotation of `angle` radians about `axis`, via OCCT's Rodrigues expansion. */
    static rotation(axis: Vector, angle: number): Matrix3 {
        let { x: a, y: b, z: c } = axis.normalized();
        let cos = Math.cos(angle);
        let sin = Math.sin(angle);
        let oneMinusCos = 1 - cos;
        return new Matrix3(
            1 + oneMinusCos * -(b * b + c * c),
            oneMinusCos * (a * b) - sin * c,
            oneMinusCos * (a * c) + sin * b,
            oneMinusCos * (a * b) + sin * c,
            1 + oneMinusCos * -(a * a + c * c),
            oneMinusCos * (b * c) - sin * a,
            oneMinusCos * (a * c) - sin * b,
            oneMinusCos * (b * c) + sin * a,
            1 + oneMinusCos * -(a * a + b * b),
        );
    }

    /** One-based element access (`gp_Mat::Value`). */
    value(row: MatrixIndex, column: MatrixIndex): number {
        return this[`m${row}${column}`];
    }

    /** `this * other`, in OCCT's `gp_Mat::Multiply` operand order. */
    multiply(other: Matrix3): Matrix3 {
        return new Matrix3(
            this.m11 * other.m11 + this.m12 * other.m21 + this.m13 * other.m31,
            this.m11 * other.m12 + this.m12 * other.m22 + this.m13 * other.m32,
            this.m11 * other.m13 + this.m12 * other.m23 + this.m13 * other.m33,
            this.m21 * other.m11 + this.m22 * other.m21 + this.m23 * other.m31,
            this.m21 * other.m12 + this.m22 * other.m22 + this.m23 * other.m32,
            this.m21 * other.m13 + this.m22 * other.m23 + this.m23 * other.m33,
            this.m31 * other.m11 + this.m32 * other.m21 + this.m33 * other.m31,
            this.m31 * other.m12 + this.m32 * other.m22 + this.m33 * other.m32,
            this.m31 * other.m13 + this.m32 * other.m23 + this.m33 * other.m33,
        );
    }

    /** Multiply every element by `factor` (`gp_Mat::Multiply(Standard_Real)`). */
    scaled(factor: number): Matrix3 {
        return new Matrix3(
            this.m11 * factor,
            this.m12 * factor,
            this.m13 * factor,
            this.m21 * factor,
            this.m22 * factor,
            this.m23 * factor,
            this.m31 * factor,
            this.m32 * factor,
            this.m33 * factor,
        );
    }

    /** Add `delta` to each diagonal element (`gp_Mat::SetDiagonal` as OCCT uses it for mirrors). */
    withDiagonalOffset(delta: number): Matrix3 {
        return new Matrix3(
            this.m11 + delta,
            this.m12,
            this.m13,
            this.m21,
            this.m22 + delta,
            this.m23,
            this.m31,
            this.m32,
            this.m33 + delta,
        );
    }

    transposed(): Matrix3 {
        return new Matrix3(
            this.m11,
            this.m21,
            this.m31,
            this.m12,
            this.m22,
            this.m32,
            this.m13,
            this.m23,
            this.m33,
        );
    }

    /** `this * vector` (`gp_XYZ::Multiply(gp_Mat)`). */
    transform(vector: Vector): Vector {
        let { x, y, z } = vector;
        return new Vector(
            this.m11 * x + this.m12 * y + this.m13 * z,
            this.m21 * x + this.m22 * y + this.m23 * z,
            this.m31 * x + this.m32 * y + this.m33 * z,
        );
    }

    determinant(): number {
        return (
            this.m11 * (this.m22 * this.m33 - this.m32 * this.m23) -
            this.m12 * (this.m21 * this.m33 - this.m31 * this.m23) +
            this.m13 * (this.m21 * this.m32 - this.m31 * this.m22)
        );
    }

    trace(): number {
        return this.m11 + this.m22 + this.m33;
    }

    toRows(): [[number, number, number], [number, number, number], [number, number, number]] {
        return [
            [this.m11, this.m12, this.m13],
            [this.m21, this.m22, this.m23],
            [this.m31, this.m32, this.m33],
        ];
    }

    equals(other: Matrix3, tolerance: number): boolean {
        return (
            Math.abs(this.m11 - other.m11) <= tolerance &&
            Math.abs(this.m12 - other.m12) <= tolerance &&
            Math.abs(this.m13 - other.m13) <= tolerance &&
            Math.abs(this.m21 - other.m21) <= tolerance &&
            Math.abs(this.m22 - other.m22) <= tolerance &&
            Math.abs(this.m23 - other.m23) <= tolerance &&
            Math.abs(this.m31 - other.m31) <= tolerance &&
            Math.abs(this.m32 - other.m32) <= tolerance &&
            Math.abs(this.m33 - other.m33) <= tolerance
        );
    }

    toString(): string {
        return `Matrix3(${this.toRows()
            .map(row => `[${row.join(", ")}]`)
            .join(", ")})`;
    }
}
