/** Naming the outline of a planar face (build123d `Face.geometry`). */

import type { Edge } from "./edge.ts";
import type { Face } from "./face.ts";
import type { Vertex } from "./vertex.ts";

import { GeomType, SortBy } from "./enums.ts";

/** What a planar face's straight-edged outline is, as `Face#geometry` reports it. */
export type FaceGeometry = "POLYGON" | "RECTANGLE" | "SQUARE";

/**
 * The outline of a planar face bounded by straight edges, or `undefined` for a curved face or
 * one with a curved edge. A four-sided outline whose corners are all square is a rectangle, and
 * a square when its edges are equally long.
 */
export function faceGeometry(face: Face): FaceGeometry | undefined {
    if (face.isPlanar === undefined) {
        return undefined;
    }
    let edges = face.edges();
    if (!edges.every(edge => edge.geomType === GeomType.Line)) {
        return undefined;
    }
    if (edges.length !== 4 || !face.vertices().every(vertex => isSquareCorner(edges, vertex))) {
        return "POLYGON";
    }
    return edges.groupBy(SortBy.Length).length === 1 ? "SQUARE" : "RECTANGLE";
}

function isSquareCorner(edges: readonly Edge[], vertex: Vertex): boolean {
    let corner = edges.filter(edge => edge.vertices().some(candidate => candidate.isSame(vertex)));
    if (corner.length !== 2) {
        return false;
    }
    // build123d compares the corner angle to 90 degrees exactly.
    return corner[0]!.tangentAt(0).getAngle(corner[1]!.tangentAt(0)) === 90;
}
