/**
 * build123d's `Shape.extrude` family: a prism swept linearly from a shape into the next
 * dimension — a vertex makes an edge, a wire a shell and a face a solid.
 */

import type * as occt from "@roonieone/occt-native";

import { features } from "@roonieone/occt-native";

import type { VectorLike } from "../../geometry/vector.ts";
import type { Edge } from "../edge.ts";
import type { Face } from "../face.ts";
import type { Shape } from "../shape.ts";
import type { Shell } from "../shell.ts";
import type { Solid } from "../solid.ts";
import type { Vertex } from "../vertex.ts";
import type { Wire } from "../wire.ts";

import { castEdge } from "../../curves/cast.ts";
import { Vector } from "../../geometry/vector.ts";
import { castShell, castSolid } from "./cast.ts";

function prism(profile: Shape, direction: VectorLike): occt.Shape {
    return features.extrude(profile.wrapped, Vector.from(direction).toTuple());
}

/** The edge a vertex sweeps out (build123d `Edge.extrude`). */
export function extrudeVertex(vertex: Vertex, direction: VectorLike): Edge {
    return castEdge("Edge.extrude", () => prism(vertex, direction));
}

/** The shell a wire sweeps out (build123d `Shell.extrude`). */
export function extrudeWire(wire: Wire, direction: VectorLike): Shell {
    return castShell("Shell.extrude", () => prism(wire, direction));
}

/** The solid a face sweeps out (build123d `Solid.extrude`). */
export function extrudeFace(face: Face, direction: VectorLike): Solid {
    return castSolid("Solid.extrude", () => prism(face, direction));
}
