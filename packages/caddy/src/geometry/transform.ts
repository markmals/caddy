import { GeometryError } from "../errors.ts";
import { RESOLUTION } from "./constants.ts";
import { Matrix3 } from "./matrix3.ts";
import { Quaternion } from "./quaternion.ts";
import { Vector } from "./vector.ts";

/** An orthonormal frame: the data OCCT keeps in a `gp_Ax3`. */
export interface CoordinateSystem {
    readonly origin: Vector;
    readonly xDir: Vector;
    readonly yDir: Vector;
    readonly zDir: Vector;
}

/**
 * An immutable rigid transformation with uniform scale: `X' = scale * matrix * X + translation`.
 *
 * This is a direct port of OCCT's `gp_Trsf`, including its multiplication and inversion operand
 * order, so composed transformations agree with Open CASCADE. `gp_Trsf` classifies itself with a
 * `shape` tag purely to short-circuit arithmetic; every one of those branches is numerically
 * identical to the general case, so no tag is kept here.
 */
export class Transform {
    readonly scale: number;
    readonly matrix: Matrix3;
    readonly translation: Vector;

    constructor(scale: number, matrix: Matrix3, translation: Vector) {
        this.scale = scale;
        this.matrix = matrix;
        this.translation = translation;
    }

    static readonly IDENTITY: Transform = new Transform(1, Matrix3.IDENTITY, new Vector());

    static fromTranslation(translation: Vector): Transform {
        return new Transform(1, Matrix3.IDENTITY, translation);
    }

    /** Pure rotation about the origin (`gp_Trsf::SetRotation(gp_Quaternion)`). */
    static fromRotation(rotation: Quaternion): Transform {
        return new Transform(1, rotation.toMatrix(), new Vector());
    }

    /** Rotation of `angle` radians about the axis through `origin` (`SetRotation(gp_Ax1, A)`). */
    static fromAxisRotation(origin: Vector, direction: Vector, angle: number): Transform {
        let matrix = Matrix3.rotation(direction, angle);
        return new Transform(1, matrix, matrix.transform(origin.negate()).add(origin));
    }

    /** Uniform scaling about `center` (`gp_Trsf::SetScale`). */
    static fromScale(center: Vector, factor: number): Transform {
        if (Math.abs(factor) <= RESOLUTION) {
            throw new GeometryError("Scale factor must be non-zero");
        }
        return new Transform(factor, Matrix3.IDENTITY, center.multiply(1 - factor));
    }

    /** Axial symmetry: a half turn about the axis (`gp_Trsf::SetMirror(gp_Ax1)`). */
    static fromAxisMirror(origin: Vector, direction: Vector): Transform {
        let householder = Matrix3.outerProduct(direction.normalized())
            .scaled(-2)
            .withDiagonalOffset(1);
        return new Transform(1, householder.scaled(-1), householder.transform(origin).add(origin));
    }

    /** Planar symmetry: a reflection, so the determinant is negative (`SetMirror(gp_Ax2)`). */
    static fromPlaneMirror(origin: Vector, normal: Vector): Transform {
        let matrix = Matrix3.outerProduct(normal.normalized()).scaled(2).withDiagonalOffset(-1);
        return new Transform(-1, matrix, matrix.transform(origin).add(origin));
    }

    /** Map world coordinates into `system`'s local frame (`gp_Trsf::SetTransformation(gp_Ax3)`). */
    static fromCoordinateSystem(system: CoordinateSystem): Transform {
        let matrix = Matrix3.fromRows(system.xDir, system.yDir, system.zDir);
        return new Transform(1, matrix, matrix.transform(system.origin).negate());
    }

    /**
     * Express coordinates given in `from` as coordinates in `to`
     * (`gp_Trsf::SetTransformation(gp_Ax3, gp_Ax3)`).
     */
    static betweenCoordinateSystems(from: CoordinateSystem, to: CoordinateSystem): Transform {
        let matrix = Matrix3.fromRows(to.xDir, to.yDir, to.zDir);
        let translation = matrix.transform(to.origin).negate().add(matrix.transform(from.origin));
        let fromMatrix = Matrix3.fromColumns(from.xDir, from.yDir, from.zDir);
        return new Transform(1, matrix.multiply(fromMatrix), translation);
    }

    /** Replace the translation, keeping scale and rotation (`gp_Trsf::SetTranslationPart`). */
    withTranslation(translation: Vector): Transform {
        return new Transform(this.scale, this.matrix, translation);
    }

    /** The rotation part as a quaternion (`gp_Trsf::GetRotation`). */
    get rotation(): Quaternion {
        return Quaternion.fromMatrix(this.matrix);
    }

    /** Apply to a point: rotated, scaled, then translated (`gp_Pnt::Transformed`). */
    apply(point: Vector): Vector {
        let rotated = this.matrix.transform(point);
        return (this.scale === 1 ? rotated : rotated.multiply(this.scale)).add(this.translation);
    }

    /** Apply to a free vector: scaled and rotated, never translated (`gp_Vec::Transformed`). */
    applyVector(vector: Vector): Vector {
        return this.matrix.scaled(this.scale).transform(vector);
    }

    /** Apply to a unit direction: rotated, re-normalized, flipped by a negative scale. */
    applyDirection(direction: Vector): Vector {
        let rotated = this.matrix.transform(direction).normalized();
        return this.scale < 0 ? rotated.negate() : rotated;
    }

    /** `this * other`: apply `other` first, then `this` (`gp_Trsf::Multiply`). */
    multiply(other: Transform): Transform {
        let shifted = this.matrix.transform(other.translation);
        let scale = other.scale;
        if (this.scale !== 1) {
            shifted = shifted.multiply(this.scale);
            scale = this.scale * other.scale;
        }
        return new Transform(
            scale,
            this.matrix.multiply(other.matrix),
            this.translation.add(shifted),
        );
    }

    inverse(): Transform {
        if (Math.abs(this.scale) <= RESOLUTION) {
            throw new GeometryError("Cannot invert a transformation with zero scale");
        }
        let scale = 1 / this.scale;
        let matrix = this.matrix.transposed();
        return new Transform(scale, matrix, matrix.transform(this.translation).multiply(-scale));
    }

    /**
     * Repeated composition by binary exponentiation, in OCCT's accumulation order
     * (`gp_Trsf::Power`). Negative exponents invert first.
     */
    power(exponent: number): Transform {
        if (!Number.isInteger(exponent)) {
            throw new GeometryError(`Transform exponent must be an integer, got ${exponent}`);
        }
        if (exponent === 0) {
            return Transform.IDENTITY;
        }
        if (exponent === 1) {
            return this;
        }
        if (exponent === -1) {
            return this.inverse();
        }

        let base = exponent < 0 ? this.inverse() : this;
        let scale = base.scale;
        let matrix = base.matrix;
        let translation = base.translation;
        let stepScale = base.scale;
        let stepMatrix = base.matrix;
        let stepTranslation = base.translation;

        for (let remaining = Math.abs(exponent) - 1; ; remaining = Math.floor(remaining / 2)) {
            if (remaining % 2 === 1) {
                translation = translation.add(matrix.transform(stepTranslation).multiply(scale));
                scale = scale * stepScale;
                matrix = matrix.multiply(stepMatrix);
            }
            if (remaining === 1) {
                break;
            }
            stepScale = stepScale * stepScale;
            stepTranslation = stepTranslation.add(
                stepMatrix.transform(stepTranslation).multiply(stepScale),
            );
            stepMatrix = stepMatrix.multiply(stepMatrix);
        }
        return new Transform(scale, matrix, translation);
    }

    /** One-based element of the 3x4 affine matrix (`gp_Trsf::Value`). */
    value(row: 1 | 2 | 3, column: 1 | 2 | 3 | 4): number {
        if (column === 4) {
            let { x, y, z } = this.translation;
            return row === 1 ? x : row === 2 ? y : z;
        }
        return this.scale * this.matrix.value(row, column);
    }

    /** The 3x4 affine matrix, row major. */
    toRows(): [
        [number, number, number, number],
        [number, number, number, number],
        [number, number, number, number],
    ] {
        let scaled = this.matrix.scaled(this.scale);
        return [
            [scaled.m11, scaled.m12, scaled.m13, this.translation.x],
            [scaled.m21, scaled.m22, scaled.m23, this.translation.y],
            [scaled.m31, scaled.m32, scaled.m33, this.translation.z],
        ];
    }

    equals(other: Transform, tolerance: number): boolean {
        return (
            Math.abs(this.scale - other.scale) <= tolerance &&
            this.matrix.equals(other.matrix, tolerance) &&
            this.translation.equals(other.translation, tolerance)
        );
    }

    toString(): string {
        return `Transform(scale=${this.scale}, rows=${JSON.stringify(this.toRows())})`;
    }
}
