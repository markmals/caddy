import type { Axis } from "./axis.ts";
import type { VectorLike } from "./vector.ts";

import { GeometryError } from "../errors.ts";
import { DEG2RAD, RESOLUTION } from "./constants.ts";
import { Matrix3 } from "./matrix3.ts";
import { Transform } from "./transform.ts";
import { Vector } from "./vector.ts";

/** One-based row or column index of the 4x4 matrix (`gp_GTrsf::Value`). */
export type MatrixCell = 1 | 2 | 3 | 4;

/**
 * An immutable general affine transformation (build123d `Matrix`, OCCT `gp_GTrsf`).
 *
 * Where {@link Transform} is a rigid motion with one uniform scale factor, a matrix may also
 * stretch each axis differently and shear, which is what `Shape#transformGeometry` applies. The
 * fourth row is always `[0, 0, 0, 1]` and is implied rather than stored.
 */
export class Matrix {
    /** The 3x3 linear part. */
    readonly linear: Matrix3;
    readonly translation: Vector;

    /** Rows of `[a, b, c, translation]`; a fourth row is accepted only as `[0, 0, 0, 1]`. */
    constructor(rows: readonly (readonly number[])[] = Matrix.IDENTITY_ROWS) {
        if ((rows.length !== 3 && rows.length !== 4) || rows.some(row => row.length !== 4)) {
            throw new GeometryError("A matrix needs three or four rows of four numbers");
        }
        if (rows.length === 4 && rows[3]?.some((value, index) => value !== (index === 3 ? 1 : 0))) {
            throw new GeometryError("The fourth matrix row must be [0, 0, 0, 1]");
        }
        if (rows.some(row => row.some(value => !Number.isFinite(value)))) {
            throw new GeometryError("A matrix may only hold finite numbers");
        }
        let [first = [], second = [], third = []] = rows;
        this.linear = Matrix3.fromRows(
            new Vector(first[0], first[1], first[2]),
            new Vector(second[0], second[1], second[2]),
            new Vector(third[0], third[1], third[2]),
        );
        this.translation = new Vector(first[3], second[3], third[3]);
    }

    private static readonly IDENTITY_ROWS: readonly (readonly number[])[] = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
    ];

    static readonly IDENTITY: Matrix = new Matrix();

    static fromParts(linear: Matrix3, translation: Vector): Matrix {
        return new Matrix([
            [linear.m11, linear.m12, linear.m13, translation.x],
            [linear.m21, linear.m22, linear.m23, translation.y],
            [linear.m31, linear.m32, linear.m33, translation.z],
        ]);
    }

    /** The same transformation as `transform`, free to become non-rigid afterwards. */
    static fromTransform(transform: Transform): Matrix {
        return Matrix.fromParts(transform.matrix.scaled(transform.scale), transform.translation);
    }

    /**
     * One-based element access, as {@link Matrix3} and {@link Transform} index and as
     * `gp_GTrsf::Value` does; build123d subscripts the same matrix from zero.
     */
    value(row: MatrixCell, column: MatrixCell): number {
        if (row === 4) {
            return column === 4 ? 1 : 0;
        }
        if (column === 4) {
            let { x, y, z } = this.translation;
            return row === 1 ? x : row === 2 ? y : z;
        }
        return this.linear.value(row, column);
    }

    /** Apply to a point: the linear part, then the translation. */
    apply(point: VectorLike): Vector {
        return this.linear.transform(Vector.from(point)).add(this.translation);
    }

    /** `this * other`: apply `other` first, then this one (`gp_GTrsf::Multiply`). */
    multiply(other: Matrix): Matrix {
        return Matrix.fromParts(this.linear.multiply(other.linear), this.apply(other.translation));
    }

    /**
     * Turn `angle` degrees about `axis` first, then apply this matrix (build123d's `rotate`,
     * which mutates the matrix in place).
     */
    rotated(axis: Axis, angle: number): Matrix {
        let rotation = Transform.fromAxisRotation(axis.position, axis.direction, angle * DEG2RAD);
        return this.multiply(Matrix.fromTransform(rotation));
    }

    /**
     * The inverse transformation (`gp_GTrsf::Invert`), by the adjugate over the determinant.
     *
     * OCCT takes a shortcut for matrices it still recognizes as rigid, transposing instead of
     * inverting; the two agree to the last few bits, not bit for bit.
     */
    inverse(): Matrix {
        let determinant = this.linear.determinant;
        if (Math.abs(determinant) <= RESOLUTION) {
            throw new GeometryError("Cannot invert a singular matrix");
        }
        let linear = adjugate(this.linear).scaled(1 / determinant);
        return Matrix.fromParts(linear, linear.transform(this.translation).negate());
    }

    /** The 3x4 affine rows, as `Shape#transformGeometry` takes them. */
    toRows(): [
        [number, number, number, number],
        [number, number, number, number],
        [number, number, number, number],
    ] {
        let { m11, m12, m13, m21, m22, m23, m31, m32, m33 } = this.linear;
        return [
            [m11, m12, m13, this.translation.x],
            [m21, m22, m23, this.translation.y],
            [m31, m32, m33, this.translation.z],
        ];
    }

    /** All sixteen values column by column, the layout glTF and OpenGL expect. */
    toTransposedArray(): number[] {
        let rows = [...this.toRows(), [0, 0, 0, 1]];
        return [0, 1, 2, 3].flatMap(column => rows.map(row => row[column] ?? 0));
    }

    equals(other: Matrix, tolerance: number): boolean {
        return (
            this.linear.equals(other.linear, tolerance) &&
            this.translation.equals(other.translation, tolerance)
        );
    }

    toString(): string {
        return `Matrix(${JSON.stringify(this.toRows())})`;
    }
}

/** The transpose of the cofactor matrix (`gp_Mat::Invert`'s numerator). */
function adjugate(matrix: Matrix3): Matrix3 {
    let { m11, m12, m13, m21, m22, m23, m31, m32, m33 } = matrix;
    return new Matrix3(
        m22 * m33 - m23 * m32,
        m13 * m32 - m12 * m33,
        m12 * m23 - m13 * m22,
        m23 * m31 - m21 * m33,
        m11 * m33 - m13 * m31,
        m13 * m21 - m11 * m23,
        m21 * m32 - m22 * m31,
        m12 * m31 - m11 * m32,
        m11 * m22 - m12 * m21,
    );
}
