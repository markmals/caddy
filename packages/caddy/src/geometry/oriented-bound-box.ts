import type { VectorLike } from "./vector.ts";

import { TOLERANCE } from "./constants.ts";
import { Location } from "./location.ts";
import { Plane } from "./plane.ts";
import { Vector } from "./vector.ts";

/** The parts of an oriented box, as OCCT's `Bnd_OBB` stores them. */
export interface OrientedBounds {
    readonly center: VectorLike;
    readonly xDirection: VectorLike;
    readonly yDirection: VectorLike;
    readonly zDirection: VectorLike;
    /** Half the extent along each of the three directions. */
    readonly halfSizes: VectorLike;
}

/** Which of the three half extents have collapsed, as a lookup key. */
type Degeneracy = `${boolean},${boolean},${boolean}`;

/**
 * Signs picked per degenerate axis so that the corners of a flat box form a polygon.
 *
 * A box collapsed on every axis has one distinct corner, its centre; build123d has no entry for
 * that case and raises a `KeyError` instead.
 */
const CORNER_SIGNS: Readonly<Record<Degeneracy, readonly (readonly [number, number, number])[]>> = {
    "true,true,true": [[1, 1, 1]],
    "true,true,false": [
        [1, 1, 1],
        [1, 1, -1],
    ],
    "true,false,true": [
        [1, 1, 1],
        [1, -1, 1],
    ],
    "false,true,true": [
        [1, 1, 1],
        [-1, 1, 1],
    ],
    "true,false,false": [
        [1, 1, 1],
        [1, 1, -1],
        [1, -1, -1],
        [1, -1, 1],
    ],
    "false,true,false": [
        [1, 1, 1],
        [1, 1, -1],
        [-1, 1, -1],
        [-1, 1, 1],
    ],
    "false,false,true": [
        [1, 1, 1],
        [1, -1, 1],
        [-1, -1, 1],
        [-1, 1, 1],
    ],
    "false,false,false": [
        [-1, -1, -1],
        [-1, -1, 1],
        [-1, 1, -1],
        [-1, 1, 1],
        [1, -1, -1],
        [1, -1, 1],
        [1, 1, -1],
        [1, 1, 1],
    ],
};

/**
 * A minimum-volume bounding box that turns with the shape instead of staying axis aligned
 * (build123d `OrientedBoundBox`).
 *
 * `Shape#orientedBoundingBox` computes one; the directions OCCT picks are arbitrary and may
 * change between shapes that look alike, so compare sizes rather than axes.
 */
export class OrientedBoundBox {
    /** The full extent along each of the three directions. */
    readonly size: Vector;
    readonly xDirection: Vector;
    readonly yDirection: Vector;
    readonly zDirection: Vector;
    private readonly middle: Vector;

    constructor(bounds: OrientedBounds) {
        this.middle = Vector.from(bounds.center);
        this.xDirection = Vector.from(bounds.xDirection);
        this.yDirection = Vector.from(bounds.yDirection);
        this.zDirection = Vector.from(bounds.zDirection);
        this.size = Vector.from(bounds.halfSizes).multiply(2);
    }

    center(): Vector {
        return this.middle;
    }

    /** Body diagonal length, the largest distance between two points of the box. */
    get diagonal(): number {
        return this.size.length;
    }

    /** The box's own coordinate system, centred in the box. */
    get plane(): Plane {
        return new Plane({
            origin: this.middle,
            xDir: this.xDirection,
            zDir: this.zDirection,
        });
    }

    get location(): Location {
        return Location.fromPlane(this.plane);
    }

    /**
     * The distinct corners of the box: eight normally, four for a flat box in the order a
     * polygon needs, two for a box collapsed onto a line.
     */
    get corners(): Vector[] {
        let half = this.size.divide(2);
        let key: Degeneracy = `${half.x < TOLERANCE},${half.y < TOLERANCE},${half.z < TOLERANCE}`;
        return this.cornersFor(CORNER_SIGNS[key]);
    }

    /** Is every corner of `other` inside this box (`Bnd_OBB::IsCompletelyInside`)? */
    isCompletelyInside(other: OrientedBoundBox): boolean {
        return other.corners8().every(corner => !this.isOutside(corner));
    }

    /** Is `point` strictly outside the box (`Bnd_OBB::IsOut`)? */
    isOutside(point: VectorLike): boolean {
        let relative = Vector.from(point).sub(this.middle);
        let half = this.size.divide(2);
        return (
            Math.abs(this.xDirection.dot(relative)) > half.x ||
            Math.abs(this.yDirection.dot(relative)) > half.y ||
            Math.abs(this.zDirection.dot(relative)) > half.z
        );
    }

    toString(): string {
        return (
            `OrientedBoundBox: (center=${this.middle.toTuple().join(", ")}, ` +
            `size=${this.size.toTuple().join(", ")})`
        );
    }

    /** All eight corners, degenerate axes included, as the containment test compares them. */
    private corners8(): Vector[] {
        return this.cornersFor(CORNER_SIGNS["false,false,false"]);
    }

    private cornersFor(signs: readonly (readonly [number, number, number])[]): Vector[] {
        let half = this.size.divide(2);
        return signs.map(([x, y, z]) =>
            this.plane.fromLocalCoords([x * half.x, y * half.y, z * half.z]),
        );
    }
}
