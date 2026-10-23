import type { Align2DLike, Align3DLike } from "./enums.ts";
import type { VectorLike } from "./vector.ts";

import { GEOM_TOLERANCE, TOLERANCE } from "./constants.ts";
import { Align } from "./enums.ts";
import { Vector } from "./vector.ts";

/** One axis of a pairwise bounding box comparison. */
interface AxisOverlap {
    readonly selfMin: number;
    readonly selfMax: number;
    readonly otherMin: number;
    readonly otherMax: number;
}

/**
 * An immutable axis-aligned bounding box (the pure-data part of build123d `BoundBox`).
 *
 * Besides its extents it provides the full predicate family. {@link covers} and
 * {@link coveredBy} test inclusive enclosure; {@link contains} and {@link within} additionally
 * require a shared interior; {@link containsProperly} excludes boundary contact. Degenerate axes
 * that coincide in both boxes drop out of interior comparisons, so coplanar rectangles compare in
 * two dimensions and collinear segments in one.
 */
export class BoundingBox {
    /** Minimum corner. */
    readonly min: Vector;
    /** Maximum corner. */
    readonly max: Vector;
    /** `max - min`, per component. */
    readonly size: Vector;

    constructor(min: VectorLike, max: VectorLike) {
        this.min = Vector.from(min);
        this.max = Vector.from(max);
        this.size = this.max.sub(this.min);
    }

    /** Box around a single point. */
    static fromPoint(point: VectorLike): BoundingBox {
        return new BoundingBox(point, point);
    }

    /** Smallest box containing every point. Throws when `points` is empty. */
    static fromPoints(points: Iterable<VectorLike>): BoundingBox {
        let box: BoundingBox | undefined;
        for (let point of points) {
            box = box === undefined ? BoundingBox.fromPoint(point) : box.add(point);
        }
        if (box === undefined) {
            throw new RangeError("Cannot build a bounding box from zero points");
        }
        return box;
    }

    /**
     * Lebesgue measure: length for 1D extents, area for 2D, volume for 3D.
     *
     * Axes thinner than {@link TOLERANCE} drop out of the product, which leaves a fully
     * degenerate box measuring 1 — the empty product, as in build123d.
     */
    get measure(): number {
        return this.size
            .toTuple()
            .filter(extent => extent > TOLERANCE)
            .reduce((product, extent) => product * extent, 1);
    }

    /** Body diagonal length, the largest distance between two points of the box. */
    get diagonal(): number {
        return this.size.length;
    }

    center(): Vector {
        return this.min.add(this.max).divide(2);
    }

    /**
     * Smallest box enclosing this one and `obj`.
     *
     * build123d takes a tolerance here, but OCCT drops the gap as soon as a non-void box is
     * merged in, so it never affects the result and is not accepted.
     */
    add(obj: VectorLike | BoundingBox): BoundingBox {
        let [otherMin, otherMax] =
            obj instanceof BoundingBox ? [obj.min, obj.max] : [Vector.from(obj), Vector.from(obj)];
        return new BoundingBox(
            new Vector(
                Math.min(this.min.x, otherMin.x),
                Math.min(this.min.y, otherMin.y),
                Math.min(this.min.z, otherMin.z),
            ),
            new Vector(
                Math.max(this.max.x, otherMax.x),
                Math.max(this.max.y, otherMax.y),
                Math.max(this.max.z, otherMax.z),
            ),
        );
    }

    /** Does this box include every point of `other`, boundary included? */
    covers(other: BoundingBox, tolerance = TOLERANCE): boolean {
        return axes(this, other).every(
            axis =>
                axis.selfMin <= axis.otherMin + tolerance &&
                axis.otherMax <= axis.selfMax + tolerance,
        );
    }

    /** Is every point of this box inside `other`? */
    coveredBy(other: BoundingBox, tolerance = TOLERANCE): boolean {
        return other.covers(this, tolerance);
    }

    /** Enclosure with a shared interior; boundary contact is allowed. */
    contains(other: BoundingBox, tolerance = TOLERANCE): boolean {
        return this.covers(other, tolerance) && this.hasInteriorOverlap(other, tolerance);
    }

    /** Enclosure without any boundary contact. */
    containsProperly(other: BoundingBox, tolerance = TOLERANCE): boolean {
        let interior = interiorAxes(this, other, tolerance);
        if (interior === undefined || interior.length === 0) {
            return false;
        }
        return interior.every(
            axis =>
                axis.selfMin + tolerance < axis.otherMin &&
                axis.otherMax < axis.selfMax - tolerance,
        );
    }

    /** Is this box contained in `other`? */
    within(other: BoundingBox, tolerance = TOLERANCE): boolean {
        return other.contains(this, tolerance);
    }

    /** Is the distance between the boxes within `tolerance`? */
    intersects(other: BoundingBox, tolerance = TOLERANCE): boolean {
        return this.distanceTo(other) <= tolerance;
    }

    /** Do the boxes fail to intersect? */
    disjoint(other: BoundingBox, tolerance = TOLERANCE): boolean {
        return !this.intersects(other, tolerance);
    }

    /** Do the boxes meet without sharing interior? */
    touches(other: BoundingBox, tolerance = TOLERANCE): boolean {
        return this.intersects(other, tolerance) && !this.hasInteriorOverlap(other, tolerance);
    }

    /** Do the boxes share interior while neither contains the other? */
    overlaps(other: BoundingBox, tolerance = TOLERANCE): boolean {
        return (
            this.hasInteriorOverlap(other, tolerance) &&
            !this.contains(other, tolerance) &&
            !other.contains(this, tolerance)
        );
    }

    /** Shortest distance between the boxes, zero when they intersect (`Bnd_Box::Distance`). */
    distanceTo(other: BoundingBox): number {
        let squared = axes(this, other).reduce((total, axis) => {
            if (
                (axis.selfMin <= axis.otherMin && axis.otherMin <= axis.selfMax) ||
                (axis.otherMin <= axis.selfMin && axis.selfMin <= axis.otherMax)
            ) {
                return total;
            }
            return (
                total +
                Math.min((axis.selfMin - axis.otherMax) ** 2, (axis.selfMax - axis.otherMin) ** 2)
            );
        }, 0);
        return Math.sqrt(squared);
    }

    /** How far to move an object of this size to reach the requested alignment. */
    toAlignOffset(align: Align2DLike | Align3DLike): Vector {
        return toAlignOffset(this.min, this.max, align);
    }

    equals(other: BoundingBox, tolerance = GEOM_TOLERANCE): boolean {
        return this.min.equals(other.min, tolerance) && this.max.equals(other.max, tolerance);
    }

    toString(): string {
        return (
            `BoundingBox: ${this.min.x} <= x <= ${this.max.x}, ` +
            `${this.min.y} <= y <= ${this.max.y}, ${this.min.z} <= z <= ${this.max.z}`
        );
    }

    /** Do the boxes share interior across every axis that contributes one? */
    private hasInteriorOverlap(other: BoundingBox, tolerance: number): boolean {
        let interior = interiorAxes(this, other, tolerance);
        return (
            interior !== undefined &&
            interior.every(
                axis =>
                    Math.max(axis.selfMin, axis.otherMin) <
                    Math.min(axis.selfMax, axis.otherMax) - tolerance,
            )
        );
    }
}

/** The three axes of a pairwise comparison. */
function axes(self: BoundingBox, other: BoundingBox): AxisOverlap[] {
    let selfMin = self.min.toTuple();
    let selfMax = self.max.toTuple();
    let otherMin = other.min.toTuple();
    let otherMax = other.max.toTuple();
    return [0, 1, 2].map(index => ({
        selfMin: selfMin[index] ?? 0,
        selfMax: selfMax[index] ?? 0,
        otherMin: otherMin[index] ?? 0,
        otherMax: otherMax[index] ?? 0,
    }));
}

/**
 * The axes that take part in an interior comparison.
 *
 * An axis on which both boxes are degenerate contributes no interior, so it is dropped — that is
 * what lets coplanar rectangles compare in two dimensions. If those degenerate axes sit at
 * different coordinates the boxes cannot share interior at all, reported as `undefined`.
 */
function interiorAxes(
    self: BoundingBox,
    other: BoundingBox,
    tolerance: number,
): AxisOverlap[] | undefined {
    let kept: AxisOverlap[] = [];
    for (let axis of axes(self, other)) {
        let selfDegenerate = axis.selfMax - axis.selfMin <= tolerance;
        let otherDegenerate = axis.otherMax - axis.otherMin <= tolerance;
        if (selfDegenerate && otherDegenerate) {
            let selfCenter = (axis.selfMin + axis.selfMax) / 2;
            let otherCenter = (axis.otherMin + axis.otherMax) / 2;
            if (Math.abs(selfCenter - otherCenter) > tolerance) {
                return undefined;
            }
        } else {
            kept.push(axis);
        }
    }
    return kept;
}

/**
 * Amount to move an object spanning `minPoint`..`maxPoint` to achieve `align`.
 *
 * A bare {@link Align} applies to every axis; a tuple aligns each axis independently and `null`
 * leaves that axis alone. Two-element tuples leave Z untouched.
 */
export function toAlignOffset(
    minPoint: VectorLike,
    maxPoint: VectorLike,
    align: Align2DLike | Align3DLike,
    center?: VectorLike,
): Vector {
    let min = Vector.from(minPoint);
    let max = Vector.from(maxPoint);
    let middle = center === undefined ? min.add(max).divide(2) : Vector.from(center);

    if (align === null || align === Align.NONE) {
        return new Vector();
    }
    if (align === Align.MIN) {
        return min.negate();
    }
    if (align === Align.MAX) {
        return max.negate();
    }
    if (align === Align.CENTER) {
        return middle.negate();
    }

    let minimums = min.toTuple();
    let maximums = max.toTuple();
    let centers = middle.toTuple();
    let offsets = align.map((alignment, index) => {
        switch (alignment) {
            case Align.MIN:
                return -(minimums[index] ?? 0);
            case Align.CENTER:
                return -(centers[index] ?? 0);
            case Align.MAX:
                return -(maximums[index] ?? 0);
            default:
                return 0;
        }
    });
    return Vector.from(offsets);
}
