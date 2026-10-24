/** Straight curve objects (build123d `Line`, `Polyline`, `PolarLine`). */

import type { VectorLike } from "../../geometry/vector.ts";
import type { Wire } from "../../topology/wire.ts";
import type { LengthMode } from "../enums.ts";

import { GeometryError } from "../../errors.ts";
import { Axis } from "../../geometry/axis.ts";
import { DEG2RAD, TOLERANCE } from "../../geometry/constants.ts";
import { Vector } from "../../geometry/vector.ts";
import { BaseEdgeObject, BaseLineObject } from "../base-object.ts";
import { makeLine } from "../edge-makers.ts";
import { LengthMode as Mode } from "../enums.ts";
import { combineWires } from "../wire-makers.ts";

/** A straight edge between two points. */
export class Line extends BaseEdgeObject {
    constructor(start: VectorLike, end: VectorLike) {
        super(makeLine(start, end).wrapped);
    }
}

/** Straight segments through every point, optionally closed back to the first. */
export class Polyline extends BaseLineObject {
    constructor(points: readonly VectorLike[], options: { readonly close?: boolean } = {}) {
        if (points.length < 2) {
            throw new GeometryError("Polyline requires two or more pts");
        }
        super(polylineEdges(points, options.close ?? false).wrapped);
    }
}

/** The edges of a polyline, chained into one wire. */
function polylineEdges(points: readonly VectorLike[], close: boolean): Wire {
    let corners = points.map(point => Vector.from(point));
    let edges = corners.slice(0, -1).map((corner, index) => makeLine(corner, corners[index + 1]!));
    let first = edges[0]!.positionAt(0);
    let last = edges[edges.length - 1]!.positionAt(1);
    if (close && first.sub(last).length > 1e-5) {
        edges.push(makeLine(last, first));
    }
    let combined = combineWires(edges);
    if (combined.length === 0) {
        throw new GeometryError("Polyline points must form a connected line");
    }
    return combined[0]!;
}

export interface PolarLineOptions {
    /** Degrees counter-clockwise from the X axis; supply this or `direction`. */
    readonly angle?: number;
    readonly direction?: VectorLike;
    readonly lengthMode?: LengthMode;
}

/** A straight edge of a given length leaving `start` at an angle or along a direction. */
export class PolarLine extends BaseEdgeObject {
    constructor(start: VectorLike, length: number, options: PolarLineOptions = {}) {
        let from = Vector.from(start);
        let { angle, direction } = polarDirection(options);
        let reach = polarLength(length, angle, options.lengthMode ?? Mode.Diagonal);
        super(makeLine(from, from.add(direction.multiply(reach))).wrapped);
    }
}

function polarDirection(options: PolarLineOptions): { angle: number; direction: Vector } {
    if (options.direction !== undefined) {
        let direction = Vector.from(options.direction).normalized();
        return { angle: new Vector(1, 0, 0).getAngle(direction), direction };
    }
    if (options.angle === undefined) {
        throw new GeometryError("Either angle or direction must be provided");
    }
    return {
        angle: options.angle,
        direction: new Vector(1, 0, 0).rotate(Axis.Z, options.angle),
    };
}

/** Turns the requested horizontal or vertical leg into the distance along the line. */
function polarLength(length: number, angle: number, mode: LengthMode): number {
    if (mode === Mode.Diagonal) return length;
    let leg = mode === Mode.Horizontal ? Math.cos(angle * DEG2RAD) : Math.sin(angle * DEG2RAD);
    if (Math.abs(leg) < TOLERANCE) {
        throw new GeometryError(`A ${mode.toLowerCase()} polar line cannot be perpendicular to it`);
    }
    return Math.abs(length / leg);
}
