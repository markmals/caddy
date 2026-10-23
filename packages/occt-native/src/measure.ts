// Mass properties, bounding boxes and validity.

import type { Shape, Vec3 } from "./types.ts";

import { addon } from "./addon.ts";
import { vec3 } from "./types.ts";

/** Which integral to compute: along edges, over faces, or through solids. */
export type PropertyKind = "linear" | "surface" | "volume";

export interface MassProperties {
    /** Length, area or volume, depending on the property kind. */
    readonly mass: number;
    readonly centerOfMass: Vec3;
    /** Matrix of inertia about the center of mass, row-major 3x3. */
    readonly inertia: readonly number[];
}

export interface Bounds {
    readonly min: Vec3;
    readonly max: Vec3;
}

interface MeasureAddon {
    massProperties(shape: Shape, kind: PropertyKind): Float64Array;
    boundingBox(shape: Shape, optimal: boolean): Float64Array;
    isValid(shape: Shape): boolean;
}

function native(): MeasureAddon {
    return addon<MeasureAddon>();
}

export function massProperties(shape: Shape, kind: PropertyKind): MassProperties {
    let values = native().massProperties(shape, kind);
    return {
        mass: values[0] ?? Number.NaN,
        centerOfMass: vec3(values, 1),
        inertia: Array.from(values.subarray(4)),
    };
}

/**
 * Axis-aligned bounds, or `undefined` for an empty shape. Removes any stored triangulation first.
 * `optimal` (default) computes tight bounds; otherwise OCCT's faster, padded bounds.
 */
export function boundingBox(shape: Shape, optimal = true): Bounds | undefined {
    let values = native().boundingBox(shape, optimal);
    if (values.length === 0) return undefined;
    return { min: vec3(values, 0), max: vec3(values, 3) };
}

/** OCCT BRepCheck_Analyzer validity, including geometric checks. */
export function isValid(shape: Shape): boolean {
    return native().isValid(shape);
}
