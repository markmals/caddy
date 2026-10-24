/** Wires from edges and from analytic outlines (build123d `Wire.make_*` and `Wire.combine`). */

import { construct } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/vector.ts";
import type { Edge } from "../topology/edge.ts";
import type { Wire } from "../topology/wire.ts";
import type { ArcOptions } from "./edge-makers.ts";

import { Plane } from "../geometry/plane.ts";
import { Vector } from "../geometry/vector.ts";
import { native } from "../topology/kernel.ts";
import { Shape } from "../topology/shape.ts";
import { castWire } from "./cast.ts";
import { makeCircle, makeEllipse, makeLine } from "./edge-makers.ts";

/** A wire from edges, in the order given. */
export function makeWire(edges: Iterable<Edge>): Wire {
    let shapes = [...edges].map(edge => edge.wrapped);
    return castWire("Wire", () => construct.makeWire(shapes));
}

/** Chains loose edges into as many connected wires as they form. */
export function combineWires(parts: Iterable<Edge | Wire>, tolerance = 1e-9): Wire[] {
    let edges = [...parts].flatMap(part => part.edges.map(edge => edge.wrapped));
    let wires = native("Wire.combine", () => construct.connectEdgesToWires(edges, tolerance));
    return wires.map(wire => Shape.cast(wire) as Wire);
}

export function makeWireCircle(radius: number, plane: Plane = Plane.XY): Wire {
    return makeWire([makeCircle(radius, { plane })]);
}

/** Elliptical outline; an arc is closed with a chord unless `closed` is false. */
export function makeWireEllipse(
    xRadius: number,
    yRadius: number,
    options: ArcOptions & { readonly closed?: boolean } = {},
): Wire {
    let arc = makeEllipse(xRadius, yRadius, options);
    let startAngle = options.startAngle ?? 360;
    let endAngle = options.endAngle ?? 360;
    if (startAngle === endAngle || options.closed === false) {
        return makeWire([arc]);
    }
    return makeWire([arc, makeLine(arc.endPoint, arc.startPoint)]);
}

/** Options of {@link makeWirePolygon} and {@link Wire.makePolygon}. */
export interface PolygonOptions {
    /** Close the polyline back to the first point; defaults to true. */
    readonly close?: boolean;
}

/** Polyline through the points, closed back to the first unless `close` is false. */
export function makeWirePolygon(points: readonly VectorLike[], options: PolygonOptions = {}): Wire {
    let close = options.close ?? true;
    let corners = points.map(point => Vector.from(point).toTuple());
    return castWire("Wire.makePolygon", () => construct.makePolygonWire(corners, close));
}

/** Rectangle centred on the plane's origin, `width` along its X axis. */
export function makeWireRect(width: number, height: number, plane: Plane = Plane.XY): Wire {
    let corners: VectorLike[] = [
        [width / 2, height / 2, 0],
        [width / 2, -height / 2, 0],
        [-width / 2, -height / 2, 0],
        [-width / 2, height / 2, 0],
    ];
    return makeWirePolygon(corners.map(corner => plane.fromLocalCoords(corner)));
}
