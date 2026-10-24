/** Runs a native construction and wraps its result in the matching shape class. */

import type * as occt from "@roonieone/occt-native";

import type { Edge } from "../topology/edge.ts";
import type { Face } from "../topology/face.ts";
import type { Wire } from "../topology/wire.ts";

import { native } from "../topology/kernel.ts";
import { Shape } from "../topology/shape.ts";

export function castEdge(operation: string, make: () => occt.Shape): Edge {
    return Shape.cast(native(operation, make)) as Edge;
}

export function castWire(operation: string, make: () => occt.Shape): Wire {
    return Shape.cast(native(operation, make)) as Wire;
}

export function castFace(operation: string, make: () => occt.Shape): Face {
    return Shape.cast(native(operation, make)) as Face;
}
