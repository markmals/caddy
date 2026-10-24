// Oriented (minimum-volume) bounding boxes.

import type { Shape, Vec3 } from "./types.ts";

import { addon } from "./addon.ts";
import { vec3 } from "./types.ts";

/** A box free to rotate with the shape: a centre, an orthonormal frame and half extents. */
export interface OrientedBounds {
    readonly center: Vec3;
    readonly xDirection: Vec3;
    readonly yDirection: Vec3;
    readonly zDirection: Vec3;
    /** Half the extent along each of the three directions, as OCCT stores it. */
    readonly halfSizes: Vec3;
}

interface ObbAddon {
    orientedBoundingBox(shape: Shape): Float64Array;
}

function native(): ObbAddon {
    return addon<ObbAddon>();
}

/** Minimum-volume bounds of `shape`, or `undefined` for an empty shape. */
export function orientedBoundingBox(shape: Shape): OrientedBounds | undefined {
    let values = native().orientedBoundingBox(shape);
    if (values.length === 0) return undefined;
    return {
        center: vec3(values, 0),
        xDirection: vec3(values, 3),
        yDirection: vec3(values, 6),
        zDirection: vec3(values, 9),
        halfSizes: vec3(values, 12),
    };
}
