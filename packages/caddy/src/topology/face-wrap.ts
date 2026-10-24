/**
 * Wrapping planar shapes onto a curved surface (build123d `Face.wrap` and `Face.wrap_faces`): a
 * flat edge, wire or face defined on the XY plane is conformed to the curvature of a face, keeping
 * its edge lengths as closely as the distortion of the surface allows.
 */

import { wrap } from "@roonieone/occt-native";

import type { Edge } from "./edge.ts";
import type { WrapOptions } from "./face-wrap-edge.ts";

import { castWire } from "../curves/cast.ts";
import { makeLine } from "../curves/edge-makers.ts";
import { makeSurface } from "../curves/face-makers.ts";
import { makeWire } from "../curves/wire-makers.ts";
import { GeometryError } from "../errors.ts";
import { Location } from "../geometry/location.ts";
import { Plane } from "../geometry/plane.ts";
import { Vector } from "../geometry/vector.ts";
import { extendSplineOnSurface, wrapEdgeOnSurface } from "./face-wrap-edge.ts";
import { Face } from "./face.ts";
import { native } from "./kernel.ts";
import { ShapeList } from "./shape-list.ts";
import { Wire } from "./wire.ts";

/** Options of {@link Face#wrapFaces}. */
export interface WrapFacesOptions {
    /** Where along the path the first face starts, as a fraction of its length; defaults to 0. */
    readonly start?: number;
}

/** Lay a planar edge, wire or face onto `surface`, starting at `surfaceLocation`. */
export function wrapOnSurface(
    surface: Face,
    planarShape: Edge,
    surfaceLocation: Location,
    options?: WrapOptions,
): Edge;
export function wrapOnSurface(
    surface: Face,
    planarShape: Wire,
    surfaceLocation: Location,
    options?: WrapOptions,
): Wire;
export function wrapOnSurface(
    surface: Face,
    planarShape: Face,
    surfaceLocation: Location,
    options?: WrapOptions,
): Face;
export function wrapOnSurface(
    surface: Face,
    planarShape: Edge | Wire | Face,
    surfaceLocation: Location,
    options: WrapOptions = {},
): Edge | Wire | Face {
    if (planarShape instanceof Face) {
        return wrapFace(surface, planarShape, surfaceLocation, options);
    }
    if (planarShape instanceof Wire) {
        return wrapWire(surface, planarShape, surfaceLocation, options);
    }
    return wrapEdgeOnSurface(surface, planarShape, surfaceLocation, options);
}

/**
 * Lay `faces` onto `surface` along `path`, a curve on the surface: each face keeps its position
 * along the path's X extent, so a row of planar features stays laid out as it was drawn.
 */
export function wrapFacesOnSurface(
    surface: Face,
    faces: Iterable<Face>,
    path: Edge | Wire,
    options: WrapFacesOptions = {},
): ShapeList<Face> {
    let start = options.start ?? 0;
    let pathLength = path.length;
    let planarFaces = [...faces];
    let firstFace = planarFaces[0];
    if (firstFace === undefined) {
        throw new GeometryError("No faces to wrap");
    }
    let firstMinimumX = firstFace.boundingBox.min.x;

    return new ShapeList(
        planarFaces.map(face => {
            let box = face.boundingBox;
            let offset = (box.min.x + box.max.x) / 2 - firstMinimumX;
            let along = start + offset / pathLength;
            let position = path.positionAt(along);
            let frame = new Plane({
                origin: position,
                xDir: path.tangentAt(along),
                zDir: surface.normalAt(position),
            });
            let centered = face.translate([-offset, 0, 0]);
            return wrapFace(surface, centered, Location.fromPlane(frame), {});
        }),
    );
}

/** The face bounded by the wrapped perimeter and holes, facing the same way as the surface. */
function wrapFace(
    surface: Face,
    planarFace: Face,
    surfaceLocation: Location,
    options: WrapOptions,
): Face {
    let perimeter = wrapWire(surface, planarFace.outerWire, surfaceLocation, options);
    let holes = planarFace.innerWires.map(hole =>
        wrapWire(surface, hole, surfaceLocation, options),
    );
    let wrapped = makeSurface(perimeter, {
        surfacePoints: [surfaceLocation.position],
        interiorWires: holes,
    });
    let outwards = surfaceLocation.zAxis.direction;
    return outwards.dot(wrapped.normalAt(surfaceLocation.position)) < 0
        ? wrapped.reverseNormal()
        : wrapped;
}

/**
 * Wrap the wire edge by edge, each one starting where the previous one ended. A closed wire needs
 * its first and last edge rejoined afterwards: following the surface distorts them just enough to
 * leave a gap.
 */
function wrapWire(
    surface: Face,
    planarWire: Wire,
    surfaceLocation: Location,
    options: WrapOptions,
): Wire {
    let planarEdges = planarWire.orderEdges();
    let [firstEdge] = planarEdges;
    if (planarEdges.length === 1 && firstEdge !== undefined) {
        return makeWire([wrapEdgeOnSurface(surface, firstEdge, surfaceLocation, options)]);
    }

    let xDirection = surfaceLocation.xAxis.direction;
    let origin = new Vector();
    let wireStart = firstEdge === undefined ? origin : firstEdge.positionAt(0);
    let startsAtOrigin = wireStart.equals(origin);
    let onSurface = startsAtOrigin
        ? surfaceLocation.position
        : wrapEdgeOnSurface(
              surface,
              makeLine(origin, wireStart),
              surfaceLocation,
              options,
          ).positionAt(1);
    let planarEnd = startsAtOrigin ? origin : wireStart;

    let location = frameOnSurface(surface, onSurface, xDirection);
    let wrappedEdges: Edge[] = [];
    for (let planarEdge of planarEdges) {
        let wrapped = wrapEdgeOnSurface(
            surface,
            planarEdge.translate(planarEnd.negate()),
            location,
            options,
        );
        location = frameOnSurface(surface, wrapped.positionAt(1), xDirection);
        planarEnd = planarEdge.positionAt(1);
        wrappedEdges.push(wrapped);
    }

    if (!planarWire.isClosed) {
        return makeWire(wrappedEdges);
    }
    return closeWrappedWire(surface, wrappedEdges, options.extensionFactor ?? 0.1);
}

/** The frame a wrapped edge continues from: the surface's normal with the wrap's X direction. */
function frameOnSurface(surface: Face, point: Vector, xDirection: Vector): Location {
    return Location.fromPlane(
        new Plane({ origin: point, xDir: xDirection, zDir: surface.normalAt(point) }),
    );
}

/**
 * Extend the first and last wrapped edge until they cross, trim them at that crossing and close
 * what remains of the gap through `ShapeFix_Wire`.
 */
function closeWrappedWire(
    surface: Face,
    wrappedEdges: readonly Edge[],
    extensionFactor: number,
): Wire {
    let [head] = wrappedEdges;
    let tail = wrappedEdges.at(-1);
    if (head === undefined || tail === undefined) {
        throw new GeometryError("A wrapped wire needs at least one edge");
    }
    let first = extendSplineOnSurface(surface, head, { atStart: true, extensionFactor });
    let last = extendSplineOnSurface(surface, tail, { extensionFactor });
    let crossing = native("Face.wrap", () =>
        wrap.curveExtremaParameters(first.wrapped, last.wrapped),
    );
    if (crossing === undefined) {
        throw new GeometryError(
            "Extended first/last edges do not intersect; increase the extension factor",
        );
    }

    let trimmedFirst = first.trim(fractionAt(first, crossing[0]), 1);
    let trimmedLast = last.trim(0, fractionAt(last, crossing[1]));
    let closingError = trimmedFirst.positionAt(0).sub(trimmedLast.positionAt(1)).length;
    let joined = [trimmedFirst, ...wrappedEdges.slice(1, -1), trimmedLast];
    let wire = castWire("Face.wrap", () =>
        wrap.fixWireConnections(
            joined.map(edge => edge.wrapped),
            2 * closingError,
        ),
    );
    if (!wire.isValid) {
        throw new GeometryError("wrapped wire is not valid");
    }
    return wire;
}

/** Where a curve parameter falls in the edge's own 0..1 range. */
function fractionAt(edge: Edge, parameter: number): number {
    let [start, end] = [edge.paramAt(0), edge.paramAt(1)];
    return (parameter - start) / (end - start);
}
