/**
 * build123d's wire-level repairs and queries: edge ordering, closing, stitching, trimming,
 * degenerate edge removal and geometric comparison.
 */

import { construct } from "@roonieone/occt-native";

import type { VectorLike } from "../../geometry/vector.ts";
import type { Edge } from "../edge.ts";

import { makeLine } from "../../curves/edge-makers.ts";
import { GeometryError } from "../../errors.ts";
import { TOLERANCE } from "../../geometry/constants.ts";
import { ShapeList } from "../shape-list.ts";
import { Wire } from "../wire.ts";
import { castWire } from "./cast.ts";

/** Options of {@link geomEqual}. */
export interface GeomEqualOptions {
    readonly tolerance?: number;
    /** Points sampled along curve types without an analytic comparison. */
    readonly samples?: number;
}

/**
 * build123d `Edge.close`: an open edge becomes the closed wire of itself and the straight edge
 * back to its start; one that already closes is returned unchanged.
 */
export function closeEdge(edge: Edge): Edge | Wire {
    return edge.isClosed ? edge : closeWire(new Wire([edge]));
}

/**
 * build123d `Wire.close`: an open wire gains a straight edge from its end back to its start; one
 * that already closes is returned unchanged.
 */
export function closeWire(wire: Wire): Wire {
    if (wire.isClosed) {
        return wire;
    }
    return Wire.combine([wire, makeLine(wire.endPoint(), wire.startPoint())]).first;
}

/** The wire's edges along its direction, each oriented to start where the previous one ends. */
export function orderEdges(wire: Wire): ShapeList<Edge> {
    let sorted = wire.edges().sortBy(wire);
    let ordered = new ShapeList<Edge>([sorted.first]);
    for (let edge of sorted.slice(1)) {
        let previous = ordered[ordered.length - 1]!;
        let gap = previous.positionAt(1).sub(edge.positionAt(0)).length;
        ordered.push(gap < TOLERANCE ? edge : edge.reversed());
    }
    return ordered;
}

/**
 * Compare two wires edge by edge, in wire order, so that independently built wires with the
 * same geometry compare equal (build123d `Wire.geom_equal`).
 */
export function geomEqual(wire: Wire, other: Wire, options: GeomEqualOptions = {}): boolean {
    let ours = orderEdges(wire);
    let theirs = orderEdges(other);
    if (ours.length !== theirs.length) {
        return false;
    }
    return ours.every((edge, index) => edge.geomEqual(theirs[index]!, options));
}

/** The chamfer's two edges, with `reference` first when one is given. */
export function orderChamferEdges(
    reference: Edge | undefined,
    edges: readonly [Edge, Edge],
): readonly [Edge, Edge] {
    if (reference === undefined) {
        return edges;
    }
    let [first, second] = edges;
    if (first.equals(reference)) {
        return edges;
    }
    if (second.equals(reference)) {
        return [second, first];
    }
    throw new GeometryError("reference edge not in edges");
}

/** Drop edges shorter than `precision` and close the gaps they leave behind. */
export function fixDegenerateEdges(wire: Wire, precision: number): Wire {
    return castWire("Wire.fixDegenerateEdges", () =>
        construct.fixWireframe(wire.wrapped, precision),
    );
}

/** One wire holding the edges of both; they must meet at a shared end. */
export function stitch(wire: Wire, other: Wire): Wire {
    return castWire("Wire.stitch", () => construct.stitchWires(wire.wrapped, other.wrapped));
}

/** build123d `Mixin1D._to_param`: a normalized position, or the position of a point on the wire. */
function toParam(wire: Wire, value: number | VectorLike): number {
    return typeof value === "number" ? value : wire.paramAtPoint(value);
}

/**
 * The part of the wire between two normalized positions (or two points on it), trimming the
 * edges the bounds fall inside and keeping the others whole.
 */
export function trim(wire: Wire, start: number | VectorLike, end: number | VectorLike): Wire {
    let [from, to] = [toParam(wire, start), toParam(wire, end)].sort((a, b) => a - b) as [
        number,
        number,
    ];
    let ordered = wire.edges().sortBy(wire);
    let onlyEdge = ordered.length === 1 ? ordered.first : undefined;
    if (onlyEdge !== undefined) {
        return new Wire([onlyEdge.trim(from, to)]);
    }

    let total = wire.length;
    let startLength = from * total;
    let endLength = to * total;
    let kept: Edge[] = [];
    let covered = 0;
    for (let edge of ordered) {
        let edgeStart = covered;
        let edgeEnd = covered + edge.length;
        covered = edgeEnd;
        if (edgeEnd <= startLength || edgeStart >= endLength) {
            continue;
        }
        if (edgeStart >= startLength && edgeEnd <= endLength) {
            kept.push(edge);
            continue;
        }
        let trimStart = (Math.max(startLength, edgeStart) - edgeStart) / edge.length;
        let trimEnd = (Math.min(endLength, edgeEnd) - edgeStart) / edge.length;
        if (Math.abs(trimEnd - trimStart) > TOLERANCE) {
            kept.push(edge.trim(trimStart, trimEnd));
        }
    }
    return new Wire(kept);
}
