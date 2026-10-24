// Tessellation and STL. Like `io`, every call runs on Node's worker pool and resolves a
// promise; the shape is deep-copied before the work starts.

import type { Shape } from "./types.ts";

import { addon } from "./addon.ts";

/** Deflection limits for `BRepMesh_IncrementalMesh`; build123d's `export_stl` defaults. */
export interface MeshOptions {
    /** Maximum distance between a curve and its tessellation. */
    readonly tolerance: number;
    /** Maximum angle, in radians, between subsequent segments of a polyline. */
    readonly angularTolerance: number;
}

/** Flat triangle soup: three floats per vertex and normal, three indices per triangle. */
export interface Triangles {
    readonly positions: Float64Array;
    readonly normals: Float64Array;
    readonly indices: Uint32Array;
}

/**
 * A {@link Triangles} soup that also carries the raw surface parameters of every node, plus the
 * per-face slices callers need to normalise those parameters and pack them into a UV atlas.
 *
 * Each `face*` array holds one entry per face, in the order the faces contributed to the mesh:
 * `faceUvOrigins` and `faceUvRanges` are the UV window the face's nodes span (a degenerate
 * extent reported as 1), `faceArcSizes` the arc lengths of its mid isoparametric curves, and
 * `faceFlags` a bit set of {@link FACE_REVERSED} and {@link FACE_HAS_UVS}.
 */
export interface UvTriangles extends Triangles {
    readonly uvs: Float64Array;
    readonly faceVertexCounts: Uint32Array;
    readonly faceTriangleCounts: Uint32Array;
    readonly faceUvOrigins: Float64Array;
    readonly faceUvRanges: Float64Array;
    readonly faceArcSizes: Float64Array;
    readonly faceFlags: Uint8Array;
}

/** The face is `TopAbs_REVERSED`, so its winding and normals were flipped. */
export const FACE_REVERSED = 1;
/** The face's triangulation carries UV nodes; without them `uvs` is zero for every node. */
export const FACE_HAS_UVS = 2;

export const DEFAULT_MESH_OPTIONS: MeshOptions = { tolerance: 1e-3, angularTolerance: 0.1 };

interface MeshAddon {
    stlWrite(
        shape: Shape,
        tolerance: number,
        angularTolerance: number,
        ascii: boolean,
    ): Promise<Uint8Array>;
    stlRead(bytes: Uint8Array): Promise<Shape>;
    shapeTessellate(shape: Shape, tolerance: number, angularTolerance: number): Promise<Triangles>;
    shapeMesh(shape: Shape, tolerance: number, angularTolerance: number): Promise<Shape>;
    shapeTessellateUvs(
        shape: Shape,
        tolerance: number,
        angularTolerance: number,
        surfaceNormals: boolean,
    ): Promise<UvTriangles>;
}

function native(): MeshAddon {
    return addon<MeshAddon>();
}

/** Meshes every face, then writes the merged triangulation as binary or ASCII STL. */
export function writeStl(
    shape: Shape,
    options: MeshOptions = DEFAULT_MESH_OPTIONS,
    ascii = false,
): Promise<Uint8Array> {
    return native().stlWrite(shape, options.tolerance, options.angularTolerance, ascii);
}

/** A single face carrying the STL triangulation, as build123d's `import_stl` returns. */
export function readStl(bytes: Uint8Array): Promise<Shape> {
    return native().stlRead(bytes);
}

/**
 * Triangulates `shape` and returns the merged mesh in world coordinates. Reversed faces get
 * their winding and normals flipped, so every triangle faces outward.
 */
export function tessellate(
    shape: Shape,
    options: MeshOptions = DEFAULT_MESH_OPTIONS,
): Promise<Triangles> {
    return native().shapeTessellate(shape, options.tolerance, options.angularTolerance);
}

/**
 * A copy of `shape` carrying a triangulation of every face (build123d `Shape.mesh`). Later
 * meshing calls reuse it when it is at least as fine as what they ask for.
 */
export function triangulate(
    shape: Shape,
    options: MeshOptions = DEFAULT_MESH_OPTIONS,
): Promise<Shape> {
    return native().shapeMesh(shape, options.tolerance, options.angularTolerance);
}

/**
 * {@link tessellate}, plus each node's parameters on the surface it came from — the raw input
 * to build123d's `Shape.tessellate_with_uvs`.
 *
 * `surfaceNormals` reports the normal the surface has at each node instead of the
 * triangulation's own, which is what OCCT's glTF writer stores.
 */
export function tessellateWithUvs(
    shape: Shape,
    options: MeshOptions = DEFAULT_MESH_OPTIONS,
    surfaceNormals = false,
): Promise<UvTriangles> {
    return native().shapeTessellateUvs(
        shape,
        options.tolerance,
        options.angularTolerance,
        surfaceNormals,
    );
}
