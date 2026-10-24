import { booleans, ShapeType, topology } from "@roonieone/occt-native";

import type { Edge } from "../edge.ts";
import type { Shape } from "../shape.ts";

import { native } from "../kernel.ts";
import { castShape } from "../registry.ts";
import { ShapeList } from "../shape-list.ts";

/**
 * The edges `combined` has that none of `objects` had (build123d `new_edges`): the seams a
 * boolean drew where the shapes met. Each one records `combined` as the shape it came from.
 */
export function newEdges(objects: Iterable<Shape>, combined: Shape): ShapeList<Edge> {
    let theirs = [...objects].flatMap(object => object.edges.map(edge => edge.wrapped));
    let mine = combined.edges.map(edge => edge.wrapped);
    let difference = native("New edges", () => booleans.cut(mine, theirs, { parallel: true }));
    let found = topology.subShapes(difference, ShapeType.Edge).map(wrapped => {
        let edge = castShape(wrapped) as Edge;
        edge.topoPath = [combined];
        return edge;
    });
    return new ShapeList(found);
}
