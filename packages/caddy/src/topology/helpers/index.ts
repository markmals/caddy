// Importing this module registers the geometry constructors `Shape.asShape` looks up.
import "./geometry-shapes.ts";

export { delta } from "./delta.ts";
export { edgesToWires } from "./edges-to-wires.ts";
export type { EdgesToWiresOptions } from "./edges-to-wires.ts";
export { newEdges } from "./new-edges.ts";
export { findSameShape, relocationBetween } from "./relocation.ts";
export { topoDistanceTo } from "./topo-distance.ts";
export { topoExploreCommonVertex, topoExploreConnectedEdges } from "./topo-explore.ts";
export type { ConnectedEdgesOptions } from "./topo-explore.ts";
