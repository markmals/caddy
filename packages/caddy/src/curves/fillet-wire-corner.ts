/** Rounding one corner of a wire with the tangent-arc solver, which works on open wires the
 * closed-face fillet cannot handle (build123d `_fillet_wire_corner`). */

import { GeometryError } from "../errors.ts";
import { TOLERANCE } from "../geometry/constants.ts";
import { Vector } from "../geometry/vector.ts";
import { Edge } from "../topology/edge.ts";
import { PositionMode } from "../topology/enums.ts";
import { ShapeHistory } from "../topology/shape-history.ts";
import { matchByMidpoint, recordRebuiltEdge } from "../topology/wire-record.ts";
import { Wire } from "../topology/wire.ts";
import { makeConstrainedArcs } from "./constrained.ts";
import { trimEdge } from "./edge-trim.ts";
import { Sagitta } from "./enums.ts";

/** The two edges meeting at a corner of a wire, with their places in the wire's edge list. */
interface WireCorner {
    readonly point: Vector;
    readonly edges: readonly [Edge, Edge];
    readonly indices: readonly [number, number];
    readonly allEdges: readonly Edge[];
}

/** The corner of `wire` at `point`, which must join exactly two of its edges. */
function cornerAt(wire: Wire, point: Vector): WireCorner {
    let allEdges = [...wire.edges()];
    let touching = allEdges
        .map((edge, index) => ({ edge, index }))
        .filter(({ edge }) =>
            edge.vertices().some(vertex => vertex.center().sub(point).length <= TOLERANCE),
        );
    if (touching.length === 0) {
        throw new GeometryError(`Could not find fillet vertex on wire: ${point.toString()}`);
    }
    if (touching.length !== 2) {
        throw new GeometryError(
            `A filleted vertex must join exactly two edges: ${point.toString()}`,
        );
    }
    let [first, second] = touching;
    return {
        point,
        edges: [first!.edge, second!.edge],
        indices: [first!.index, second!.index],
        allEdges,
    };
}

/**
 * Do the corner's edges continue smoothly into each other? build123d checks the tangents and then
 * confirms with a point reflected through the corner, which catches a cusp that doubles back
 * along the same tangent line.
 */
function isTangentContinuous(corner: WireCorner): boolean {
    let tangents = corner.edges.map(edge => edge.tangentAt(corner.point));
    if (tangents[0]!.cross(tangents[1]!).length > TOLERANCE) {
        return false;
    }
    let lengths = corner.edges.map(edge => edge.length);
    let sample = Math.max(
        Math.min(Math.min(...lengths) * 1e-3, ...lengths.map(length => length * 0.25)),
        TOLERANCE * 100,
    );
    let reflected = corner.edges.map(edge => {
        let atStart = edge.positionAt(0).sub(corner.point).length <= TOLERANCE;
        let along = atStart ? sample : edge.length - sample;
        return corner.point.multiply(2).sub(edge.positionAt(along, PositionMode.Length));
    });
    let gap = Math.min(
        corner.edges[1].distanceTo(reflected[0]!),
        corner.edges[0].distanceTo(reflected[1]!),
    );
    return gap <= Math.max(TOLERANCE * 10, sample * 0.25);
}

/** The piece of `edge` left after the fillet arc takes over up to `contact`. */
function trimmedToContact(edge: Edge, corner: Vector, contact: Vector): Edge | undefined {
    let position = edge.paramAtPoint(contact);
    let atStart = edge.positionAt(0).sub(corner).length <= TOLERANCE;
    let [start, end] = atStart ? [position, 1] : [0, position];
    if (end - start <= TOLERANCE) {
        return undefined;
    }
    return trimEdge(edge, start, end);
}

/** A rounded corner: the rebuilt wire, and the record of what the splice did to its edges. */
export interface RoundedCorner {
    readonly wire: Wire;
    /** Absent when the corner needed no rounding, so the wire came back as it was. */
    readonly record: ShapeHistory | undefined;
}

/**
 * `wire` with the corner at `point` replaced by a tangent arc of `radius`. A corner whose edges
 * already run smoothly into each other is left alone, as build123d does.
 */
export function filletWireCorner(wire: Wire, point: Vector, radius: number): RoundedCorner {
    let corner = cornerAt(wire, point);
    if (isTangentContinuous(corner)) {
        return { wire, record: undefined };
    }

    let arcs = makeConstrainedArcs([corner.edges[0], corner.edges[1]], {
        radius,
        sagitta: Sagitta.Both,
    });
    if (arcs.length === 0) {
        throw new GeometryError(
            `Fillet algorithm failed for ${point.toString()} with radius ${radius}`,
        );
    }
    let arc = arcs.sortByDistance(point).first;

    let trimmed = corner.edges.map(edge => {
        let contact = arc.vertices().sortByDistance(edge).first;
        return trimmedToContact(edge, point, contact.center());
    });

    return spliceCorner(corner, trimmed, arc);
}

/**
 * Rebuilds the wire with the corner's edges trimmed back and the arc inserted between them, and
 * records what became of each edge it was built from: the two beside the corner trimmed, the rest
 * copied as they were, and the arc made from the corner itself.
 */
function spliceCorner(
    corner: WireCorner,
    trimmed: readonly (Edge | undefined)[],
    arc: Edge,
): RoundedCorner {
    let edges: (Edge | undefined)[] = [...corner.allEdges];
    // Which edge of the original wire each entry came from; the arc came from no edge at all.
    let sources: (Edge | undefined)[] = [...corner.allEdges];
    corner.indices.forEach((index, which) => {
        edges[index] = trimmed[which];
    });

    let count = corner.allEdges.length;
    let insertAt =
        corner.indices[1] === (corner.indices[0]! + 1) % count
            ? corner.indices[0]! + 1
            : corner.indices[1]! + 1;
    for (let index of [...corner.indices].sort((left, right) => right - left)) {
        if (edges[index] === undefined) {
            edges.splice(index, 1);
            sources.splice(index, 1);
            if (index < insertAt) insertAt -= 1;
        }
    }
    edges.splice(insertAt, 0, arc);
    sources.splice(insertAt, 0, undefined);

    let spliced = edges.filter((edge): edge is Edge => edge !== undefined);
    let wire = new Wire(spliced);
    let record = ShapeHistory.empty();
    let placed = matchByMidpoint(spliced, wire.edges());
    sources.forEach((source, index) => {
        let copy = placed[index];
        if (source !== undefined && copy !== undefined) {
            recordRebuiltEdge(record, source, copy);
        }
    });
    return { wire, record };
}
