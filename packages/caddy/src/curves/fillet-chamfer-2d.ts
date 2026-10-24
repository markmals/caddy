/** Rounding and cutting the corners of planar faces and wires
 * (build123d `Face.fillet_2d`, `Face.chamfer_2d`, `Wire.fillet_2d`, `Wire.chamfer_2d`). */

import { ShapeType, construct, query, shapes, topology } from "@roonieone/occt-native";

import type { Edge } from "../topology/edge.ts";
import type { Face } from "../topology/face.ts";
import type { Vertex } from "../topology/vertex.ts";
import type { Wire } from "../topology/wire.ts";

import { GeometryError } from "../errors.ts";
import { native } from "../topology/kernel.ts";
import { Shape } from "../topology/shape.ts";
import { castFace, castWire } from "./cast.ts";
import { filletWireCorner } from "./fillet-wire-corner.ts";

/** The two edges meeting at `vertex`, with `reference` first when one is given. */
function cornerEdges(face: Face, vertex: Vertex, reference?: Edge): [Edge, Edge] {
    let incident = native("Chamfer 2D", () =>
        topology.ancestors(face.wrapped, vertex.wrapped, ShapeType.Edge),
    );
    if (incident.length < 2) {
        throw new GeometryError("A chamfered vertex must join two edges");
    }
    let first = Shape.cast(incident[0]!) as Edge;
    let second = Shape.cast(incident[incident.length - 1]!) as Edge;
    if (reference === undefined) return [first, second];
    if (shapes.isSame(first.wrapped, reference.wrapped)) return [first, second];
    if (shapes.isSame(second.wrapped, reference.wrapped)) return [second, first];
    throw new GeometryError("reference edge not in edges");
}

/** Replaces each listed corner of a planar face with a tangent arc. */
export function filletFace2D(face: Face, radius: number, vertices: Iterable<Vertex>): Face {
    let corners = [...vertices].map(vertex => vertex.wrapped);
    if (corners.length === 0) return face;
    return castFace("Fillet 2D", () => construct.filletFace2d(face.wrapped, corners, radius));
}

/**
 * Cuts each listed corner of a planar face, `distance` back along the first edge of the corner
 * and `distance2` along the second; `reference` picks which edge counts as the first.
 */
export function chamferFace2D(
    face: Face,
    distance: number,
    distance2: number,
    vertices: Iterable<Vertex>,
    reference?: Edge,
): Face {
    let corners = [...vertices];
    if (corners.length === 0) return face;
    let pairs = corners.map(vertex => cornerEdges(face, vertex, reference));
    return castFace("Chamfer 2D", () =>
        construct.chamferFace2d(
            face.wrapped,
            pairs.map(pair => pair[0].wrapped),
            pairs.map(pair => pair[1].wrapped),
            distance,
            distance2,
        ),
    );
}

/** The planar face a closed wire bounds, which the 2D operations work on. */
function faceOf(wire: Wire): Face {
    return castFace("Face", () => construct.makeFace(wire.wrapped, []));
}

function requireClosed(wire: Wire, operation: string): void {
    if (!query.isClosed(wire.wrapped)) {
        throw new GeometryError(`${operation} needs a closed planar wire`);
    }
}

/**
 * The wire with its listed corners rounded: a closed wire is filleted as the face it bounds,
 * while an open one is rebuilt corner by corner with the tangent-arc solver.
 */
export function filletWire2D(wire: Wire, radius: number, vertices: Iterable<Vertex>): Wire {
    if (!query.isClosed(wire.wrapped)) {
        return [...vertices].reduce(
            (filleted, vertex) => filletWireCorner(filleted, vertex.center(), radius),
            wire,
        );
    }
    let filleted = filletFace2D(faceOf(wire), radius, vertices);
    return castWire("Fillet 2D", () => query.outerWire(filleted.wrapped));
}

/** The outer wire of the face the wire bounds, with its corners cut. */
export function chamferWire2D(
    wire: Wire,
    distance: number,
    distance2: number,
    vertices: Iterable<Vertex>,
    reference?: Edge,
): Wire {
    requireClosed(wire, "2D chamfer");
    let chamfered = chamferFace2D(faceOf(wire), distance, distance2, vertices, reference);
    return castWire("Chamfer 2D", () => query.outerWire(chamfered.wrapped));
}
