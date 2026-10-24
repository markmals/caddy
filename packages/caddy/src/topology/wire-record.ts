/**
 * The record of a wire rebuilt from edges. `BRepBuilderAPI_MakeWire` copies every edge so that
 * neighbours share vertices, so the copies stand in for the originals: each source edge is
 * recorded as rebuilt into the result edge with the same geometry, and its vertices into the ones
 * at the same points (build123d `_joined_wire` and `_record_matching_vertices`).
 */

import type * as occt from "@roonieone/occt-native";

import { shapes } from "@roonieone/occt-native";

import type { Edge } from "./edge.ts";

import { TOLERANCE } from "../geometry/constants.ts";
import { ShapeHistory } from "./shape-history.ts";

/** For each of `sources`, the edge of `placed` with the same point halfway along it. */
export function matchByMidpoint(
    sources: readonly Edge[],
    placed: readonly Edge[],
): (Edge | undefined)[] {
    let midpoints = placed.map(edge => edge.positionAt(0.5));
    return sources.map(source => {
        let midpoint = source.positionAt(0.5);
        let match: Edge | undefined;
        let nearest = TOLERANCE;
        midpoints.forEach((point, index) => {
            let gap = point.sub(midpoint).length;
            if (gap <= nearest) {
                nearest = gap;
                match = placed[index];
            }
        });
        return match;
    });
}

/** Records `source` as rebuilt into `placed`, and each of its vertices into the one it became. */
export function recordRebuiltEdge(record: ShapeHistory, source: Edge, placed: Edge): void {
    if (!shapes.isSame(source.wrapped, placed.wrapped)) {
        record.addModified(source.wrapped, placed.wrapped);
    }
    let placedVertices = placed.vertices;
    for (let old of source.vertices) {
        let point = old.center;
        let match = placedVertices.find(
            vertex =>
                shapes.isSame(vertex.wrapped, old.wrapped) ||
                vertex.center.sub(point).length < TOLERANCE,
        );
        if (match !== undefined && !shapes.isSame(match.wrapped, old.wrapped)) {
            record.addModified(old.wrapped, match.wrapped);
        }
    }
}

/** build123d `_joined_wire`: the record of a wire joined from `sources` into `placed`. */
export function joinRecord(
    sources: readonly Edge[],
    placed: readonly Edge[],
    before: readonly occt.Shape[],
    brought: readonly occt.Shape[],
): ShapeHistory {
    let record = ShapeHistory.empty(before, brought);
    let matches = matchByMidpoint(sources, placed);
    sources.forEach((source, index) => {
        let match = matches[index];
        // MakeWire keeps every edge it is given, so a source without a match cannot happen.
        if (match !== undefined) {
            recordRebuiltEdge(record, source, match);
        }
    });
    return record;
}
