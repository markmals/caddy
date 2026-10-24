/** Faces from curves beyond the plain `new Face(outerWire, innerWires)` constructor. */

import { construct } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/vector.ts";
import type { Edge } from "../topology/edge.ts";
import type { Face } from "../topology/face.ts";
import type { Wire } from "../topology/wire.ts";

import { Plane } from "../geometry/plane.ts";
import { Vector } from "../geometry/vector.ts";
import { castFace } from "./cast.ts";
import { makeWirePolygon } from "./wire-makers.ts";

/**
 * Rectangle centred on the plane's origin, `width` along its X axis. build123d builds this face
 * straight from the plane, so its normal is the plane's: the outline runs counter-clockwise,
 * unlike `Wire.makeRect`.
 */
export function makeFaceRect(width: number, height: number, plane: Plane = Plane.XY): Face {
    let corners: VectorLike[] = [
        [-width / 2, -height / 2, 0],
        [width / 2, -height / 2, 0],
        [width / 2, height / 2, 0],
        [-width / 2, height / 2, 0],
    ];
    let outline = makeWirePolygon(corners.map(corner => plane.fromLocalCoords(corner)));
    return castFace("Face.makeRect", () => construct.makeFace(outline.wrapped, []));
}

/**
 * Possibly non-planar face bounded by `exterior`, pulled towards `surfacePoints` and pierced by
 * `interiorWires` (build123d `Face.make_surface`).
 */
export function makeSurface(
    exterior: Wire | Iterable<Edge>,
    surfacePoints: readonly VectorLike[] = [],
    interiorWires: Iterable<Wire> = [],
): Face {
    let boundary = Symbol.iterator in exterior ? [...exterior] : exterior.edges();
    let edges = boundary.map(edge => edge.wrapped);
    let points = surfacePoints.map(point => Vector.from(point).toTuple());
    let holes = [...interiorWires].map(wire => wire.wrapped);
    return castFace("Face.makeSurface", () => construct.makeSurfaceFace(edges, points, holes));
}
