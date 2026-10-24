/**
 * Sphere detection.
 *
 * Faces whose neighbour circumradii are all alike are spherical candidates; the connected,
 * sewn regions they form get an algebraic sphere fit — least squares on `x² + y² + z² + ax +
 * by + cz + d = 0` — which is then grown across the rest of the surface. Overlapping
 * detections of one surface are folded together at the end.
 */

import type { Shape } from "../../topology/shape.ts";
import type { FaceSample, MeshIndex } from "./mesh-index.ts";
import type { SpherePatch } from "./patches.ts";

import { Vector } from "../../geometry/vector.ts";
import { Face } from "../../topology/face.ts";
import { faceRadiusSignature, growSpherePatch, relativeRadiusSpread } from "./curved.ts";
import { EPS, leastSquares, mean, standardDeviation } from "./numeric.ts";

const SIMILARITY_TOLERANCE = 0.2;
const MIN_COMPONENT_SIZE = 6;
const RADIUS_STD_RATIO_LIMIT = 0.2;
const NORMAL_ERROR_LIMIT = 0.08;
const CENTER_TOLERANCE_FACTOR = 0.03;
const RADIUS_RATIO_TOLERANCE = 0.1;
const OVERLAP_RATIO_TOLERANCE = 0.5;

/** Spheres found among the faces no earlier detector claimed. */
export function detectSpheres(
    mesh: Shape,
    meshIndex: MeshIndex,
    blockedIndices: ReadonlySet<number>,
): SpherePatch[] {
    let shapeScale = mesh.boundingBox.diagonal;
    let remaining = new Set<number>();
    for (let index = 0; index < meshIndex.count; index += 1) {
        if (!blockedIndices.has(index)) remaining.add(index);
    }
    let patches: SpherePatch[] = [];

    for (let radiusGroup of sphereLikeComponents(meshIndex, remaining)) {
        for (let component of Face.sewFaces(meshIndex.faceSet(radiusGroup))) {
            let componentIndices = meshIndex
                .indicesFromComponent(component)
                .filter(index => remaining.has(index));
            if (componentIndices.length < MIN_COMPONENT_SIZE) continue;
            let patch = fitLocalSphere(
                componentIndices.map(index => meshIndex.samples[index]!),
                shapeScale,
            );
            if (patch === undefined) continue;
            let grown = growSpherePatch(meshIndex, patch, remaining, shapeScale);
            if (grown.faceIndices.size < MIN_COMPONENT_SIZE) continue;
            patches.push(grown);
            for (let index of grown.faceIndices) remaining.delete(index);
        }
    }

    return suppressDuplicateSpheres(patches, shapeScale * CENTER_TOLERANCE_FACTOR);
}

/** The algebraic sphere through the sample centres, rejected when it does not hold up. */
export function fitLocalSphere(
    samples: readonly FaceSample[],
    shapeScale: number,
): SpherePatch | undefined {
    if (samples.length < 4) return undefined;

    let rows: number[][] = [];
    let rhs: number[] = [];
    for (let sample of samples) {
        let { x, y, z } = sample.center;
        rows.push([x, y, z, 1]);
        rhs.push(-(x * x + y * y + z * z));
    }
    let fit = leastSquares(rows, rhs, 4);
    if (fit === undefined || fit.rank < 4) return undefined;

    let [a, b, c, d] = fit.solution as [number, number, number, number];
    let center = new Vector(-a / 2, -b / 2, -c / 2);
    if (center.dot(center) - d <= EPS) return undefined;

    let radii: number[] = [];
    let normalErrors: number[] = [];
    for (let sample of samples) {
        let radial = center.sub(sample.center);
        if (radial.length <= EPS) continue;
        radii.push(radial.length);
        normalErrors.push(1 - Math.abs(radial.normalized().dot(sample.normal)));
    }
    if (radii.length < 4) return undefined;

    let radius = mean(radii);
    if (radius <= EPS || radius > shapeScale) return undefined;
    if (standardDeviation(radii) / Math.max(radius, EPS) > RADIUS_STD_RATIO_LIMIT) return undefined;
    if ((normalErrors.length > 0 ? mean(normalErrors) : 0) > NORMAL_ERROR_LIMIT) return undefined;

    return {
        kind: "sphere",
        faceIndices: new Set(samples.map(sample => sample.index)),
        center,
        radius,
        residual: mean(radii.map(value => Math.abs(value - radius))),
    };
}

/** Connected components whose neighbour circumradii are uniform enough to be spherical. */
function sphereLikeComponents(meshIndex: MeshIndex, allowed: ReadonlySet<number>): number[][] {
    let sphereLike = new Set<number>();
    for (let index of [...allowed].sort((first, second) => first - second)) {
        let signature = faceRadiusSignature(meshIndex, index, allowed);
        if (signature.length === 0) continue;
        if (relativeRadiusSpread(signature) <= SIMILARITY_TOLERANCE) sphereLike.add(index);
    }
    return meshIndex.connectedComponents(sphereLike);
}

/** Drop detections that describe a surface an earlier, tighter detection already covers. */
export function suppressDuplicateSpheres(
    patches: readonly SpherePatch[],
    centerTolerance: number,
): SpherePatch[] {
    let ordered = patches
        .map((patch, position) => ({ patch, position }))
        .sort(
            (first, second) =>
                first.patch.residual - second.patch.residual ||
                second.patch.faceIndices.size - first.patch.faceIndices.size ||
                first.position - second.position,
        )
        .map(entry => entry.patch);

    let kept: SpherePatch[] = [];
    for (let patch of ordered) {
        let duplicate = kept.some(other => {
            let centerShift = patch.center.sub(other.center).length;
            let radiusDelta =
                Math.abs(patch.radius - other.radius) / Math.max(patch.radius, other.radius, EPS);
            let shared = [...patch.faceIndices].filter(index =>
                other.faceIndices.has(index),
            ).length;
            let overlap =
                shared / Math.max(Math.min(patch.faceIndices.size, other.faceIndices.size), 1);
            return (
                centerShift <= centerTolerance &&
                radiusDelta <= RADIUS_RATIO_TOLERANCE &&
                overlap >= OVERLAP_RATIO_TOLERANCE
            );
        });
        if (!duplicate) kept.push(patch);
    }
    return kept;
}
