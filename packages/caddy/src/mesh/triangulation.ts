/**
 * Caddy's view of a triangulated shape. The addon returns a flat triangle soup (positions,
 * normals and indices); build123d's `Shape.tessellate` returns vertices and index triples, which
 * is what this turns it into.
 */

import type * as occt from "@roonieone/occt-native";

import { Vector } from "../geometry/vector.ts";

/** How finely a shape is meshed, beyond the deflection every call takes positionally. */
export interface MeshOptions {
    /** Largest angle, in radians, between neighbouring segments of a polyline. Defaults to 0.1. */
    readonly angularTolerance?: number;
}

/** build123d's `(vertices, triangles)`: points in world coordinates and index triples into them. */
export interface Tessellation {
    readonly vertices: Vector[];
    readonly triangles: [number, number, number][];
}

/** build123d's default `angular_tolerance` for meshing. */
const DEFAULT_ANGULAR_TOLERANCE = 0.1;

export function meshDeflection(
    tolerance: number,
    options: MeshOptions,
): { tolerance: number; angularTolerance: number } {
    return {
        tolerance,
        angularTolerance: options.angularTolerance ?? DEFAULT_ANGULAR_TOLERANCE,
    };
}

export function tessellationOf(soup: occt.mesh.Triangles): Tessellation {
    let vertices: Vector[] = [];
    for (let index = 0; index + 2 < soup.positions.length; index += 3) {
        vertices.push(
            new Vector(soup.positions[index], soup.positions[index + 1], soup.positions[index + 2]),
        );
    }
    let triangles: [number, number, number][] = [];
    for (let index = 0; index + 2 < soup.indices.length; index += 3) {
        triangles.push([soup.indices[index]!, soup.indices[index + 1]!, soup.indices[index + 2]!]);
    }
    return { vertices, triangles };
}
