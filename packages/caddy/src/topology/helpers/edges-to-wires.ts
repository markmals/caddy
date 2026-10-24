import { construct } from "@roonieone/occt-native";

import type { Edge } from "../edge.ts";

import { native } from "../kernel.ts";
import { ShapeList } from "../shape-list.ts";
import { Wire } from "../wire.ts";

/** Options of {@link edgesToWires}. */
export interface EdgesToWiresOptions {
    /** Largest gap two edge ends may leave and still be joined; defaults to 1e-6. */
    readonly tolerance?: number;
}

/**
 * Chain `edges` into as many connected wires as they form (build123d `edges_to_wires`). Edges
 * whose ends meet within the tolerance land in the same wire; the rest start new ones.
 */
export function edgesToWires(
    edges: Iterable<Edge>,
    options: EdgesToWiresOptions = {},
): ShapeList<Wire> {
    let wrapped = Array.from(edges, edge => edge.wrapped);
    let wires = native("Wire assembly", () =>
        construct.connectEdgesToWires(wrapped, options.tolerance ?? 1e-6),
    );
    return new ShapeList(wires.map(wire => new Wire(wire)));
}
