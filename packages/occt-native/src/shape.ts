// Shape identity, orientation, copying and placement.

import type { Matrix3x4, Orientation, Shape, ShapeType } from "./types.ts";

import { addon } from "./addon.ts";
import { matrixArray } from "./types.ts";

interface ShapeAddon {
    shapeDispose(shape: Shape): void;
    shapeIsDisposed(shape: Shape): boolean;
    shapeType(shape: Shape): ShapeType;
    shapeOrientation(shape: Shape): Orientation;
    shapeIsSame(a: Shape, b: Shape): boolean;
    shapeIsEqual(a: Shape, b: Shape): boolean;
    shapeIsPartner(a: Shape, b: Shape): boolean;
    shapeHash(shape: Shape): number;
    shapeOriented(shape: Shape, orientation: Orientation): Shape;
    shapeReversed(shape: Shape): Shape;
    shapeCopy(shape: Shape, copyGeometry: boolean, copyMesh: boolean): Shape;
    shapeLocation(shape: Shape): Float64Array;
    shapeMoved(shape: Shape, matrix: Float64Array): Shape;
    shapeLocated(shape: Shape, matrix: Float64Array): Shape;
    shapeTransformed(shape: Shape, matrix: Float64Array, copy: boolean): Shape;
    shapeGTransformed(shape: Shape, matrix: Float64Array, copy: boolean): Shape;
    shapeToSplines(shape: Shape, degree: number, tolerance: number, rational: boolean): Shape;
}

function native(): ShapeAddon {
    return addon<ShapeAddon>();
}

/** Releases the native shape now; later use throws an `OcctError` with code `DISPOSED`. */
export function dispose(shape: Shape): void {
    native().shapeDispose(shape);
}

export function isDisposed(shape: Shape): boolean {
    return native().shapeIsDisposed(shape);
}

export function shapeType(shape: Shape): ShapeType {
    return native().shapeType(shape);
}

export function orientation(shape: Shape): Orientation {
    return native().shapeOrientation(shape);
}

/** Same TShape and location, any orientation (OCCT IsSame). */
export function isSame(a: Shape, b: Shape): boolean {
    return native().shapeIsSame(a, b);
}

/** Same TShape, location and orientation (OCCT IsEqual). */
export function isEqual(a: Shape, b: Shape): boolean {
    return native().shapeIsEqual(a, b);
}

/** Same TShape, any location or orientation (OCCT IsPartner). */
export function isPartner(a: Shape, b: Shape): boolean {
    return native().shapeIsPartner(a, b);
}

/** Hash consistent with `isSame`; equal shapes hash equally within a process. */
export function hash(shape: Shape): number {
    return native().shapeHash(shape);
}

export function oriented(shape: Shape, value: Orientation): Shape {
    return native().shapeOriented(shape, value);
}

export function reversed(shape: Shape): Shape {
    return native().shapeReversed(shape);
}

/** Deep copy sharing no topology (and, with `copyGeometry`, no geometry) with the input. */
export function copy(
    shape: Shape,
    options: { copyGeometry?: boolean; copyMesh?: boolean } = {},
): Shape {
    return native().shapeCopy(shape, options.copyGeometry ?? true, options.copyMesh ?? false);
}

export function location(shape: Shape): Matrix3x4 {
    return Array.from(native().shapeLocation(shape));
}

/** Composes `matrix` onto the shape's location; the geometry is shared, not copied. */
export function moved(shape: Shape, matrix: Matrix3x4): Shape {
    return native().shapeMoved(shape, matrixArray(matrix));
}

/** Replaces the shape's location with `matrix`; the geometry is shared, not copied. */
export function located(shape: Shape, matrix: Matrix3x4): Shape {
    return native().shapeLocated(shape, matrixArray(matrix));
}

/** Transforms the geometry itself (BRepBuilderAPI_Transform). */
export function transformed(shape: Shape, matrix: Matrix3x4, copyGeometry = false): Shape {
    return native().shapeTransformed(shape, matrixArray(matrix), copyGeometry);
}

/** Applies a general affine matrix (e.g. non-uniform scale); curved geometry becomes NURBS. */
export function generalTransformed(shape: Shape, matrix: Matrix3x4, copyGeometry = false): Shape {
    return native().shapeGTransformed(shape, matrixArray(matrix), copyGeometry);
}

/**
 * Every curve and surface of the shape approximated by B-splines of at most `degree`, within
 * `tolerance` (ShapeCustom::BSplineRestriction). `rational` keeps weights on the result.
 */
export function toSplines(
    shape: Shape,
    degree: number,
    tolerance: number,
    rational: boolean,
): Shape {
    return native().shapeToSplines(shape, degree, tolerance, rational);
}
