/**
 * Cylinder detection.
 *
 * The axis comes first: on a cylinder every pair of surface normals is perpendicular to the
 * axis, so their cross products all point along it, and the dominant cluster of those cross
 * products is the axis direction. Projected into the plane across that axis, the normals become
 * radial lines whose intersections pile up on the centre, and the dominant cluster of those
 * intersections is the axis position.
 *
 * Two searches feed that fit. Mesh faces of equal area, sewn into contiguous regions, catch the
 * regular bands a tessellator lays down around a cylinder; those are held to the strict bounded
 * check that a real cylindrical band has flat, parallel, equal-radius ends. Local patches grown
 * around faces with a cylinder-like curvature signature catch the rest, and only have to beat a
 * sphere fit. Fits that describe the same cylinder are merged at the end.
 */

import type { Vector } from "../../geometry/vector.ts";
import type { Shape } from "../../topology/shape.ts";
import type { FaceSample, MeshIndex } from "./mesh-index.ts";
import type { CylinderPatch } from "./patches.ts";

import { Face } from "../../topology/face.ts";
import { clusterPoints, clusterUnitVectors, largestCluster } from "./cluster.ts";
import { faceRadiusSignature, growCylinderPatch } from "./curved.ts";
import { uniqueFaceVertices } from "./mesh-index.ts";
import {
    canonicalizeDirection,
    circumradius,
    directionAngleDelta,
    EPS,
    evenlySpacedSubset,
    fitPlaneToPoints,
    intersect2dLines,
    mean,
    meanVector,
    pickNonCollinearTriplet,
    planeBasis,
    planePointDistances,
    standardDeviation,
} from "./numeric.ts";
import { fitLocalSphere } from "./spheres.ts";

const AREA_TOL_DIGITS = 5;
const PAIR_SIMILARITY_TOLERANCE = 0.35;
const ANISOTROPY_RATIO_THRESHOLD = 1.5;
const LOCAL_SEED_DEPTH = 2;
const MIN_COMPONENT_SIZE = 4;
/** How many faces of a region are sampled when voting on the axis and on its position. */
export interface CylinderSampling {
    readonly maxPairFaces: number;
    readonly maxIntersectionFaces: number;
}
/** Below this the two normals are too nearly parallel for their cross product to mean anything. */
const MIN_CROSS_LENGTH = 1e-3;
const AXIS_CLUSTER_EPS = 0.03;
const AXIS_CLUSTER_MIN_SAMPLES = 4;
const CENTER_CLUSTER_EPS_FACTOR = 0.03;
const MAX_RADIUS_SPREAD_RATIO = 0.15;
const MAX_FIT_RESIDUAL = 0.05;

/** Cylinders found among the faces no earlier detector claimed. */
export function detectCylinders(
    mesh: Shape,
    meshIndex: MeshIndex,
    blockedIndices: ReadonlySet<number>,
    sampling: CylinderSampling,
): CylinderPatch[] {
    let shapeScale = mesh.boundingBox.diagonal;
    let remaining = new Set<number>();
    for (let index = 0; index < meshIndex.count; index += 1) {
        if (!blockedIndices.has(index)) remaining.add(index);
    }
    let patches: CylinderPatch[] = [];

    for (let areaGroup of meshIndex.groupByArea(remaining, AREA_TOL_DIGITS)) {
        for (let component of Face.sewFaces(meshIndex.faceSet(areaGroup))) {
            let componentIndices = meshIndex
                .indicesFromComponent(component)
                .filter(index => remaining.has(index));
            if (componentIndices.length < MIN_COMPONENT_SIZE) continue;
            let patch = fitLocalCylinder(
                componentIndices.map(index => meshIndex.samples[index]!),
                shapeScale,
                sampling,
            );
            if (patch === undefined) continue;
            let finalized = finalizeCylinderPatch(
                meshIndex,
                patch,
                remaining,
                shapeScale,
                sampling,
                true,
            );
            if (finalized === undefined) continue;
            patches.push(finalized);
            for (let index of finalized.faceIndices) remaining.delete(index);
        }
    }

    let tried = new Set<number>();
    for (let seed of cylinderLikeFaceIndices(meshIndex, remaining)) {
        if (!remaining.has(seed) || tried.has(seed)) continue;
        tried.add(seed);
        let localIndices = meshIndex.patchAround(seed, remaining, LOCAL_SEED_DEPTH);
        if (localIndices.length < MIN_COMPONENT_SIZE) continue;
        let patch = fitLocalCylinder(
            localIndices.map(index => meshIndex.samples[index]!),
            shapeScale,
            sampling,
        );
        if (patch === undefined) continue;
        let finalized = finalizeCylinderPatch(
            meshIndex,
            patch,
            remaining,
            shapeScale,
            sampling,
            false,
        );
        if (finalized === undefined) continue;
        patches.push(finalized);
        for (let index of finalized.faceIndices) remaining.delete(index);
    }

    return mergeEquivalentCylinders(meshIndex, patches, shapeScale);
}

/** Grow a candidate, refit it to what it claimed, and check it before accepting it. */
function finalizeCylinderPatch(
    meshIndex: MeshIndex,
    patch: CylinderPatch,
    remaining: ReadonlySet<number>,
    shapeScale: number,
    sampling: CylinderSampling,
    requireBoundedValidation: boolean,
): CylinderPatch | undefined {
    let grown = growCylinderPatch(meshIndex, patch, remaining, shapeScale);
    if (grown.faceIndices.size < MIN_COMPONENT_SIZE) return undefined;

    let sortedIndices = [...grown.faceIndices].sort((first, second) => first - second);
    let grownSamples = sortedIndices.map(index => meshIndex.samples[index]!);
    let refit = fitLocalCylinder(grownSamples, shapeScale, sampling);
    if (refit !== undefined) {
        grown = growCylinderPatch(meshIndex, refit, remaining, shapeScale);
        if (grown.faceIndices.size < MIN_COMPONENT_SIZE) return undefined;
        sortedIndices = [...grown.faceIndices].sort((first, second) => first - second);
        grownSamples = sortedIndices.map(index => meshIndex.samples[index]!);
    }

    if (requireBoundedValidation) {
        if (!validateBoundedCylinder(grown, meshIndex.faceSet(sortedIndices), shapeScale)) {
            return undefined;
        }
    } else if (looksSpherical(grownSamples, grown, shapeScale)) {
        return undefined;
    }
    return grown;
}

/** A sphere that explains the same faces far better means this was never a cylinder. */
function looksSpherical(
    samples: readonly FaceSample[],
    patch: CylinderPatch,
    shapeScale: number,
): boolean {
    let sphere = fitLocalSphere(samples, shapeScale);
    return sphere !== undefined && sphere.residual <= patch.residual * 0.35;
}

/** The cylinder of best fit through a set of face samples, or `undefined` when there is none. */
export function fitLocalCylinder(
    samples: readonly FaceSample[],
    shapeScale: number,
    sampling: CylinderSampling,
): CylinderPatch | undefined {
    let axisSamples = evenlySpacedSubset(samples, sampling.maxPairFaces);
    let pairIndices: [number, number][] = [];
    let directions: Vector[] = [];
    for (let first = 0; first < axisSamples.length; first += 1) {
        for (let second = first + 1; second < axisSamples.length; second += 1) {
            let a = axisSamples[first]!;
            let b = axisSamples[second]!;
            let cross = a.normal.cross(b.normal);
            if (cross.length <= MIN_CROSS_LENGTH) continue;
            pairIndices.push([a.index, b.index]);
            directions.push(canonicalizeDirection(cross));
        }
    }
    if (directions.length === 0) return undefined;

    let axisMask = largestCluster(
        clusterUnitVectors(directions, AXIS_CLUSTER_EPS, AXIS_CLUSTER_MIN_SAMPLES),
    );
    if (axisMask === undefined) return undefined;

    let clusterDirections: Vector[] = [];
    let faceIndexSet = new Set<number>();
    for (let position = 0; position < directions.length; position += 1) {
        if (!axisMask[position]) continue;
        clusterDirections.push(directions[position]!);
        faceIndexSet.add(pairIndices[position]![0]);
        faceIndexSet.add(pairIndices[position]![1]);
    }
    let faceIndices = [...faceIndexSet].sort((first, second) => first - second);
    if (faceIndices.length < 4) return undefined;

    let faceGroup = samples.filter(sample => faceIndexSet.has(sample.index));
    let axisDirection = canonicalizeDirection(meanVector(clusterDirections));
    let [uVector, vVector] = planeBasis(axisDirection);

    let points2d: [number, number][] = [];
    let normals2d: [number, number][] = [];
    let axisCoords: number[] = [];
    for (let sample of evenlySpacedSubset(faceGroup, sampling.maxIntersectionFaces)) {
        let projectedU = sample.normal.dot(uVector);
        let projectedV = sample.normal.dot(vVector);
        let projectedLength = Math.sqrt(projectedU ** 2 + projectedV ** 2);
        if (projectedLength <= MIN_CROSS_LENGTH) continue;
        points2d.push([sample.center.dot(uVector), sample.center.dot(vVector)]);
        normals2d.push([projectedU / projectedLength, projectedV / projectedLength]);
        axisCoords.push(sample.center.dot(axisDirection));
    }
    if (points2d.length < 4) return undefined;

    let intersections: [number, number][] = [];
    for (let first = 0; first < points2d.length; first += 1) {
        for (let second = first + 1; second < points2d.length; second += 1) {
            let crossing = intersect2dLines(
                points2d[first]!,
                normals2d[first]!,
                points2d[second]!,
                normals2d[second]!,
            );
            if (crossing !== undefined) intersections.push(crossing);
        }
    }
    if (intersections.length < 4) return undefined;

    let centerMask = largestCluster(
        clusterPoints(intersections, shapeScale * CENTER_CLUSTER_EPS_FACTOR, 4),
    );
    if (centerMask === undefined) return undefined;
    let bestPoints = intersections.filter((_point, position) => centerMask[position]);
    let axisPoint = uVector
        .multiply(mean(bestPoints.map(point => point[0])))
        .add(vVector.multiply(mean(bestPoints.map(point => point[1]))))
        .add(axisDirection.multiply(mean(axisCoords)));

    let radii: number[] = [];
    let residuals: number[] = [];
    let alignments: number[] = [];
    for (let sample of faceGroup) {
        let offset = sample.center.sub(axisPoint);
        let radial = offset.sub(axisDirection.multiply(offset.dot(axisDirection)));
        if (radial.length <= EPS) continue;
        let alignment = radial.normalized().dot(sample.normal);
        radii.push(radial.length);
        alignments.push(alignment);
        residuals.push(1 - Math.abs(alignment));
    }
    if (radii.length === 0) return undefined;

    let radius = mean(radii);
    if (radius <= EPS || radius > shapeScale) return undefined;
    let residual = residuals.length > 0 ? mean(residuals) : 0;
    if (
        standardDeviation(radii) / Math.max(radius, EPS) > MAX_RADIUS_SPREAD_RATIO ||
        residual > MAX_FIT_RESIDUAL
    ) {
        return undefined;
    }
    return {
        kind: "cylinder",
        faceIndices: new Set(faceIndices),
        axisPoint,
        axisDirection,
        radius,
        normalSign: mean(alignments) >= 0 ? 1 : -1,
        residual,
    };
}

/**
 * Whether the support faces really form a bounded cylindrical band: a consistent radius, two
 * populated ends, each end flat, the two ends parallel, and both ends the same size.
 */
export function validateBoundedCylinder(
    patch: CylinderPatch,
    supportFaces: readonly Face[],
    shapeScale: number,
): boolean {
    let vertices = uniqueFaceVertices(supportFaces);
    if (vertices.length < 6) return false;

    let radialDistances: number[] = [];
    for (let vertex of vertices) {
        let offset = vertex.sub(patch.axisPoint);
        let radial = offset.sub(patch.axisDirection.multiply(offset.dot(patch.axisDirection)));
        if (radial.length <= EPS) continue;
        radialDistances.push(radial.length);
    }
    if (radialDistances.length === 0) return false;
    let radiusTolerance = Math.max(shapeScale * 0.01, patch.radius * 0.02);
    let radiusMean = mean(radialDistances);
    if (Math.abs(radiusMean - patch.radius) > radiusTolerance) return false;
    if (standardDeviation(radialDistances) / Math.max(radiusMean, EPS) > 0.08) return false;

    let center = meanVector(vertices);
    let negativeBin: Vector[] = [];
    let positiveBin: Vector[] = [];
    for (let vertex of vertices) {
        let axial = vertex.sub(center).dot(patch.axisDirection);
        (axial < 0 ? negativeBin : positiveBin).push(vertex);
    }
    if (negativeBin.length < 3 || positiveBin.length < 3) return false;
    if (
        negativeBin.length / vertices.length < 0.35 ||
        positiveBin.length / vertices.length < 0.35
    ) {
        return false;
    }

    let planeTolerance = shapeScale * 0.004;
    let endNormals: Vector[] = [];
    let endRadii: number[] = [];
    for (let bin of [negativeBin, positiveBin]) {
        let { origin, normal } = fitPlaneToPoints(bin);
        let distances = planePointDistances(bin, origin, normal);
        if (Math.max(...distances) > planeTolerance || mean(distances) > planeTolerance / 2) {
            return false;
        }
        endNormals.push(normal);
        let triplet = pickNonCollinearTriplet(bin);
        if (triplet === undefined) return false;
        let endRadius = circumradius(...triplet);
        if (endRadius === undefined || endRadius <= EPS) return false;
        endRadii.push(endRadius);
    }

    if (Math.abs(Math.abs(endNormals[0]!.dot(endNormals[1]!)) - 1) > 0.02) return false;

    let meanEndRadius = mean(endRadii);
    if (meanEndRadius <= EPS) return false;
    let endSpread = Math.max(...endRadii.map(radius => Math.abs(radius - meanEndRadius)));
    if (endSpread / meanEndRadius > 0.12) return false;
    let bandSpread = Math.max(...radialDistances.map(radius => Math.abs(radius - meanEndRadius)));
    return bandSpread / meanEndRadius <= 0.2;
}

/** Fold together fits whose axis, position and radius all agree; one cylinder, one patch. */
export function mergeEquivalentCylinders(
    meshIndex: MeshIndex,
    patches: readonly CylinderPatch[],
    shapeScale: number,
): CylinderPatch[] {
    let groups: CylinderPatch[][] = [];
    for (let patch of patches) {
        let group = groups.find(candidate => {
            let representative = candidate[0]!;
            return (
                directionAngleDelta(representative.axisDirection, patch.axisDirection) <= 0.04 &&
                perpendicularAxisShift(representative, patch) <= shapeScale * 0.015 &&
                Math.abs(representative.radius - patch.radius) /
                    Math.max(representative.radius, patch.radius, EPS) <=
                    0.12
            );
        });
        if (group === undefined) groups.push([patch]);
        else group.push(patch);
    }

    let merged: CylinderPatch[] = [];
    for (let group of groups) {
        if (group.length === 1) {
            merged.push(group[0]!);
            continue;
        }
        let faceIndices = new Set<number>();
        for (let patch of group) {
            for (let index of patch.faceIndices) faceIndices.add(index);
        }
        let axisDirection = canonicalizeDirection(
            meanVector(group.map(patch => patch.axisDirection)),
        );
        let axisPoint = meanVector(group.map(patch => patch.axisPoint));
        let radii: number[] = [];
        let residuals: number[] = [];
        for (let index of [...faceIndices].sort((first, second) => first - second)) {
            let sample = meshIndex.samples[index]!;
            let offset = sample.center.sub(axisPoint);
            let radial = offset.sub(axisDirection.multiply(offset.dot(axisDirection)));
            if (radial.length <= EPS) continue;
            radii.push(radial.length);
            residuals.push(1 - Math.abs(radial.normalized().dot(sample.normal)));
        }
        if (radii.length === 0) continue;
        let weighted = group.reduce(
            (total, patch) => total + patch.normalSign * patch.faceIndices.size,
            0,
        );
        merged.push({
            kind: "cylinder",
            faceIndices,
            axisPoint,
            axisDirection,
            radius: mean(radii),
            normalSign: weighted >= 0 ? 1 : -1,
            residual:
                residuals.length > 0 ? mean(residuals) : mean(group.map(patch => patch.residual)),
        });
    }
    return merged;
}

/** How far apart two axes run, measured across their average direction. */
function perpendicularAxisShift(first: CylinderPatch, second: CylinderPatch): number {
    let average = canonicalizeDirection(
        meanVector([
            canonicalizeDirection(first.axisDirection),
            canonicalizeDirection(second.axisDirection),
        ]),
    );
    let delta = second.axisPoint.sub(first.axisPoint);
    return delta.sub(average.multiply(delta.dot(average))).length;
}

/**
 * Faces whose curvature signature looks cylindrical: the two short circumradii agree while the
 * long one stands out, which is what a tessellated cylinder's triangles report.
 */
function cylinderLikeFaceIndices(meshIndex: MeshIndex, allowed: ReadonlySet<number>): number[] {
    let candidates: number[] = [];
    for (let index of [...allowed].sort((first, second) => first - second)) {
        let finite = faceRadiusSignature(meshIndex, index, allowed).filter(value =>
            Number.isFinite(value),
        );
        if (finite.length < 2) continue;
        if (finite.length === 2) {
            let [low, high] = finite as [number, number];
            if (low <= EPS) continue;
            if ((high > EPS ? high / low : 0) >= ANISOTROPY_RATIO_THRESHOLD) candidates.push(index);
            continue;
        }
        let [low, mid, high] = finite as [number, number, number];
        if (low <= EPS || mid <= EPS) continue;
        if (
            Math.abs(mid - low) / mid <= PAIR_SIMILARITY_TOLERANCE &&
            (high > EPS ? high / mid : 0) >= ANISOTROPY_RATIO_THRESHOLD
        ) {
            candidates.push(index);
        }
    }
    return candidates;
}
