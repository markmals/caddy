/**
 * Plane detection, in the two passes `brep_from_stl` runs.
 *
 * The first pass is the high-confidence one: unifying coplanar triangles with the kernel's own
 * cleaner yields large proxy faces, and every mesh face lying in a proxy's plane and inside its
 * outline belongs to that plane. The second pass is the fallback that runs last, after the
 * curved detectors have taken their faces: whatever connected regions still share a normal
 * become planes if a least-squares fit through their vertices holds.
 */

import type { BoundingBox } from "../../geometry/bounding-box.ts";
import type { Shape } from "../../topology/shape.ts";
import type { MeshIndex } from "./mesh-index.ts";
import type { PlanePatch } from "./patches.ts";

import { roundTo } from "../../geometry/rounding.ts";
import { uniqueFaceVertices } from "./mesh-index.ts";
import {
    canonicalizeDirection,
    fitPlaneToPoints,
    mean,
    planeBasis,
    planePointDistances,
} from "./numeric.ts";

/** Thresholds of the clean-proxy pass, as fractions of the mesh's bounding-box diagonal. */
const PROXY = {
    normalTolerance: 1e-3,
    planeToleranceFactor: 0.002,
    bboxToleranceFactor: 0.002,
    insideToleranceFactor: 0.002,
    minEdges: 4,
    minAreaRatio: 0.5,
} as const;

/** Thresholds of the normal-grouping fallback pass. */
const FALLBACK = {
    planeToleranceFactor: 0.003,
    normalTolerance: 0.01,
    normalDigits: 3,
    minComponentSize: 2,
    minTwoFaceAreaFactor: 0.05,
} as const;

/** Planes found from the cleaned mesh's large proxy faces. */
export function detectPlanesFromCleanProxy(mesh: Shape, meshIndex: MeshIndex): PlanePatch[] {
    let shapeScale = mesh.boundingBox.diagonal;
    let planeTolerance = shapeScale * PROXY.planeToleranceFactor;
    let bboxTolerance = shapeScale * PROXY.bboxToleranceFactor;
    let insideTolerance = shapeScale * PROXY.insideToleranceFactor;

    let proxyFaces = mesh.clean().faces.filter(face => face.edges.length >= PROXY.minEdges);
    if (proxyFaces.length === 0) return [];
    let maxArea = Math.max(...proxyFaces.map(face => face.area));
    proxyFaces = proxyFaces.filter(face => face.area >= maxArea * PROXY.minAreaRatio);

    let patches: PlanePatch[] = [];
    for (let proxyFace of proxyFaces) {
        let proxyNormal = canonicalizeDirection(proxyFace.normalAt());
        let proxyCenter = proxyFace.center;
        let proxyBox = proxyFace.boundingBox;

        let matchedIndices: number[] = [];
        let distances: number[] = [];
        for (let sample of meshIndex.samples) {
            if (1 - Math.abs(sample.normal.dot(proxyNormal)) > PROXY.normalTolerance) continue;
            let distance = Math.abs(sample.center.sub(proxyCenter).dot(proxyNormal));
            if (distance > planeTolerance) continue;
            if (!boundingBoxesOverlap(sample.face.boundingBox, proxyBox, bboxTolerance)) continue;
            if (!proxyFace.isInside(sample.center, insideTolerance)) continue;
            matchedIndices.push(sample.index);
            distances.push(distance);
        }
        if (matchedIndices.length < 2) continue;

        let vertices = uniqueFaceVertices(meshIndex.faceSet(matchedIndices));
        let [uVector, vVector] = planeBasis(proxyNormal);
        let uValues = vertices.map(vertex => vertex.sub(proxyCenter).dot(uVector));
        let vValues = vertices.map(vertex => vertex.sub(proxyCenter).dot(vVector));
        patches.push({
            kind: "plane",
            faceIndices: new Set(matchedIndices),
            origin: proxyCenter,
            normal: proxyNormal,
            uMin: Math.min(...uValues),
            uMax: Math.max(...uValues),
            vMin: Math.min(...vValues),
            vMax: Math.max(...vValues),
            residual: mean(distances),
        });
    }
    return patches;
}

/** Planes found by growing connected regions of faces that already share a normal. */
export function detectPlanesFromNormals(
    mesh: Shape,
    meshIndex: MeshIndex,
    blockedIndices: ReadonlySet<number>,
): PlanePatch[] {
    let shapeScale = mesh.boundingBox.diagonal;
    let patches: PlanePatch[] = [];
    let remaining = new Set<number>();
    for (let index = 0; index < meshIndex.count; index += 1) {
        if (!blockedIndices.has(index)) remaining.add(index);
    }

    for (let component of planeLikeComponents(meshIndex, remaining)) {
        let componentIndices = component.filter(index => remaining.has(index));
        if (componentIndices.length < FALLBACK.minComponentSize) continue;
        if (
            componentIndices.length === 2 &&
            componentIndices.reduce((total, index) => total + meshIndex.faces[index]!.area, 0) <
                shapeScale ** 2 * FALLBACK.minTwoFaceAreaFactor
        ) {
            continue;
        }
        let patch = buildPlanePatch(meshIndex, componentIndices, shapeScale);
        if (patch === undefined) continue;
        patches.push(patch);
        for (let index of patch.faceIndices) remaining.delete(index);
    }
    return patches;
}

/** A plane fitted to candidate faces, or `undefined` when the fit or the normals do not hold. */
export function buildPlanePatch(
    meshIndex: MeshIndex,
    faceIndices: readonly number[],
    shapeScale: number,
): PlanePatch | undefined {
    if (faceIndices.length < 2) return undefined;
    let vertices = uniqueFaceVertices(meshIndex.faceSet(faceIndices));
    if (vertices.length < 3) return undefined;

    let { origin, normal } = fitPlaneToPoints(vertices);
    let distances = planePointDistances(vertices, origin, normal);
    if (Math.max(...distances) > shapeScale * FALLBACK.planeToleranceFactor) return undefined;

    let normalErrors = faceIndices.map(
        index => 1 - Math.abs(meshIndex.samples[index]!.normal.dot(normal)),
    );
    if (normalErrors.length > 0 && Math.max(...normalErrors) > FALLBACK.normalTolerance) {
        return undefined;
    }

    let [uVector, vVector] = planeBasis(normal);
    let uValues = vertices.map(vertex => vertex.sub(origin).dot(uVector));
    let vValues = vertices.map(vertex => vertex.sub(origin).dot(vVector));
    return {
        kind: "plane",
        faceIndices: new Set(faceIndices),
        origin,
        normal,
        uMin: Math.min(...uValues),
        uMax: Math.max(...uValues),
        vMin: Math.min(...vValues),
        vMax: Math.max(...vValues),
        residual: distances.length > 0 ? mean(distances) : 0,
    };
}

/** Connected components of faces whose canonical normals agree to three decimals. */
function planeLikeComponents(meshIndex: MeshIndex, allowed: ReadonlySet<number>): number[][] {
    let groups = new Map<string, Set<number>>();
    for (let index of [...allowed].sort((a, b) => a - b)) {
        let normal = canonicalizeDirection(meshIndex.samples[index]!.normal);
        let key = normal
            .toTuple()
            .map(value => roundTo(value, FALLBACK.normalDigits) + 0)
            .join("|");
        let bucket = groups.get(key);
        if (bucket === undefined) groups.set(key, (bucket = new Set()));
        bucket.add(index);
    }
    let components: number[][] = [];
    for (let indices of groups.values()) {
        components.push(...meshIndex.connectedComponents(indices));
    }
    return components
        .map((value, position) => ({ value, position }))
        .sort((a, b) => b.value.length - a.value.length || a.position - b.position)
        .map(entry => entry.value);
}

/** Whether two axis-aligned boxes overlap, with `tolerance` of slack on every side. */
export function boundingBoxesOverlap(
    first: BoundingBox,
    second: BoundingBox,
    tolerance = 0,
): boolean {
    return !(
        first.max.x < second.min.x - tolerance ||
        second.max.x < first.min.x - tolerance ||
        first.max.y < second.min.y - tolerance ||
        second.max.y < first.min.y - tolerance ||
        first.max.z < second.min.z - tolerance ||
        second.max.z < first.min.z - tolerance
    );
}
