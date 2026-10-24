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

/** Options of {@link makeSurface} and {@link Face.makeSurface}. */
export interface SurfaceOptions {
    /** Points the surface is pulled through, besides the boundary. */
    readonly surfacePoints?: readonly VectorLike[];
    /** Wires cutting holes into the surface. */
    readonly interiorWires?: Iterable<Wire>;
}

/**
 * Possibly non-planar face bounded by `exterior`, pulled towards `surfacePoints` and pierced by
 * `interiorWires` (build123d `Face.make_surface`).
 */
export function makeSurface(exterior: Wire | Iterable<Edge>, options: SurfaceOptions = {}): Face {
    let boundary = Symbol.iterator in exterior ? [...exterior] : exterior.edges();
    let edges = boundary.map(edge => edge.wrapped);
    let points = (options.surfacePoints ?? []).map(point => Vector.from(point).toTuple());
    let holes = [...(options.interiorWires ?? [])].map(wire => wire.wrapped);
    return castFace("Face.makeSurface", () => construct.makeSurfaceFace(edges, points, holes));
}
