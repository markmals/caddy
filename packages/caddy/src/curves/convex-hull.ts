/** The smallest wire enclosing a set of planar edges (build123d `Wire.make_convex_hull`). */

import type { Edge } from "../topology/edge.ts";
import type { Wire } from "../topology/wire.ts";

import { GeometryError } from "../errors.ts";
import { makeLine } from "./edge-makers.ts";
import { trimEdge } from "./edge-trim.ts";
import { makeWire } from "./wire-makers.ts";

interface Sample {
    readonly edge: number;
    readonly parameter: number;
    readonly x: number;
    readonly y: number;
}

/** Which source edge a hull boundary segment runs between, at which curve positions. */
interface Connection {
    readonly from: Sample;
    readonly to: Sample;
}

function cross(origin: Sample, first: Sample, second: Sample): number {
    return (
        (first.x - origin.x) * (second.y - origin.y) - (first.y - origin.y) * (second.x - origin.x)
    );
}

/**
 * Indices of the hull boundary in counter-clockwise order (Andrew's monotone chain). Points on
 * the interior of a hull edge are dropped, and exact duplicates resolve to the lowest index, so
 * the boundary is the same set Qhull reports for build123d.
 */
function hullIndices(samples: readonly Sample[]): number[] {
    // Coincident samples (a closed curve repeats its start) collapse onto their first index, as
    // Qhull does for build123d, so the hull never bridges a point to itself.
    let firstOfPoint = new Map<string, number>();
    samples.forEach((sample, index) => {
        let key = `${sample.x},${sample.y}`;
        if (!firstOfPoint.has(key)) firstOfPoint.set(key, index);
    });
    let order = [...firstOfPoint.values()].sort((left, right) => {
        let a = samples[left]!;
        let b = samples[right]!;
        return a.x - b.x || a.y - b.y || left - right;
    });
    let build = (sequence: readonly number[]): number[] => {
        let chain: number[] = [];
        for (let index of sequence) {
            while (
                chain.length >= 2 &&
                cross(
                    samples[chain[chain.length - 2]!]!,
                    samples[chain.at(-1)!]!,
                    samples[index]!,
                ) <= 0
            ) {
                chain.pop();
            }
            chain.push(index);
        }
        chain.pop();
        return chain;
    };
    let lower = build(order);
    let upper = build([...order].reverse());
    return [...lower, ...upper];
}

/**
 * Samples every edge, takes the convex hull of the resulting cloud, and rebuilds it from the
 * original curves: hull segments that bridge two samples of different edges (or two
 * non-neighbouring samples of one edge) become straight edges, and the spans between them are
 * trimmed out of the source edges.
 */
export function makeConvexHull(edges: Iterable<Edge>, tolerance = 1e-3): Wire {
    let sources = [...edges];
    if (sources.length === 0) {
        throw new GeometryError("A convex hull needs at least one edge");
    }
    let fragmentsPerEdge = Math.trunc(2 / tolerance);
    let samples: Sample[] = [];
    sources.forEach((edge, index) => {
        for (let step = 0; step < fragmentsPerEdge; step++) {
            let parameter = step / (fragmentsPerEdge - 1);
            let position = edge.positionAt(parameter);
            samples.push({ edge: index, parameter, x: position.x, y: position.y });
        }
    });

    let boundary = hullIndices(samples);
    let connections: Connection[] = [];
    let trimIndices = new Map<number, number[]>();
    let markTrim = (edge: number, sample: number): void => {
        let marked = trimIndices.get(edge);
        if (marked === undefined) trimIndices.set(edge, [sample]);
        else marked.push(sample);
    };
    for (let position = 0; position < boundary.length; position++) {
        let start = boundary[position]!;
        let end = boundary[(position + 1) % boundary.length]!;
        let from = samples[start]!;
        let to = samples[end]!;
        if (from.edge !== to.edge) {
            markTrim(from.edge, start);
            markTrim(to.edge, end);
            connections.push({ from, to });
        } else if (Math.abs(start - end) !== 1) {
            let low = Math.min(start, end);
            let high = Math.max(start, end);
            markTrim(from.edge, low);
            markTrim(from.edge, high);
            connections.push({ from: samples[low]!, to: samples[high]! });
        }
    }

    let hullEdges = connections.map(({ from, to }) =>
        makeLine(
            sources[from.edge]!.positionAt(from.parameter),
            sources[to.edge]!.positionAt(to.parameter),
        ),
    );
    for (let [edge, marked] of trimIndices) {
        let sorted = [...marked].sort((left, right) => left - right);
        for (let index = 0; index + 1 < sorted.length; index += 2) {
            let low = sorted[index]!;
            let high = sorted[index + 1]!;
            if (low === high) continue;
            hullEdges.push(
                trimEdge(sources[edge]!, samples[low]!.parameter, samples[high]!.parameter),
            );
        }
    }
    return makeWire(sequenced(hullEdges));
}

/** Each next edge is the unplaced one whose nearer end is closest to the end of the chain so
 * far — build123d's `Wire(edges, sequenced=True)` ordering, without needing the Wire class. */
function sequenced(edges: readonly Edge[]): Edge[] {
    let [start, ...unplaced] = edges;
    if (start === undefined) {
        throw new GeometryError("A convex hull needs at least one edge");
    }
    let placed = [start];
    while (unplaced.length > 0) {
        let end = makeWire(placed).positionAt(1);
        let gap = (edge: Edge): number =>
            Math.min(end.sub(edge.positionAt(0)).length, end.sub(edge.positionAt(1)).length);
        let nextIndex = 0;
        unplaced.forEach((edge, index) => {
            let current = unplaced[nextIndex];
            if (current !== undefined && gap(edge) < gap(current)) {
                nextIndex = index;
            }
        });
        placed.push(...unplaced.splice(nextIndex, 1));
    }
    return placed;
}
