/** A polyline whose corners are rounded (build123d `FilletPolyline`). */

import type { VectorLike } from "../../geometry/vector.ts";
import type { Edge } from "../../topology/edge.ts";
import type { Vertex } from "../../topology/vertex.ts";
import type { Wire } from "../../topology/wire.ts";

import { GeometryError } from "../../errors.ts";
import { TOLERANCE } from "../../geometry/constants.ts";
import { Vector } from "../../geometry/vector.ts";
import { GeomType } from "../../topology/enums.ts";
import { Face } from "../../topology/face.ts";
import { BaseLineObject } from "../base-object.ts";
import { makeLine } from "../edge-makers.ts";
import { filletFace2D } from "../fillet-chamfer-2d.ts";
import { makeWire } from "../wire-makers.ts";

/** A corner of the polyline: the vertex, the two edges meeting there, and its arc. */
interface Corner {
    readonly point: Vector;
    readonly arc: Edge | undefined;
}

export class FilletPolyline extends BaseLineObject {
    constructor(
        points: readonly VectorLike[],
        radius: number | readonly number[],
        options: { readonly close?: boolean } = {},
    ) {
        let { corners, close } = prepare(points, options.close ?? false);
        let radii = cornerRadii(corners, radius, close);
        let line = makeWire(straightEdges(corners, close));
        let rounded = roundCorners(line, corners, radii, close);
        super(makeWire(stitch(line, rounded, close)).wrapped);
    }
}

/** A closing point equal to the first one means the caller already closed the polyline. */
function prepare(
    points: readonly VectorLike[],
    close: boolean,
): { corners: Vector[]; close: boolean } {
    let corners = points.map(point => Vector.from(point));
    let first = corners[0];
    let last = corners[corners.length - 1];
    let closed = close;
    if (first !== undefined && last !== undefined && first.sub(last).length < TOLERANCE) {
        closed = true;
        corners.pop();
    }
    if (corners.length < 2) {
        throw new GeometryError("FilletPolyline requires two or more pts");
    }
    return { corners, close: closed };
}

function cornerRadii(
    corners: readonly Vector[],
    radius: number | readonly number[],
    close: boolean,
): number[] {
    let radii = typeof radius === "number" ? corners.map(() => radius) : [...radius];
    let expected = corners.length - (close ? 0 : 2);
    if (typeof radius !== "number" && radii.length !== expected) {
        throw new GeometryError(
            `radius list length (${radii.length}) must match angle count (${expected})`,
        );
    }
    let negative = radii.find(value => value < 0);
    if (negative !== undefined) {
        throw new GeometryError(`radius ${negative} must be non-negative`);
    }
    return radii;
}

function straightEdges(corners: readonly Vector[], close: boolean): Edge[] {
    let edges = corners.slice(0, -1).map((corner, index) => makeLine(corner, corners[index + 1]!));
    let start = edges[0]!.positionAt(0);
    let end = edges[edges.length - 1]!.positionAt(1);
    if (close && start.sub(end).length > 1e-5) {
        edges.push(makeLine(end, start));
    }
    return edges;
}

/** The vertex of `shape` closest to `point`. */
function nearestVertex(vertices: readonly Vertex[], point: Vector): Vertex {
    let best = vertices[0];
    if (best === undefined) throw new GeometryError("Expected a shape with vertices");
    let shortest = best.center.sub(point).length;
    for (let vertex of vertices.slice(1)) {
        let gap = vertex.center.sub(point).length;
        if (gap < shortest) {
            shortest = gap;
            best = vertex;
        }
    }
    return best;
}

/**
 * The fillet arc at each interior corner, or `undefined` where the radius is zero. The arc is
 * taken from a triangular face spanning the corner's two edges, as build123d does.
 */
function roundCorners(
    line: Wire,
    corners: readonly Vector[],
    radii: readonly number[],
    close: boolean,
): Corner[] {
    let edges = line.edges;
    let rounded: Corner[] = [];
    corners.forEach((point, index) => {
        let incident = edges.filter(edge =>
            edge.vertices.some(vertex => vertex.center.sub(point).length < TOLERANCE),
        );
        if (incident.length !== 2) return;
        let radius = radii[index - (close ? 0 : 1)] ?? 0;
        if (radius === 0) {
            rounded.push({ point, arc: undefined });
            return;
        }
        let ends = incident
            .flatMap(edge => [edge.positionAt(0), edge.positionAt(1)])
            .filter(end => end.sub(point).length > TOLERANCE);
        let corner = new Face(makeWire([...incident, makeLine(ends[0]!, ends[1]!)]));
        let filleted = filletFace2D(corner, radius, [nearestVertex(corner.vertices, point)]);
        let arc = filleted.edges.find(edge => edge.geomType === GeomType.Circle);
        if (arc === undefined) {
            throw new GeometryError(
                `Fillet algorithm failed at ${point.toString()} with radius ${radius}`,
            );
        }
        rounded.push({ point, arc });
    });
    return rounded;
}

/** Joins the fillet arcs back together with the straight runs between them. */
function stitch(line: Wire, corners: readonly Corner[], close: boolean): Edge[] {
    let arcs = corners.flatMap(corner => (corner.arc === undefined ? [] : [corner.arc]));
    let joins: Edge[] = [];
    let startOf = (corner: Corner): Vector => corner.arc?.positionAt(0) ?? corner.point;
    let endOf = (corner: Corner): Vector => corner.arc?.positionAt(1) ?? corner.point;
    if (close) {
        corners.forEach((corner, index) => {
            let previous = corners[(index + corners.length - 1) % corners.length]!;
            joins.push(makeLine(endOf(previous), startOf(corner)));
        });
        return [...joins, ...arcs];
    }
    for (let index = 0; index + 1 < corners.length; index++) {
        joins.push(makeLine(endOf(corners[index]!), startOf(corners[index + 1]!)));
    }
    let first = corners[0];
    let last = corners[corners.length - 1];
    if (first === undefined || last === undefined) {
        throw new GeometryError("FilletPolyline requires at least one corner to round");
    }
    joins.push(makeLine(line.positionAt(0), startOf(first)));
    joins.push(makeLine(endOf(last), line.positionAt(1)));
    return [...joins, ...arcs];
}
