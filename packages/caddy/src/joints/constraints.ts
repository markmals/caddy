/** Validation shared by the joints that measure angles from a reference or clamp to a range. */

import type { VectorLike } from "../geometry/vector.ts";
import type { JointRange } from "./joint.ts";

import { GeometryError } from "../errors.ts";
import { Axis } from "../geometry/axis.ts";
import { Plane } from "../geometry/plane.ts";
import { Vector } from "../geometry/vector.ts";

/**
 * build123d's `angle_reference` resolution: the given direction, which has to be normal to the
 * axis, or else the X direction of the plane that axis is normal to.
 */
export function angleReferenceFor(axis: Axis, reference: VectorLike | undefined): Vector {
    if (reference === undefined) {
        return new Plane({ origin: [0, 0, 0], zDir: axis.direction }).xDir;
    }
    if (!axis.isNormal(new Axis([0, 0, 0], reference))) {
        throw new GeometryError("angleReference must be normal to axis");
    }
    return Vector.from(reference);
}

/** The value, or a `GeometryError` naming the range it left (build123d raises `ValueError`). */
export function withinRange(value: number, range: JointRange, name: string): number {
    if (value < range[0] || value > range[1]) {
        throw new GeometryError(
            `${name} (${value}) must be in the range (${range[0]}, ${range[1]})`,
        );
    }
    return value;
}

/** The midpoint build123d defaults a linear position to. */
export function midpoint(range: JointRange): number {
    return (range[0] + range[1]) / 2;
}
