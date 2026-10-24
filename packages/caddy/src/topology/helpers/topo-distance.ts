import type * as occt from "@roonieone/occt-native";

import { ShapeType, shapes, topology } from "@roonieone/occt-native";

import type { ShapeTypeName } from "../enums.ts";

import { InvalidShapeError } from "../../errors.ts";
import { Shape } from "../shape.ts";
import { findSameShape } from "./relocation.ts";

/** The shape types topological distance is defined for, and what joins two of them. */
const CONNECTOR: Partial<Readonly<Record<ShapeTypeName, occt.ShapeType>>> = {
    Vertex: ShapeType.Edge,
    Edge: ShapeType.Vertex,
    Wire: ShapeType.Vertex,
    Face: ShapeType.Edge,
    Shell: ShapeType.Face,
    Solid: ShapeType.Face,
};

/**
 * A key function yielding the topological distance from each shape to `other`, for
 * `ShapeList#sortBy` and `ShapeList#groupBy` (build123d `topo_distance_to`).
 *
 * Distance is measured over the whole topology of the shared parent the reference shapes were
 * selected from, not just within the list being sorted. Shapes adjoin when they share a lower
 * order shape: faces through an edge, edges and wires through a vertex, shells and solids
 * through a face, and vertices through an edge. The reference shapes are at distance 0, the
 * shapes touching them at 1, and each further step adds one; unreachable shapes are `Infinity`.
 */
export function topoDistanceTo(other: Shape | Iterable<Shape>): (shape: Shape) => number {
    let sources = isShape(other) ? [other] : [...other];
    let [first] = sources;
    if (first === undefined) {
        throw new InvalidShapeError("Cannot measure topological distance to nothing");
    }
    let peerType = first.shapeType;
    if (sources.some(source => source.shapeType !== peerType)) {
        throw new InvalidShapeError("Topological distance needs reference shapes of one type");
    }
    if (CONNECTOR[peerType] === undefined) {
        throw new InvalidShapeError(`Topological distance is not defined for a ${peerType}`);
    }
    let parent = sharedParent(sources);
    let peers = peersOf(parent, peerType);
    let distances = reachableDistances(parent, peerType, peers, sources);

    return shape => {
        if (shape.shapeType !== peerType) {
            throw new InvalidShapeError("Topological distance needs shapes of one type");
        }
        let owner = shape.topoParent;
        if (owner === undefined || !parent.isSame(owner)) {
            throw new InvalidShapeError(
                "Topological distance needs shapes selected from the same parent",
            );
        }
        let peer = peerOf(shape, peers);
        return peer === undefined
            ? Number.POSITIVE_INFINITY
            : (distances.get(shapes.hash(peer.wrapped)) ?? Number.POSITIVE_INFINITY);
    };
}

function isShape(value: Shape | Iterable<Shape>): value is Shape {
    return value instanceof Shape;
}

/** The one parent every reference shape was selected from. */
function sharedParent(sources: readonly Shape[]): Shape {
    let parents = sources.map(source => source.topoParent);
    let [parent] = parents;
    if (parent === undefined) {
        throw new InvalidShapeError(
            "Topological distance needs shapes selected from a larger shape",
        );
    }
    if (parents.some(candidate => candidate === undefined || !parent.isSame(candidate))) {
        throw new InvalidShapeError("Topological distance needs shapes with one shared parent");
    }
    return parent;
}

function peersOf(parent: Shape, peerType: ShapeTypeName): Shape[] {
    switch (peerType) {
        case "Vertex":
            return [...parent.vertices()];
        case "Edge":
            return [...parent.edges()];
        case "Wire":
            return [...parent.wires()];
        case "Face":
            return [...parent.faces()];
        case "Shell":
            return [...parent.shells()];
        default:
            return [...parent.solids()];
    }
}

/** The peer a shape is, allowing for the shape having been moved since it was selected. */
function peerOf(shape: Shape, peers: readonly Shape[]): Shape | undefined {
    let hash = shapes.hash(shape.wrapped);
    return peers.find(peer => shapes.hash(peer.wrapped) === hash) ?? findSameShape(shape, peers);
}

/** Breadth-first distances from the reference shapes, keyed by peer hash. */
function reachableDistances(
    parent: Shape,
    peerType: ShapeTypeName,
    peers: readonly Shape[],
    sources: readonly Shape[],
): Map<number, number> {
    let neighbours = adjacency(parent, peerType, peers);
    let distances = new Map<number, number>();
    let frontier: number[] = [];
    for (let source of sources) {
        let peer = peerOf(source, peers);
        if (peer === undefined) continue;
        let hash = shapes.hash(peer.wrapped);
        if (distances.has(hash)) continue;
        distances.set(hash, 0);
        frontier.push(hash);
    }
    for (let index = 0; index < frontier.length; index += 1) {
        let current = frontier[index] as number;
        let distance = (distances.get(current) as number) + 1;
        for (let neighbour of neighbours.get(current) ?? []) {
            if (distances.has(neighbour)) continue;
            distances.set(neighbour, distance);
            frontier.push(neighbour);
        }
    }
    return distances;
}

/** Peer hashes adjoining each peer hash, derived from the shapes they share. */
function adjacency(
    parent: Shape,
    peerType: ShapeTypeName,
    peers: readonly Shape[],
): Map<number, Set<number>> {
    let known = new Set(peers.map(peer => shapes.hash(peer.wrapped)));
    let neighbours = new Map<number, Set<number>>();
    for (let group of connectedGroups(parent, peerType, peers, known)) {
        for (let member of group) {
            let linked = neighbours.get(member) ?? new Set<number>();
            for (let other of group) {
                if (other !== member) linked.add(other);
            }
            neighbours.set(member, linked);
        }
    }
    return neighbours;
}

/**
 * Groups of peers that share one connecting shape. Vertices are grouped by the edge that spans
 * them; every other peer type by the lower order shape its members have in common.
 */
function connectedGroups(
    parent: Shape,
    peerType: ShapeTypeName,
    peers: readonly Shape[],
    known: ReadonlySet<number>,
): number[][] {
    if (peerType === "Vertex") {
        return topology.subShapes(parent.wrapped, ShapeType.Edge).map(edge =>
            topology
                .subShapes(edge, ShapeType.Vertex)
                .map(vertex => shapes.hash(vertex))
                .filter(hash => known.has(hash)),
        );
    }
    let connector = CONNECTOR[peerType] as occt.ShapeType;
    let groups = new Map<number, number[]>();
    for (let peer of peers) {
        let hash = shapes.hash(peer.wrapped);
        for (let shared of topology.subShapes(peer.wrapped, connector)) {
            let key = shapes.hash(shared);
            let group = groups.get(key) ?? [];
            group.push(hash);
            groups.set(key, group);
        }
    }
    return [...groups.values()];
}
