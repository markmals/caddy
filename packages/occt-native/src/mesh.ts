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
