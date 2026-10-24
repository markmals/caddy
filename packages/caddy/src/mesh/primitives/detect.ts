/**
 * `detectPrimitives`: the analytic surfaces hiding in a triangle mesh.
 *
 * This is build123d's `brep_from_stl.detect_primitives`, port for port. The mesh is indexed
 * once, then four passes claim faces in order of how much evidence they stand on:
 *
 * 1. planes read off the cleaned mesh's large proxy faces, which are the surest of all;
 * 2. spheres, from regions whose local curvature is uniform;
 * 3. cylinders, from equal-area sewn bands and from locally cylindrical seeds;
 * 4. planes again, as the fallback that sweeps up whatever coplanar regions are left.
 *
 * Each accepted patch becomes one analytic `Face`, the mesh faces nothing claimed come back as
 * leftovers, and every primitive is written out as the TypeScript that rebuilds it.
 *
 * Primitives come back in the order build123d sorts its generated code by: the named plane the
 * code places the shape on, then that plane's offset. Where several primitives share that key
 * build123d leaves them in the order its detectors found them, which depends on the order
 * CPython happens to walk a `set` of face indices — a hash-table artefact, different for every
 * set of indices. Caddy walks those sets in ascending index order instead, so a tie can come
 * out in a different order here than in build123d. Everything either side detects, and
 * everything either side writes about it, is the same; only the sequence within one tie moves.
 */

import type { Face } from "../../topology/face.ts";
import type { Shape } from "../../topology/shape.ts";
import type { DetectedPatch } from "./patches.ts";

import { ShapeList } from "../../topology/shape-list.ts";
import { shapesToCode } from "./code.ts";
import { detectCylinders } from "./cylinders.ts";
import { MeshIndex } from "./mesh-index.ts";
import { buildCylinderFace, buildPlaneFace, buildSphereFace } from "./patches.ts";
import { detectPlanesFromCleanProxy, detectPlanesFromNormals } from "./planes.ts";
import { detectSpheres } from "./spheres.ts";

/** The variable name each kind of generated line gets, by the shape the line builds. */
const SHAPE_KEYS: readonly (readonly [string, string])[] = [
    ["Rectangle", "r"],
    ["Circle", "c"],
    ["Sphere", "s"],
];

/** Optional settings of {@link detectPrimitives}. */
export interface DetectPrimitivesOptions {
    /**
     * How many faces of a candidate region are paired up to vote on a cylinder's axis
     * (build123d's `max_pair_face_count`). The cost of the vote is quadratic in this, so a
     * dense mesh is sampled down to it; 64 by default, as in build123d.
     */
    readonly maxPairFaces?: number;
    /**
     * How many faces of a candidate cylinder contribute a radial line whose crossings locate
     * the axis (build123d's `max_intersection_face_count`). Also quadratic; 64 by default.
     */
    readonly maxIntersectionFaces?: number;
}

/** What `detectPrimitives` found in a mesh. */
export interface DetectedPrimitives {
    /** One analytic face per detected primitive, in the order the generated code builds them. */
    readonly faces: ShapeList<Face>;
    /** The mesh faces no primitive claimed. */
    readonly leftovers: ShapeList<Face>;
    /** TypeScript rebuilding each detected face, one statement per face, in the same order. */
    readonly code: string[];
}

/** Reconstruct approximate analytic primitives from a triangulated surface mesh. */
export function detectPrimitives(
    mesh: Shape,
    options: DetectPrimitivesOptions = {},
): DetectedPrimitives {
    let meshIndex = MeshIndex.fromShape(mesh);
    let sampling = {
        maxPairFaces: options.maxPairFaces ?? 64,
        maxIntersectionFaces: options.maxIntersectionFaces ?? 64,
    };

    let cleanPlanePatches = detectPlanesFromCleanProxy(mesh, meshIndex);
    let cleanPlaneIndices = claimedBy(cleanPlanePatches);

    let spherePatches = detectSpheres(mesh, meshIndex, cleanPlaneIndices);
    let blockedBySpheres = new Set([...cleanPlaneIndices, ...claimedBy(spherePatches)]);

    let cylinderPatches = detectCylinders(mesh, meshIndex, blockedBySpheres, sampling);
    let blockedByCylinders = new Set([...blockedBySpheres, ...claimedBy(cylinderPatches)]);

    let normalPlanePatches = detectPlanesFromNormals(mesh, meshIndex, blockedByCylinders);

    let patches: DetectedPatch[] = [
        ...cleanPlanePatches,
        ...cylinderPatches,
        ...spherePatches,
        ...normalPlanePatches,
    ];

    let primitives: Face[] = [];
    let claimed = new Set<number>();
    for (let patch of patches) {
        let supportFaces = meshIndex.faceSet(
            [...patch.faceIndices].sort((first, second) => first - second),
        );
        for (let index of patch.faceIndices) claimed.add(index);
        if (patch.kind === "plane") {
            primitives.push(buildPlaneFace(patch));
        } else if (patch.kind === "cylinder") {
            primitives.push(buildCylinderFace(patch, supportFaces));
        } else {
            primitives.push(buildSphereFace(patch, supportFaces));
        }
    }

    let leftoverIndices: number[] = [];
    for (let index = 0; index < meshIndex.count; index += 1) {
        if (!claimed.has(index)) leftoverIndices.push(index);
    }

    let generated = shapesToCode(primitives);
    let ordered = primitives
        .map((face, position) => ({ face, generated: generated[position]!, position }))
        .sort(
            (first, second) =>
                compareSortKeys(first.generated.sortKey, second.generated.sortKey) ||
                first.position - second.position,
        );

    // build123d numbers the statements with as many digits as the longest index needs.
    let digits = ordered.length > 0 ? Math.ceil(Math.log10(ordered.length)) : 0;
    let code = ordered.map((entry, index) => {
        let name = `${prefixFor(entry.generated.expression)}${String(index).padStart(digits, "0")}`;
        return entry.generated.expression === undefined
            ? `// ${name}: Error in generating planar rectangle`
            : `let ${name} = ${entry.generated.expression};`;
    });

    return {
        faces: new ShapeList(ordered.map(entry => entry.face)),
        leftovers: new ShapeList(meshIndex.faceSet(leftoverIndices)),
        code,
    };
}

/** build123d names a statement after the shape it builds, or `None` when it builds nothing. */
function prefixFor(expression: string | undefined): string {
    if (expression === undefined) return "None";
    return SHAPE_KEYS.find(([label]) => expression.includes(label))?.[1] ?? "None";
}

function compareSortKeys(
    first: readonly [string, number],
    second: readonly [string, number],
): number {
    if (first[0] !== second[0]) return first[0] < second[0] ? -1 : 1;
    return first[1] - second[1];
}

function claimedBy(patches: readonly DetectedPatch[]): Set<number> {
    let claimed = new Set<number>();
    for (let patch of patches) {
        for (let index of patch.faceIndices) claimed.add(index);
    }
    return claimed;
}
