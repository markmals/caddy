/** Rebuilding parts of an edge: trimming to a range or a length, and reversing (build123d
 * `Edge.trim`, `Edge.trim_to_length`, `Edge.reversed(reconstruct=True)`). */

import { Orientation, construct, query, shapes } from "@roonieone/occt-native";

import type { Edge } from "../topology/edge.ts";

import { GeometryError } from "../errors.ts";
import { TOLERANCE } from "../geometry/constants.ts";
import { castEdge } from "./cast.ts";

/**
 * The OCCT curve parameter at a normalized position, measured along the edge's direction: a
 * reversed edge runs backwards along its curve (build123d `Edge._occt_param_at`).
 */
function occtParamAt(edge: Edge, position: number): number {
    let info = query.curveInfo(edge.wrapped);
    let forward = shapes.orientation(edge.wrapped) !== Orientation.Reversed;
    let value = forward ? position : 1 - position;
    return query.curveParameterAtLength(edge.wrapped, info.length * value, info.first);
}

/** A copy of the edge running the other way, rebuilt from reversed geometry. */
export function reverseEdge(edge: Edge): Edge {
    let info = query.curveInfo(edge.wrapped);
    let first = query.curveParameterAtLength(edge.wrapped, 0, info.first);
    let last = query.curveParameterAtLength(edge.wrapped, info.length, info.first);
    return castEdge("Edge.reversed", () => construct.reverseEdgeCurve(edge.wrapped, first, last));
}

/** The section of an edge between two normalized positions, running from `start` to `end`. */
export function trimEdge(edge: Edge, start: number, end: number): Edge {
    if (start === end) {
        throw new GeometryError("Trim start and end must differ");
    }
    let startPoint = edge.positionAt(start);
    let startTangent = edge.tangentAt(start);
    let trimmed = castEdge("Edge.trim", () =>
        construct.trimEdgeByParam(edge.wrapped, occtParamAt(edge, start), occtParamAt(edge, end)),
    );
    let sameStart = trimmed.positionAt(0).sub(startPoint).length < TOLERANCE;
    let sameDirection = startTangent.dot(trimmed.tangentAt(0)) > 1 - TOLERANCE;
    return sameStart && sameDirection ? trimmed : reverseEdge(trimmed);
}

/** The section of an edge of the given arc length, starting at a normalized position. */
export function trimEdgeToLength(edge: Edge, start: number, length: number): Edge {
    let info = query.curveInfo(edge.wrapped);
    let startParam = query.curveParameterAtLength(edge.wrapped, info.length * start, info.first);
    let endParam = query.curveParameterAtLength(edge.wrapped, length, startParam);
    return castEdge("Edge.trimToLength", () =>
        construct.trimEdgeByParam(edge.wrapped, startParam, endParam),
    );
}
