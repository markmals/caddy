/** Bases for the curve objects, which are built from parameters rather than a native shape
 * (build123d `BaseEdgeObject` and `BaseLineObject`). */

import type * as occt from "@roonieone/occt-native";

import { Edge } from "../topology/edge.ts";
import { rebuilt } from "../topology/rebuild.ts";
import { Wire } from "../topology/wire.ts";

/** A curve object that is a single edge. */
export class BaseEdgeObject extends Edge {
    protected override withWrapped(wrapped: occt.Shape): this {
        return rebuilt(this, Edge, wrapped);
    }
}

/** A curve object made of several edges joined into one wire. */
export class BaseLineObject extends Wire {
    protected override withWrapped(wrapped: occt.Shape): this {
        return rebuilt(this, Wire, wrapped);
    }
}
