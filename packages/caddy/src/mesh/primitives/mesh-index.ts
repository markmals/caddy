/**
 * The cached view of a triangle mesh that every detector in this module reads.
 *
 * Centres, normals and adjacency are each computed once: the detectors run four passes over the
 * same faces and would otherwise pay for the same kernel queries again on every pass. Faces are
 * identified by index throughout, and looked up by a rounded-coordinate key when a sewing or
 * cleaning step hands back rebuilt copies of them.
 */

import type { Edge } from "../../topology/edge.ts";
import type { Face } from "../../topology/face.ts";
import type { Shape } from "../../topology/shape.ts";

import { roundTo } from "../../geometry/rounding.ts";
import { Vector } from "../../geometry/vector.ts";
import { normalized } from "./numeric.ts";

/** Decimal places a vertex coordinate keeps in a lookup key. */
const VERTEX_KEY_DIGITS = 9;

/** Cached geometry of one mesh face. */
export interface FaceSample {
    readonly index: number;
    readonly face: Face;
    readonly center: Vector;
    readonly normal: Vector;
}

/** A face neighbour reached across a shared edge, with that edge's midpoint. */
export interface EdgeNeighbour {
    readonly index: number;
    readonly midpoint: Vector;
}

/** A rounded, hashable key for a point. */
export function vertexKey(point: Vector): string {
    // `+ 0` folds a rounded `-0` onto `0`, which Python's tuple keys do for free.
    let x = roundTo(point.x, VERTEX_KEY_DIGITS) + 0;
    let y = roundTo(point.y, VERTEX_KEY_DIGITS) + 0;
    let z = roundTo(point.z, VERTEX_KEY_DIGITS) + 0;
    return `${x}|${y}|${z}`;
}

/** An order-independent key for an edge. */
export function edgeKey(edge: Edge): string {
    return edge.vertices
        .map(vertex => vertexKey(vertex.center))
        .sort()
        .join(";");
}

/** An order-independent key for a face. */
export function faceKey(face: Face): string {
    return face.vertices
        .map(vertex => vertexKey(vertex.center))
        .sort()
        .join(";");
}

/** The unique vertices of a set of faces, in first-seen order. */
export function uniqueFaceVertices(faces: readonly Face[]): Vector[] {
    let seen = new Map<string, Vector>();
    for (let face of faces) {
        for (let vertex of face.vertices) {
            let center = vertex.center;
            let key = vertexKey(center);
            if (!seen.has(key)) seen.set(key, center);
        }
    }
    return [...seen.values()];
}

/** Indexed mesh data shared by the primitive detectors. */
export class MeshIndex {
    readonly faces: Face[];
    readonly samples: FaceSample[];
    readonly faceKeyLookup: Map<string, number>;
    #adjacency: Set<number>[] | undefined;
    #edgeAdjacency: EdgeNeighbour[][] | undefined;

    constructor(faces: readonly Face[]) {
        this.faces = [...faces];
        this.samples = this.faces.map((face, index) => ({
            index,
            face,
            center: face.center,
            normal: normalized(face.normalAt()),
        }));
        this.faceKeyLookup = new Map(this.faces.map((face, index) => [faceKey(face), index]));
    }

    static fromShape(shape: Shape): MeshIndex {
        return new MeshIndex(shape.faces);
    }

    get count(): number {
        return this.faces.length;
    }

    /** Faces by index, keeping the order given. */
    faceSet(indices: Iterable<number>): Face[] {
        return [...indices].map(index => this.faces[index]!);
    }

    /** Which faces share at least one edge with each face, built on first use. */
    get adjacency(): Set<number>[] {
        if (this.#adjacency !== undefined) return this.#adjacency;
        let byEdge = new Map<string, Set<number>>();
        for (let [index, face] of this.faces.entries()) {
            for (let edge of face.edges) {
                let key = edgeKey(edge);
                let bucket = byEdge.get(key);
                if (bucket === undefined) byEdge.set(key, (bucket = new Set()));
                bucket.add(index);
            }
        }
        let adjacency = this.faces.map(() => new Set<number>());
        for (let indices of byEdge.values()) {
            for (let index of indices) {
                for (let other of indices) {
                    if (other !== index) adjacency[index]!.add(other);
                }
            }
        }
        this.#adjacency = adjacency;
        return adjacency;
    }

    /**
     * Neighbours across a manifold edge, each paired with that edge's midpoint. Only edges with
     * exactly two faces count, so a seam or a non-manifold junction contributes nothing.
     */
    get edgeAdjacency(): EdgeNeighbour[][] {
        if (this.#edgeAdjacency !== undefined) return this.#edgeAdjacency;
        let byEdge = new Map<string, { faces: number[]; midpoint: Vector }>();
        for (let [index, face] of this.faces.entries()) {
            for (let edge of face.edges) {
                let key = edgeKey(edge);
                let midpoint = edgeMidpoint(edge);
                let entry = byEdge.get(key);
                if (entry === undefined) {
                    byEdge.set(key, { faces: [index], midpoint });
                } else {
                    entry.faces.push(index);
                    entry.midpoint = midpoint;
                }
            }
        }
        let adjacency: EdgeNeighbour[][] = this.faces.map(() => []);
        for (let { faces, midpoint } of byEdge.values()) {
            if (faces.length !== 2) continue;
            let [first, second] = faces as [number, number];
            adjacency[first]!.push({ index: second, midpoint });
            adjacency[second]!.push({ index: first, midpoint });
        }
        for (let neighbours of adjacency) neighbours.sort((a, b) => a.index - b.index);
        this.#edgeAdjacency = adjacency;
        return adjacency;
    }

    /** Map the faces of a sewn or rebuilt component back onto mesh face indices. */
    indicesFromComponent(component: Iterable<Face>): number[] {
        let indices = new Set<number>();
        for (let face of component) {
            let index = this.faceKeyLookup.get(faceKey(face));
            if (index !== undefined) indices.add(index);
        }
        return [...indices].sort((a, b) => a - b);
    }

    /** A bounded breadth-first patch of faces around `seed`, restricted to `allowed`. */
    patchAround(seed: number, allowed: ReadonlySet<number>, maxDepth: number): number[] {
        let adjacency = this.adjacency;
        let visited = new Set([seed]);
        let frontier: [number, number][] = [[seed, 0]];
        let patch: number[] = [];
        while (frontier.length > 0) {
            let [index, depth] = frontier.shift()!;
            patch.push(index);
            if (depth >= maxDepth) continue;
            for (let neighbour of adjacency[index]!) {
                if (visited.has(neighbour) || !allowed.has(neighbour)) continue;
                visited.add(neighbour);
                frontier.push([neighbour, depth + 1]);
            }
        }
        return patch;
    }

    /** The connected components of a face set, largest first, each sorted by index. */
    connectedComponents(indices: ReadonlySet<number>): number[][] {
        let adjacency = this.adjacency;
        let remaining = new Set(indices);
        let components: number[][] = [];
        while (remaining.size > 0) {
            // Python's `set.pop()` is arbitrary but deterministic; insertion order is the
            // equivalent here, and the component is sorted before it is used either way.
            let seed = remaining.values().next().value as number;
            remaining.delete(seed);
            let component = [seed];
            let frontier = [seed];
            while (frontier.length > 0) {
                let index = frontier.pop()!;
                for (let neighbour of adjacency[index]!) {
                    if (!remaining.has(neighbour)) continue;
                    remaining.delete(neighbour);
                    component.push(neighbour);
                    frontier.push(neighbour);
                }
            }
            components.push(component.sort((a, b) => a - b));
        }
        return stableSortByDescendingLength(components);
    }

    /** Face indices grouped by area rounded to `digits`, largest group first. */
    groupByArea(allowed: Iterable<number>, digits: number): number[][] {
        let groups = new Map<number, number[]>();
        for (let index of allowed) {
            let area = roundTo(this.faces[index]!.area, digits) + 0;
            let bucket = groups.get(area);
            if (bucket === undefined) groups.set(area, (bucket = []));
            bucket.push(index);
        }
        return stableSortByDescendingLength([...groups.values()]);
    }
}

/** `sorted(values, key=len, reverse=True)`: longest first, ties in their original order. */
export function stableSortByDescendingLength<T extends { length: number }>(values: T[]): T[] {
    return values
        .map((value, position) => ({ value, position }))
        .sort((a, b) => b.value.length - a.value.length || a.position - b.position)
        .map(entry => entry.value);
}

function edgeMidpoint(edge: Edge): Vector {
    let [first, second] = edge.vertices.map(vertex => vertex.center);
    return new Vector(
        (first!.x + second!.x) / 2,
        (first!.y + second!.y) / 2,
        (first!.z + second!.z) / 2,
    );
}
