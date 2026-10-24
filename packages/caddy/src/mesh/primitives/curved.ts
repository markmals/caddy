/**
 * What the cylinder and sphere detectors share: the local curvature signature that classifies a
 * face as plausibly curved, the per-face score that decides whether a face joins a fitted patch,
 * and the flood fill that grows a patch across its neighbours and refits it to what it claimed.
 *
 * The signature is the set of circumradii implied by each neighbour: a sphere's are all alike,
 * a cylinder's split into a short radius across the curve and a long one along it, and a plane's
 * are infinite.
 */

import type { FaceSample, MeshIndex } from "./mesh-index.ts";
import type { CylinderPatch, SpherePatch } from "./patches.ts";

import { circumradius, EPS, mean } from "./numeric.ts";

/** How close a face normal must stay to the fitted surface normal to join a patch. */
const NORMAL_ERROR_LIMIT = 0.03;

/** The circumradii a face's manifold neighbours imply, ascending. */
export function faceRadiusSignature(
    meshIndex: MeshIndex,
    faceIndex: number,
    allowed: ReadonlySet<number>,
): number[] {
    let sample = meshIndex.samples[faceIndex]!;
    let estimates: number[] = [];
    for (let { index, midpoint } of meshIndex.edgeAdjacency[faceIndex]!) {
        if (!allowed.has(index)) continue;
        let radius = circumradius(sample.center, meshIndex.samples[index]!.center, midpoint);
        estimates.push(radius ?? Infinity);
    }
    return estimates.sort((a, b) => a - b);
}

/** The spread of a signature relative to its midpoint; `Infinity` when it says nothing. */
export function relativeRadiusSpread(signature: readonly number[]): number {
    let finite = signature.filter(value => Number.isFinite(value));
    if (finite.length < 3) return Infinity;
    let low = finite[0]!;
    let mid = finite[Math.floor(finite.length / 2)]!;
    let high = finite[finite.length - 1]!;
    if (mid <= EPS) return Infinity;
    return (high - low) / mid;
}

/** How badly a face misses a cylinder, or `undefined` when it misses it outright. */
export function cylinderFaceError(
    sample: FaceSample,
    patch: CylinderPatch,
    shapeScale: number,
): number | undefined {
    let offset = sample.center.sub(patch.axisPoint);
    let radial = offset.sub(patch.axisDirection.multiply(offset.dot(patch.axisDirection)));
    if (radial.length <= EPS) return undefined;
    return surfaceError(
        radial.length,
        radial.normalized().dot(sample.normal),
        patch.radius,
        shapeScale,
    );
}

/** How badly a face misses a sphere, or `undefined` when it misses it outright. */
export function sphereFaceError(
    sample: FaceSample,
    patch: SpherePatch,
    shapeScale: number,
): number | undefined {
    let radial = patch.center.sub(sample.center);
    if (radial.length <= EPS) return undefined;
    return surfaceError(
        radial.length,
        radial.normalized().dot(sample.normal),
        patch.radius,
        shapeScale,
    );
}

function surfaceError(
    distance: number,
    alignment: number,
    radius: number,
    shapeScale: number,
): number | undefined {
    let radiusError = Math.abs(distance - radius);
    let normalError = 1 - Math.abs(alignment);
    let radiusTolerance = Math.max(shapeScale * 0.01, radius * 0.02);
    if (radiusError > radiusTolerance || normalError > NORMAL_ERROR_LIMIT) return undefined;
    return radiusError / Math.max(radiusTolerance, EPS) + normalError / NORMAL_ERROR_LIMIT;
}

/** Grow a cylinder across every adjacent face that still fits it, then refit radius and residual. */
export function growCylinderPatch(
    meshIndex: MeshIndex,
    patch: CylinderPatch,
    allowed: ReadonlySet<number>,
    shapeScale: number,
): CylinderPatch {
    let claimed = grow(meshIndex, patch.faceIndices, allowed, index =>
        cylinderFaceError(meshIndex.samples[index]!, patch, shapeScale),
    );
    let radii: number[] = [];
    let residuals: number[] = [];
    for (let index of [...claimed].sort((a, b) => a - b)) {
        let sample = meshIndex.samples[index]!;
        let offset = sample.center.sub(patch.axisPoint);
        let radial = offset.sub(patch.axisDirection.multiply(offset.dot(patch.axisDirection)));
        if (radial.length <= EPS) continue;
        radii.push(radial.length);
        residuals.push(1 - Math.abs(radial.normalized().dot(sample.normal)));
    }
    return {
        ...patch,
        faceIndices: claimed,
        radius: radii.length > 0 ? mean(radii) : patch.radius,
        residual: residuals.length > 0 ? mean(residuals) : patch.residual,
    };
}

/** Grow a sphere across every adjacent face that still fits it, then refit radius and residual. */
export function growSpherePatch(
    meshIndex: MeshIndex,
    patch: SpherePatch,
    allowed: ReadonlySet<number>,
    shapeScale: number,
): SpherePatch {
    let claimed = grow(meshIndex, patch.faceIndices, allowed, index =>
        sphereFaceError(meshIndex.samples[index]!, patch, shapeScale),
    );
    let radii: number[] = [];
    let residuals: number[] = [];
    for (let index of [...claimed].sort((a, b) => a - b)) {
        let sample = meshIndex.samples[index]!;
        let radial = patch.center.sub(sample.center);
        if (radial.length <= EPS) continue;
        radii.push(radial.length);
        residuals.push(1 - Math.abs(radial.normalized().dot(sample.normal)));
    }
    return {
        ...patch,
        faceIndices: claimed,
        radius: radii.length > 0 ? mean(radii) : patch.radius,
        residual: residuals.length > 0 ? mean(residuals) : patch.residual,
    };
}

/**
 * The closure of `seeds` under "adjacent, allowed, and scored". The traversal order cannot
 * change the result because the score only depends on the face and the fixed patch.
 */
function grow(
    meshIndex: MeshIndex,
    seeds: ReadonlySet<number>,
    allowed: ReadonlySet<number>,
    score: (index: number) => number | undefined,
): Set<number> {
    let adjacency = meshIndex.adjacency;
    let claimed = new Set<number>();
    for (let index of seeds) {
        if (allowed.has(index)) claimed.add(index);
    }
    let frontier = [...claimed];
    while (frontier.length > 0) {
        let index = frontier.pop()!;
        for (let neighbour of adjacency[index]!) {
            if (claimed.has(neighbour) || !allowed.has(neighbour)) continue;
            if (score(neighbour) === undefined) continue;
            claimed.add(neighbour);
            frontier.push(neighbour);
        }
    }
    return claimed;
}
