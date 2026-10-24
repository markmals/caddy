// Conforming planar geometry to a curved surface: projecting a curve onto the surface a face sits
// on, reading a spline edge's poles, the parameters where two curves come closest, and rejoining
// edges that were projected one by one.

import type { Shape, Vec3 } from "./types.ts";

import { addon } from "./addon.ts";
import { vec3 } from "./types.ts";

interface WrapAddon {
    projectEdgeOnFace(edge: Shape, face: Shape): Shape;
    edgeSplinePoles(edge: Shape): Float64Array;
    curveExtremaParameters(first: Shape, second: Shape): Float64Array;
    fixWireConnections(edges: readonly Shape[], precision: number): Shape;
}

function native(): WrapAddon {
    return addon<WrapAddon>();
}

/** The edge's curve projected onto the surface of `face`, as an edge spanning the projection. */
export function projectEdgeOnFace(edge: Shape, face: Shape): Shape {
    return native().projectEdgeOnFace(edge, face);
}

/** The control points of a spline edge's curve. */
export function edgeSplinePoles(edge: Shape): Vec3[] {
    let coordinates = native().edgeSplinePoles(edge);
    return Array.from({ length: coordinates.length / 3 }, (_, index) =>
        vec3(coordinates, 3 * index),
    );
}

/**
 * The parameters on both curves of the first extremum between the two edges, or `undefined` when
 * the curves have none.
 */
export function curveExtremaParameters(
    first: Shape,
    second: Shape,
): [first: number, second: number] | undefined {
    let parameters = native().curveExtremaParameters(first, second);
    if (parameters.length < 2) return undefined;
    return [parameters[0] as number, parameters[1] as number];
}

/** A wire from `edges`, reordered and with the gaps between them up to `precision` closed. */
export function fixWireConnections(edges: readonly Shape[], precision: number): Shape {
    return native().fixWireConnections(edges, precision);
}
