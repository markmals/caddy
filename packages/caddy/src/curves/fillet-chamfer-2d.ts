/** Rounding and cutting the corners of planar faces and wires
 * (build123d `Face.fillet_2d`, `Face.chamfer_2d`, `Wire.fillet_2d`, `Wire.chamfer_2d`). */

import { ShapeType, construct, query, shapes, topology } from "@roonieone/occt-native";

import type { Edge } from "../topology/edge.ts";
import type { Face } from "../topology/face.ts";
import type { Vertex } from "../topology/vertex.ts";
import type { Wire } from "../topology/wire.ts";

import { GeometryError } from "../errors.ts";
import { native } from "../topology/kernel.ts";
import { madeBy, recordOf, ShapeHistory } from "../topology/shape-history.ts";
import { Shape } from "../topology/shape.ts";
import { joinRecord } from "../topology/wire-record.ts";
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

/**
 * Replaces each listed corner of a planar face with a tangent arc.
 *
 * build123d's `Face.fillet_2d` rounds each wire of the face and rebuilds the face from them, so
 * its sub-shapes come out in connection order and the result keeps the normal it had. The kernel's
 * own 2D fillet orders them as it pleases, so the face is rebuilt here too, and the record follows
 * the rebuild.
 *
 * That record says what the rounding did to the face's sub-shapes but names no inputs that were
 * already there, as build123d's does: it collects the records of the wire fillets it runs and
 * never sets their inputs, so everything the result holds counts as last and as new.
 */
export function filletFace2D(face: Face, radius: number, vertices: Iterable<Vertex>): Face {
    let corners = [...vertices].map(vertex => vertex.wrapped);
    if (corners.length === 0) return face;
    let rounded = native("Fillet 2D", () => construct.filletFace2d(face.wrapped, corners, radius));
    let filleted = Shape.cast(rounded.shape) as Face;
    let record = new ShapeHistory(rounded.history);
    return madeBy(inConnectionOrder(filleted, record), record);
}

/**
 * `face` rebuilt from its wires, whose edges a wire reports in connection order, keeping the
 * normal it had; `record` is extended with what the rebuild did to its sub-shapes.
 */
function inConnectionOrder(face: Face, record: ShapeHistory): Face {
    let wires = [face.outerWire, ...face.innerWires].map(wire =>
        castWire("Fillet 2D", () => construct.makeWire(wire.edges.map(edge => edge.wrapped))),
    );
    let [outer, ...inner] = wires;
    if (outer === undefined) return face;
    let rebuilt = castFace("Fillet 2D", () =>
        construct.makeFace(
            outer.wrapped,
            inner.map(wire => wire.wrapped),
        ),
    );
    if (rebuilt.normalAt().dot(face.normalAt()) < 0) {
        rebuilt = rebuilt.reverseNormal();
    }
    record.merge(joinRecord([...face.edges], [...rebuilt.edges], [], []));
    record.addModified(face.wrapped, rebuilt.wrapped);
    return rebuilt;
}

/**
 * Cuts each listed corner of a planar face, `distance` back along the first edge of the corner
 * and `distance2` along the second; `reference` picks which edge counts as the first. The record
 * says what the cut did to the face it worked on (build123d `Face.chamfer_2d`).
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
    let chamfered = native("Chamfer 2D", () =>
        construct.chamferFace2d(
            face.wrapped,
            pairs.map(pair => pair[0].wrapped),
            pairs.map(pair => pair[1].wrapped),
            distance,
            distance2,
        ),
    );
    return madeBy(
        Shape.cast(chamfered.shape) as Face,
        new ShapeHistory(chamfered.history, [face.wrapped]),
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
 * The outer wire of `reshaped`, answering for the operation that reshaped `source` into it. The
 * inputs are the face the 2D operation worked on, whose edges the record speaks about: building
 * the face from the wire copies them, so the wire's own edges are not what the record names.
 */
function reshapedWire(operation: string, source: Face, reshaped: Face): Wire {
    let outer = castWire(operation, () => query.outerWire(reshaped.wrapped));
    let record = recordOf(reshaped);
    return record === undefined ? outer : madeBy(outer, record.withInputs([source.wrapped], []));
}

/**
 * The wire with its listed corners rounded: a closed wire is filleted as the face it bounds,
 * while an open one is rebuilt corner by corner with the tangent-arc solver. Either way the result
 * carries the record of what became of the wire's edges (build123d `Wire.fillet_2d`).
 */
export function filletWire2D(wire: Wire, radius: number, vertices: Iterable<Vertex>): Wire {
    let corners = [...vertices];
    if (corners.length === 0) return wire;
    if (!query.isClosed(wire.wrapped)) {
        let record = ShapeHistory.empty([wire.wrapped]);
        let rounded = corners.reduce((filleted, vertex) => {
            let corner = filletWireCorner(filleted, vertex.center, radius);
            if (corner.record !== undefined) record.merge(corner.record);
            return corner.wire;
        }, wire);
        return rounded === wire ? wire : madeBy(rounded, record);
    }
    let base = faceOf(wire);
    return reshapedWire("Fillet 2D", base, filletFace2D(base, radius, corners));
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
    let corners = [...vertices];
    if (corners.length === 0) return wire;
    let base = faceOf(wire);
    return reshapedWire(
        "Chamfer 2D",
        base,
        chamferFace2D(base, distance, distance2, corners, reference),
    );
}
