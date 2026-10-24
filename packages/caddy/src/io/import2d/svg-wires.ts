/**
 * Turns SVG geometry into edges and wires.
 *
 * Subpaths are split where build123d's `svgelements` splits them — at every move and after every
 * close — and the edges of one subpath are strung into a single wire without reordering, since
 * the segments already run end to end. A circle or ellipse element becomes one closed edge,
 * carrying its transform as the frame it is built on.
 */

import { shapes } from "@roonieone/occt-native";

import type { SvgSegment } from "./svg-segments.ts";
import type { EllipseGeometry, SvgGeometry } from "./svg-shapes.ts";
import type { Matrix2D, Point2D } from "./svg-transform.ts";

import { makeCircle, makeEllipse, makeLine } from "../../curves/edge-makers.ts";
import { AngularDirection } from "../../curves/enums.ts";
import { makeBezier } from "../../curves/spline-makers.ts";
import { Plane } from "../../geometry/plane.ts";
import { Vector } from "../../geometry/vector.ts";
import { Edge, Wire } from "../../topology/index.ts";
import {
    arcRadii,
    arcRotation,
    arcStartAngle,
    arcSweepAngle,
    samePoint,
    transformSegment,
} from "./svg-segments.ts";
import { apply, isIdentity } from "./svg-transform.ts";

/** The wires of one shape element, in document order. */
export function wiresFrom(geometry: SvgGeometry, matrix: Matrix2D): Wire[] {
    if (geometry.kind === "ellipse") {
        return [new Wire(ellipseEdge(geometry, matrix))];
    }
    let segments = isIdentity(matrix)
        ? geometry.segments
        : geometry.segments.map(segment => transformSegment(segment, matrix));
    let wires: Wire[] = [];
    for (let subpath of subpaths(segments)) {
        let edges = edgesFrom(subpath.segments);
        if (edges.length === 0) continue;
        wires.push(closedIfNeeded(new Wire(edges), subpath.closed, edges));
    }
    return wires;
}

interface Subpath {
    readonly segments: readonly SvgSegment[];
    readonly closed: boolean;
}

/** `svgelements`' `Path.as_subpaths`: a move starts one, a close ends one. */
function subpaths(segments: readonly SvgSegment[]): Subpath[] {
    let found: Subpath[] = [];
    let start = 0;
    let push = (end: number): void => {
        let part = segments.slice(start, end + 1);
        if (part.length > 0) found.push({ segments: part, closed: part.at(-1)?.kind === "close" });
    };
    for (let [index, segment] of segments.entries()) {
        if (segment.kind === "move" && index !== start) {
            push(index - 1);
            start = index;
        }
        if (segment.kind === "close") {
            push(index);
            start = index + 1;
        }
    }
    if (start !== segments.length) push(segments.length - 1);
    return found;
}

function edgesFrom(segments: readonly SvgSegment[]): Edge[] {
    let edges: Edge[] = [];
    for (let segment of segments) {
        let edge = edgeFrom(segment);
        if (edge !== undefined) edges.push(edge);
    }
    return edges;
}

/** `undefined` for a segment with nothing to draw: a move, or a zero-length line or arc. */
function edgeFrom(segment: SvgSegment): Edge | undefined {
    switch (segment.kind) {
        case "move":
            return undefined;
        case "line":
        case "close":
            if (samePoint(segment.start, segment.end)) return undefined;
            return makeLine(point(segment.start), point(segment.end));
        case "quadratic":
            return makeBezier([point(segment.start), point(segment.control), point(segment.end)]);
        case "cubic":
            return makeBezier([
                point(segment.start),
                point(segment.control1),
                point(segment.control2),
                point(segment.end),
            ]);
        case "arc":
            return arcEdge(segment);
    }
}

/**
 * build123d builds an arc over the parameter span between its ends and lets the sweep's sign
 * decide which way round it runs, so a negative sweep is the same span reversed.
 */
function arcEdge(segment: Extract<SvgSegment, { kind: "arc" }>): Edge | undefined {
    let { major, minor } = arcRadii(segment);
    let delta = arcSweepAngle(segment);
    if (major === 0 || minor === 0 || delta === 0) return undefined;
    let start = arcStartAngle(segment);
    let end = start + delta;
    let edge = makeEllipse(major, minor, {
        plane: planeAt(segment.center, arcRotation(segment)),
        startAngle: Math.min(start, end),
        endAngle: Math.max(start, end),
        angularDirection: AngularDirection.CounterClockwise,
    });
    return delta > 0 ? edge : new Edge(shapes.reversed(edge.wrapped));
}

/**
 * A circle or ellipse element under an affine transform is still an ellipse: its radii are the
 * singular values of the transform applied to the radius vectors, and the first singular
 * direction is where its major axis ends up.
 */
function ellipseEdge(geometry: EllipseGeometry, matrix: Matrix2D): Edge {
    let center = apply(matrix, geometry.center);
    let linear = {
        a: matrix.a * geometry.radiusX,
        b: matrix.b * geometry.radiusX,
        c: matrix.c * geometry.radiusY,
        d: matrix.d * geometry.radiusY,
    };
    let sum = { x: (linear.a + linear.d) / 2, y: (linear.b + linear.c) / 2 };
    let difference = { x: (linear.a - linear.d) / 2, y: (linear.b - linear.c) / 2 };
    let average = Math.hypot(sum.x, difference.y);
    let spread = Math.hypot(difference.x, sum.y);
    let major = average + spread;
    let minor = Math.abs(average - spread);
    let rotation = (Math.atan2(difference.y, sum.x) + Math.atan2(sum.y, difference.x)) / 2;
    let plane = planeAt(center, rotation);
    return major === minor ? makeCircle(major, { plane }) : makeEllipse(major, minor, { plane });
}

function planeAt(center: Point2D, rotation: number): Plane {
    return new Plane({
        origin: new Vector(center.x, center.y, 0),
        xDir: new Vector(Math.cos(rotation), Math.sin(rotation), 0),
        zDir: new Vector(0, 0, 1),
    });
}

/** A closed subpath whose ends still do not meet gets the closing segment build123d adds. */
function closedIfNeeded(wire: Wire, closed: boolean, edges: readonly Edge[]): Wire {
    if (!closed || wire.isClosed) return wire;
    let first = edges[0];
    let last = edges.at(-1);
    if (first === undefined || last === undefined) return wire;
    let gap = makeLine(last.endPoint, first.startPoint);
    return new Wire([...edges, gap]);
}

function point(value: Point2D): Vector {
    return new Vector(value.x, value.y, 0);
}
