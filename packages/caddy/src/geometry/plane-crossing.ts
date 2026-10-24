import type { Plane } from "./plane.ts";

import { Vector } from "./vector.ts";

/** The line two planes share: a point on it and its unit direction. */
export interface PlaneCrossing {
    readonly position: Vector;
    readonly direction: Vector;
}

/** `Precision::Angular()`: below this crossing-angle sine OCCT calls the planes parallel. */
const PARALLEL_SINE = 1e-12;

/** Below this crossing-angle sine OCCT distrusts the computed origin and re-projects it. */
const REFINEMENT_ANGLE = 2e-6;

/** How far off either plane the origin may sit before refinement bothers to correct it. */
const REFINEMENT_DISTANCE = 1e-12;

/** Guards the division by `1 - cos²`, exactly as OCCT does. */
const DENOMINATOR_FLOOR = 1e-16;

/**
 * Where two non-parallel planes cross (`IntAna_QuadQuadGeo::Perform(gp_Pln, gp_Pln)`).
 *
 * Any point of the shared line would do; OCCT picks the mean of each plane's own in-plane step
 * towards the other, and callers compare against that exact point, so its arithmetic is
 * reproduced here rather than simplified.
 */
export function planeCrossing(first: Plane, second: Plane): PlaneCrossing | undefined {
    let firstNormal = first.zDir;
    let secondNormal = second.zDir;
    // The scaled cross product, not the unit direction: its magnitude is part of the arithmetic.
    let crossed = firstNormal.cross(secondNormal);
    let sine = crossed.length;
    if (sine <= PARALLEL_SINE) {
        return undefined;
    }
    let direction = crossed.divide(sine);

    let cosine = firstNormal.dot(secondNormal);
    let complement = 1 - cosine * cosine;
    let denominator = Math.abs(complement) <= DENOMINATOR_FLOOR ? DENOMINATOR_FLOOR : complement;
    let between = first.origin.sub(second.origin);
    let position = first.origin
        .add(firstNormal.cross(crossed).multiply(secondNormal.dot(between) / denominator))
        .add(second.origin)
        .add(secondNormal.cross(crossed).multiply(firstNormal.dot(between) / denominator))
        .divide(2);

    if (sine >= REFINEMENT_ANGLE) {
        return { position, direction };
    }
    return refined(position, first, second, direction);
}

/**
 * At a shallow crossing angle the mean above is off by far more than a rounding error, so OCCT
 * drops the point back onto the first plane along its normal and then slides it along the shared
 * line's perpendicular until it reaches the second plane.
 */
function refined(
    position: Vector,
    first: Plane,
    second: Plane,
    direction: Vector,
): PlaneCrossing | undefined {
    let offFirst = position.sub(first.origin).dot(first.zDir);
    let offSecond = position.sub(second.origin).dot(second.zDir);
    if (Math.abs(offFirst) <= REFINEMENT_DISTANCE && Math.abs(offSecond) <= REFINEMENT_DISTANCE) {
        return { position, direction };
    }

    let onFirst = position.sub(first.zDir.multiply(offFirst));
    let across = direction.cross(first.zDir).normalized();
    let slope = second.zDir.dot(across);
    if (slope === 0) {
        return undefined;
    }
    let step = onFirst.sub(second.origin).dot(second.zDir) / slope;
    return { position: onFirst.sub(across.multiply(step)), direction };
}
