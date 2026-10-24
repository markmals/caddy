import { query, ShapeType, topology } from "@roonieone/occt-native";

import type { Edge } from "./edge.ts";
import type { Face } from "./face.ts";
import type { Vertex } from "./vertex.ts";

import { InvalidShapeError } from "../errors.ts";
import { combineConvexity } from "./convexity.ts";
import { Convexity } from "./enums.ts";
import { native } from "./kernel.ts";
import { castShape } from "./registry.ts";

/** build123d's `TOLERANCE`, used here on squared parameter-space distances as build123d does. */
const TOLERANCE = 1e-6;
/** How far the probe steps from the corner, as a fraction of the face's parameter diagonal. */
const PROBE_STEP = 1e-4;

/** A direction leading away from a corner in a face's parameter space. */
type Direction = readonly [u: number, v: number];

/**
 * Which way the face's boundary turns at this corner (build123d `Vertex._corner_convexity`):
 * the two edges leaving the vertex bound a wedge of less than half a turn, and their bisector
 * points into it. Material there and the corner is convex.
 */
export function cornerConvexity(vertex: Vertex, face: Face): Convexity {
    let directions = cornerDirections(vertex, face);
    if (directions.length !== 2) {
        throw new InvalidShapeError(
            `${directions.length} edge end(s) meet this vertex on the face, expected 2 - a corner is where exactly two of them do`,
        );
    }
    let [first, second] = directions as [Direction, Direction];
    let bisector: Direction = [first[0] + second[0], first[1] + second[1]];
    let span = Math.hypot(bisector[0], bisector[1]);
    if (span < TOLERANCE) {
        return Convexity.Smooth;
    }

    let bounds = query.uvBounds(face.wrapped);
    let diagonal = Math.hypot(bounds.uMax - bounds.uMin, bounds.vMax - bounds.vMin);
    let step = (PROBE_STEP * diagonal) / span;
    let [u, v] = native("Vertex parameters", () =>
        query.vertexParametersOnFace(vertex.wrapped, face.wrapped),
    );
    let inside = native("Parameter classification", () =>
        query.classifyUV(face.wrapped, u + bisector[0] * step, v + bisector[1] * step, TOLERANCE),
    );
    return inside === query.PointState.In ? Convexity.Convex : Convexity.Concave;
}

/**
 * Unit directions leading away from the vertex in the face's parameter space. The boundary is
 * followed in parameter space rather than in three dimensions so that a corner on a curved face
 * reads the same as one on a flat face.
 */
function cornerDirections(vertex: Vertex, face: Face): Direction[] {
    let [u, v] = native("Vertex parameters", () =>
        query.vertexParametersOnFace(vertex.wrapped, face.wrapped),
    );
    let directions: Direction[] = [];
    for (let edge of topology.subShapes(face.wrapped, ShapeType.Edge)) {
        let [first, last] = native("Edge on face", () => query.pcurveRange(edge, face.wrapped));
        for (let [parameter, sign] of [
            [first, 1],
            [last, -1],
        ] as const) {
            let { point, tangent } = native("Edge on face", () =>
                query.pcurveDerivative(edge, face.wrapped, parameter),
            );
            if ((point[0] - u) ** 2 + (point[1] - v) ** 2 > TOLERANCE) continue;
            let length = Math.hypot(tangent[0], tangent[1]);
            if (length > 0) {
                directions.push([(sign * tangent[0]) / length, (sign * tangent[1]) / length]);
            }
        }
    }
    return directions;
}

/**
 * Classify a vertex by the creases meeting at it (build123d `Vertex._crease_convexity`): convex
 * where every crease is convex, concave where every one is concave, saddle where both meet.
 */
export function creaseConvexity(vertex: Vertex): Convexity {
    let parent = vertex.topoParent;
    if (parent === undefined) {
        throw new InvalidShapeError(
            "This vertex was not selected from a shape, so there is nothing to classify it against - take it from a face or solid",
        );
    }
    let kinds = topology.ancestors(parent.wrapped, vertex.wrapped, ShapeType.Edge).map(wrapped => {
        let edge = castShape(wrapped) as Edge;
        edge.topoPath = vertex.topoPath;
        return edge.convexity;
    });
    let convexity = combineConvexity(kinds);
    if (convexity === undefined) {
        throw new InvalidShapeError("This vertex is not part of the shape it was selected from");
    }
    return convexity;
}
