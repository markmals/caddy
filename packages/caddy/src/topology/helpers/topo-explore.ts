import { query } from "@roonieone/occt-native";

import type { Edge } from "../edge.ts";
import type { Shape } from "../shape.ts";
import type { Vertex } from "../vertex.ts";

import { ContinuityLevel } from "../../curves/enums.ts";
import { InvalidShapeError } from "../../errors.ts";
import { TOLERANCE } from "../../geometry/constants.ts";
import { native } from "../kernel.ts";
import { ShapeList } from "../shape-list.ts";
import { findSameShape, relocationBetween } from "./relocation.ts";

/** How build123d orders the continuity levels: each one implies the ones below it. */
const CONTINUITY_RANK: Readonly<Record<ContinuityLevel, number>> = {
    [ContinuityLevel.C0]: 0,
    [ContinuityLevel.C1]: 1,
    [ContinuityLevel.C2]: 2,
};

/** Options of {@link topoExploreConnectedEdges}. */
export interface ConnectedEdgesOptions {
    /** The shape whose edges are searched; defaults to the edge's own `topoParent`. */
    readonly parent?: Shape;
    /** Smoothness the junction must reach; defaults to {@link ContinuityLevel.C0}. */
    readonly continuity?: ContinuityLevel;
}

/** The vertex two edges share, or `undefined` when they do not meet. */
export function topoExploreCommonVertex(first: Edge, second: Edge): Vertex | undefined {
    let theirs = second.vertices();
    return first.vertices().find(mine => theirs.some(other => other.isSame(mine)));
}

/**
 * The edges of `parent` that continue from `edge` with at least the requested continuity
 * (build123d `topo_explore_connected_edges`).
 *
 * `edge` may be a moved copy of one of the parent's edges - it shares that edge's geometry at
 * another placement - in which case the connected edges come back in the moved copy's frame.
 */
export function topoExploreConnectedEdges(
    edge: Edge,
    options: ConnectedEdgesOptions = {},
): ShapeList<Edge> {
    let parent = options.parent ?? edge.topoParent;
    if (parent === undefined) {
        throw new InvalidShapeError("The edge has no parent whose edges could be explored");
    }
    if (edge.isNull) {
        throw new InvalidShapeError("Cannot explore the connections of an empty edge");
    }
    let required = CONTINUITY_RANK[options.continuity ?? ContinuityLevel.C0];
    let candidates = parent.edges();
    let parentEdge = findSameShape(edge, candidates);
    if (parentEdge === undefined) {
        return new ShapeList<Edge>();
    }
    let relocation = relocationBetween(parentEdge, edge);
    let connected = candidates.filter(
        candidate =>
            !candidate.isSame(parentEdge) && junctionRank(parentEdge, candidate) >= required,
    );
    return new ShapeList(connected.map(candidate => candidate.moved(relocation)));
}

/** How smoothly `candidate` continues from `edge` at their shared vertex; -1 when they do not meet. */
function junctionRank(edge: Edge, candidate: Edge): number {
    let shared = topoExploreCommonVertex(edge, candidate);
    if (shared === undefined) {
        return -1;
    }
    let continuity = native("Continuity", () =>
        query.curveContinuity(
            edge.wrapped,
            candidate.wrapped,
            query.vertexParameterOnEdge(shared.wrapped, edge.wrapped),
            query.vertexParameterOnEdge(shared.wrapped, candidate.wrapped),
            TOLERANCE,
        ),
    );
    return CONTINUITY_RANK[continuityLevel(continuity)];
}

/** build123d's reading of OCCT's continuity: G1 counts as C1 and anything above C2 as C2. */
function continuityLevel(continuity: query.Continuity): ContinuityLevel {
    if (continuity === query.Continuity.C0) return ContinuityLevel.C0;
    if (continuity === query.Continuity.G1 || continuity === query.Continuity.C1) {
        return ContinuityLevel.C1;
    }
    return ContinuityLevel.C2;
}
