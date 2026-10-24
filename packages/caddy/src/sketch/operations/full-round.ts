/**
 * Rounding off the end of a face by replacing one of its edges with the arc of the largest empty
 * circle that fits inside it (build123d `full_round`).
 */

import type { Shape } from "../../topology/shape.ts";

import { GeometryError } from "../../errors.ts";
import { Plane } from "../../geometry/plane.ts";
import { Vector } from "../../geometry/vector.ts";
import { Sketch } from "../../topology/composite.ts";
import { Edge } from "../../topology/edge.ts";
import { SortBy } from "../../topology/enums.ts";
import { Face } from "../../topology/face.ts";
import {
    topoExploreCommonVertex,
    topoExploreConnectedEdges,
} from "../../topology/helpers/topo-explore.ts";
import { Wire } from "../../topology/wire.ts";
import { voronoiVertices } from "./voronoi-vertices.ts";

/** Options of {@link fullRound}. */
export interface FullRoundOptions {
    /** Bulge the arc into the face instead of out of it; defaults to false. */
    readonly invert?: boolean;
    /** Samples taken along each edge to generate the circle candidates; defaults to 100. */
    readonly voronoiPointCount?: number;
}

/** The three edges whose largest empty circle is wanted: the target edge and its neighbours. */
interface EdgeGroup {
    readonly parent: Shape;
    readonly target: Edge;
    readonly connected: readonly [Edge, Edge];
    readonly all: readonly Edge[];
}

/** A candidate centre with how unevenly the three edges sit around it. */
interface RankedCenter {
    readonly difference: number;
    readonly center: Vector;
}

/**
 * Replace `edge` with the arc of the largest empty circle that fits within the face it was
 * selected from, rounding off that end of the face.
 */
export function fullRound(edge: Edge, options: FullRoundOptions = {}): Sketch {
    let group = edgeGroup(edge);
    let center = largestEmptyCircleCenter(group, options.voronoiPointCount ?? 100);
    let [first, second] = group.connected.map(
        neighbour => neighbour.distanceToWithClosestPoints(center)[1],
    ) as [Vector, Vector];
    let onTarget = group.target.distanceToWithClosestPoints(center)[1];

    let plane = splitPlane(first, second, onTarget);
    let trimmed = group.connected.map(neighbour => trimToArc(neighbour, plane));
    let arcMiddle = options.invert === true ? center.multiply(2).sub(onTarget) : onTarget;
    let arc = Edge.makeThreePointArc(first, arcMiddle, second);

    return new Sketch([rebuiltFace(group, [...trimmed, arc])]);
}

function edgeGroup(edge: Edge): EdgeGroup {
    let parent = edge.topoParent;
    if (parent === undefined) {
        throw new GeometryError("edge must be extracted from shape");
    }
    let connected = topoExploreConnectedEdges(edge, { parent });
    let [first, second] = connected;
    if (connected.length !== 2 || first === undefined || second === undefined) {
        throw new GeometryError("Invalid geometry - 3 or more edges required");
    }
    return { parent, target: edge, connected: [first, second], all: [edge, first, second] };
}

/**
 * The centre of the largest circle that fits between the three edges, estimated from the Voronoi
 * vertices of points sampled along them and refined by averaging the three most equidistant ones.
 */
function largestEmptyCircleCenter(group: EdgeGroup, pointCount: number): Vector {
    let fractions = Array.from({ length: pointCount + 1 }, (_, index) => index / pointCount);
    let samples = group.all.flatMap(edge => edge.positions(fractions));
    let candidates = voronoiVertices(samples);
    let [nearest] = candidates;
    if (nearest === undefined) {
        throw new GeometryError("Invalid geometry - the edges enclose no empty circle");
    }

    let start: RankedCenter = { difference: Number.POSITIVE_INFINITY, center: nearest };
    let bestThree: [RankedCenter, RankedCenter, RankedCenter] = [start, start, start];
    for (let candidate of candidates) {
        let distances = group.all.map(edge => edge.distanceTo(candidate));
        let average = distances.reduce((total, distance) => total + distance, 0) / 3;
        let difference = Math.max(...distances.map(distance => Math.abs(distance - average)));
        if (difference < bestThree[2].difference) {
            bestThree[2] = { difference, center: candidate };
            bestThree.sort((left, right) => left.difference - right.difference);
        }
    }

    return bestThree.reduce((sum, ranked) => sum.add(ranked.center), new Vector()).divide(3);
}

/**
 * The plane cutting the two neighbours off where the arc starts: it runs through the midpoint of
 * the arc's ends, with its normal pointing away from the edge being replaced.
 */
function splitPlane(first: Vector, second: Vector, onTarget: Vector): Plane {
    let origin = first.add(second).divide(2);
    let xDir = second.sub(first).normalized();
    let toArc = origin.sub(onTarget);
    return new Plane({
        origin,
        xDir,
        zDir: toArc.sub(xDir.multiply(toArc.dot(xDir))).normalized(),
    });
}

/** The part of a neighbour that stays, with room left for the arc. */
function trimToArc(neighbour: Edge, plane: Plane): Edge {
    let kept = neighbour.split(plane).flatMap(piece => [...piece.edges()]);
    let [trimmed] = kept;
    if (kept.length !== 1 || trimmed === undefined) {
        throw new GeometryError("Invalid geometry to create the end arc");
    }
    return trimmed;
}

/**
 * The face the rounded edges bound, with the holes of the original face. The longest wire is the
 * perimeter; the normal follows the face the edge came from.
 */
function rebuiltFace(group: EdgeGroup, rounded: readonly Edge[]): Face {
    let untouched = untouchedEdges(group);
    let wires = Wire.combine([...rounded, ...untouched]).sortBy(SortBy.Length, { reverse: true });
    let [perimeter, ...holes] = wires;
    if (perimeter === undefined) {
        throw new GeometryError("Invalid geometry - the rounded edges bound no face");
    }
    let face = new Face(perimeter, holes);
    let original = group.parent.faces()[0];
    if (original !== undefined && !original.normalAt().equals(face.normalAt())) {
        return face.reverseNormal();
    }
    return face;
}

/**
 * The parent's edges that the rounding leaves alone: everything that is neither the target nor
 * one of the two edges meeting it. `topoExploreConnectedEdges` returns relocated copies, which no
 * longer identify the parent's own edges, so the neighbours are recognised by their shared vertex.
 */
function untouchedEdges(group: EdgeGroup): readonly Edge[] {
    return group.parent
        .edges()
        .filter(
            candidate =>
                !candidate.isSame(group.target) &&
                topoExploreCommonVertex(group.target, candidate) === undefined,
        );
}
