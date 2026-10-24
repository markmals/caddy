import type { Axis } from "./axis.ts";
import type { Plane } from "./plane.ts";
import type { Transform } from "./transform.ts";

import { GeometryError } from "../errors.ts";
import { DEG2RAD, GEOM_TOLERANCE, RAD2DEG, RESOLUTION } from "./constants.ts";
import { Matrix3 } from "./matrix3.ts";
import { roundTo } from "./rounding.ts";

/** Anything that can be read as a position or direction in space. */
export type VectorLike = Vector | readonly number[];

/** Options of {@link Vector#transform}. */
export interface VectorTransformOptions {
    /** Treat the vector as a direction: rotate and re-normalize it instead of moving a point. */
    readonly isDirection?: boolean;
}

/**
 * OCCT switches between `acos` and `asin` at 45° because each is better conditioned on one side
 * of that boundary (`gp_Dir::Angle`). The literal is OCCT's, not `sqrt(2)/2`.
 */
const ANGLE_COSINE_SWITCH = 0.70710678118655;

/** An immutable 3D vector, used for both positions and directions (build123d `Vector`). */
export class Vector {
    readonly x: number;
    readonly y: number;
    readonly z: number;

    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    /** Coerce a vector, 2-tuple, or 3-tuple into a `Vector`. Missing components default to 0. */
    static from(value: VectorLike): Vector {
        if (value instanceof Vector) {
            return value;
        }
        if (value.length > 3) {
            throw new GeometryError(`Expected at most 3 coordinates, got ${value.length}`);
        }
        let [x = 0, y = 0, z = 0] = value;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
            throw new GeometryError(`Expected finite coordinates, got (${value.join(", ")})`);
        }
        return new Vector(x, y, z);
    }

    /** Euclidean length. */
    get length(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    add(other: VectorLike): Vector {
        let v = Vector.from(other);
        return new Vector(this.x + v.x, this.y + v.y, this.z + v.z);
    }

    sub(other: VectorLike): Vector {
        let v = Vector.from(other);
        return new Vector(this.x - v.x, this.y - v.y, this.z - v.z);
    }

    multiply(scale: number): Vector {
        return new Vector(this.x * scale, this.y * scale, this.z * scale);
    }

    divide(denominator: number): Vector {
        return this.multiply(1 / denominator);
    }

    /** Flip direction, keeping magnitude (build123d `-vector` and `Vector.reverse`). */
    negate(): Vector {
        return this.multiply(-1);
    }

    /** Alias of {@link negate}, matching build123d's `reverse()`. */
    reverse(): Vector {
        return this.multiply(-1);
    }

    dot(other: VectorLike): number {
        let v = Vector.from(other);
        return this.x * v.x + this.y * v.y + this.z * v.z;
    }

    cross(other: VectorLike): Vector {
        let v = Vector.from(other);
        return new Vector(
            this.y * v.z - this.z * v.y,
            this.z * v.x - this.x * v.z,
            this.x * v.y - this.y * v.x,
        );
    }

    /** Unit vector in the same direction. Throws when this vector has no length. */
    normalized(): Vector {
        let magnitude = this.length;
        if (magnitude <= RESOLUTION) {
            throw new GeometryError("Cannot normalize a vector of zero length");
        }
        return new Vector(this.x / magnitude, this.y / magnitude, this.z / magnitude);
    }

    /** The centre of a point is the point; provided so every geometry type answers `center()`. */
    center(): Vector {
        return this;
    }

    /** Unsigned angle to `other` in degrees, in [0, 180]. */
    getAngle(other: VectorLike): number {
        return angleBetween(this, Vector.from(other)) * RAD2DEG;
    }

    /**
     * Signed angle to `other` in degrees, positive when the turn follows `normal` by the
     * right-hand rule. build123d defaults `normal` to -Z.
     */
    getSignedAngle(other: VectorLike, normal?: VectorLike): number {
        let reference = normal === undefined ? new Vector(0, 0, -1) : Vector.from(normal);
        let self = this.normalized();
        let target = Vector.from(other).normalized();
        let cross = self.cross(target);
        let angle = angleFromCosine(self.dot(target), cross.length);
        return (cross.dot(reference.normalized()) >= 0 ? angle : -angle) * RAD2DEG;
    }

    /** Component of this vector along `line`, as a vector. */
    projectToLine(line: VectorLike): Vector {
        let target = Vector.from(line);
        let lineLength = target.length;
        return target.multiply(this.dot(target) / (lineLength * lineLength));
    }

    /** Unsigned distance from this point to `plane`. */
    distanceToPlane(plane: Plane): number {
        return Math.abs(this.signedDistanceFromPlane(plane));
    }

    /** Distance from `plane` to this point, signed along the plane normal. */
    signedDistanceFromPlane(plane: Plane): number {
        return this.sub(plane.origin).dot(plane.zDir);
    }

    /** Orthogonal projection of this point onto `plane`. */
    projectToPlane(plane: Plane): Vector {
        let base = plane.origin;
        let normal = plane.zDir;
        return this.sub(normal.multiply(this.sub(base).dot(normal) / normal.length ** 2));
    }

    /**
     * Rotate about `axis` by `angle` degrees.
     *
     * Only the axis direction matters: OCCT applies the rotation's vectorial part to vectors,
     * so the axis position is ignored (`gp_Vec::Rotate`).
     */
    rotate(axis: Axis, angle: number): Vector {
        return Matrix3.rotation(axis.direction, angle * DEG2RAD).transform(this);
    }

    /**
     * Apply an affine transformation.
     *
     * Positions are translated and scaled; directions (`isDirection`) are only rotated and are
     * re-normalized, matching `gp_Pnt::Transformed` and `gp_Dir::Transformed`.
     */
    transform(transform: Transform, options: VectorTransformOptions = {}): Vector {
        return options.isDirection === true
            ? transform.applyDirection(this)
            : transform.apply(this);
    }

    /** Round every coordinate to `digits` decimal places. */
    rounded(digits = 0): Vector {
        return new Vector(
            roundTo(this.x, digits),
            roundTo(this.y, digits),
            roundTo(this.z, digits),
        );
    }

    equals(other: Vector, tolerance = GEOM_TOLERANCE): boolean {
        return (
            Math.abs(this.x - other.x) <= tolerance &&
            Math.abs(this.y - other.y) <= tolerance &&
            Math.abs(this.z - other.z) <= tolerance
        );
    }

    toTuple(): [number, number, number] {
        return [this.x, this.y, this.z];
    }

    toString(): string {
        return `Vector: (x=${this.x}, y=${this.y}, z=${this.z})`;
    }

    *[Symbol.iterator](): IterableIterator<number> {
        yield this.x;
        yield this.y;
        yield this.z;
    }
}

/** Unsigned angle in radians between two vectors of any length (`gp_Vec::Angle`). */
export function angleBetween(first: Vector, second: Vector): number {
    let a = first.normalized();
    let b = second.normalized();
    return angleFromCosine(a.dot(b), a.cross(b).length);
}

/** OCCT's conditioned angle reconstruction from a cosine and the matching sine magnitude. */
function angleFromCosine(cosine: number, sine: number): number {
    if (cosine > -ANGLE_COSINE_SWITCH && cosine < ANGLE_COSINE_SWITCH) {
        return Math.acos(cosine);
    }
    return cosine < 0 ? Math.PI - Math.asin(sine) : Math.asin(sine);
}
