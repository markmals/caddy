// Turning edges into the 2D path segments SVG understands (build123d's `_*_segments` helpers).
//
// Coordinates are taken in the XY plane: a 2D export of a shape with geometry off that plane
// silently flattens it, exactly as build123d does.

import type { Vec3 } from "@roonieone/occt-native";

import { export2d, Orientation, query, shapes } from "@roonieone/occt-native";

import type { Edge } from "../../topology/index.ts";

import { GeomType } from "../../topology/index.ts";
import { native } from "../../topology/kernel.ts";

export type Point2 = readonly [x: number, y: number];

export interface LineSegment {
    readonly kind: "line";
    readonly start: Point2;
    readonly end: Point2;
}

export interface ArcSegment {
    readonly kind: "arc";
    readonly start: Point2;
    /** Ellipse radii `[rx, ry]`; equal for a circular arc. */
    readonly radius: Point2;
    /** Rotation of the ellipse's x axis, in degrees. */
    readonly rotation: number;
    readonly largeArc: boolean;
    readonly sweep: boolean;
    readonly end: Point2;
}

export interface BezierSegment {
    readonly kind: "quadratic" | "cubic";
    /** Control polygon: 3 points for a quadratic, 4 for a cubic. */
    readonly points: readonly Point2[];
}

export type PathSegment = LineSegment | ArcSegment | BezierSegment;

/** Arcs shorter than this cannot be exported as an SVG arc without degenerating. */
const MINIMUM_ARC_LENGTH = 1e-6;

export function roundTo(value: number, precision: number): number {
    let factor = 10 ** precision;
    return Math.round(value * factor) / factor;
}

function point2(xyz: Vec3, precision: number): Point2 {
    return [roundTo(xyz[0], precision), roundTo(xyz[1], precision)];
}

/** Signed angle from the x axis to `direction` about +Z, in degrees (OCCT `AngleWithRef`). */
function rotationOf(direction: Vec3): number {
    let [x, y, z] = direction;
    let sine = Math.hypot(y, z) * Math.sign(y || 1);
    return (Math.atan2(sine, x) * 180) / Math.PI;
}

/** Parameter range of an edge's curve, oriented by `reverse`. */
function range(edge: Edge, reverse: boolean): [first: number, last: number, span: number] {
    let info = native("Curve range", () => query.curveInfo(edge.wrapped));
    let span = info.last - info.first;
    return reverse ? [info.last, info.first, span] : [info.first, info.last, span];
}

function valueAt(edge: Edge, parameter: number, precision: number): Point2 {
    return point2(
        native("Curve value", () => query.curveValue(edge.wrapped, parameter)),
        precision,
    );
}

function lineSegments(edge: Edge, reverse: boolean, precision: number): PathSegment[] {
    let [first, last] = range(edge, reverse);
    return [
        {
            kind: "line",
            start: valueAt(edge, first, precision),
            end: valueAt(edge, last, precision),
        },
    ];
}

function conicSegments(edge: Edge, reverse: boolean, precision: number): PathSegment[] {
    if (edge.length < MINIMUM_ARC_LENGTH) return [];
    let conic = native("Conic geometry", () => export2d.edgeConic(edge.wrapped));
    if (conic === undefined) return [];
    let [first, last, span] = range(edge, reverse);
    let start = valueAt(edge, first, precision);
    let end = valueAt(edge, last, precision);
    let arc = {
        kind: "arc",
        radius: [conic.majorRadius, conic.minorRadius] as Point2,
        rotation: rotationOf(conic.xDirection),
        largeArc: span < -Math.PI || span > Math.PI,
        sweep: conic.zDirection[2] > 0 !== reverse,
    } as const;

    if (!native("Curve closure", () => export2d.edgeCurveIsClosed(edge.wrapped))) {
        return [{ ...arc, largeArc: arc.largeArc, start, end }];
    }
    // A full conic cannot be drawn as one SVG arc: its end point would equal its start.
    let midway = valueAt(edge, (first + last) / 2, precision);
    return [
        { ...arc, largeArc: false, start, end: midway },
        { ...arc, largeArc: false, start: midway, end },
    ];
}

function bezierSegments(edge: Edge, reverse: boolean, precision: number): PathSegment[] {
    let arcs = native("Bézier decomposition", () => export2d.edgeBezierArcs(edge.wrapped));
    let segments = arcs.map((poles): PathSegment => {
        let points: Point2[] = [];
        for (let index = 0; index < poles.length; index += 3) {
            points.push(
                point2(
                    [
                        poles[index] as number,
                        poles[index + 1] as number,
                        poles[index + 2] as number,
                    ],
                    precision,
                ),
            );
        }
        if (reverse) points.reverse();
        if (points.length === 2) {
            return { kind: "line", start: points[0] as Point2, end: points[1] as Point2 };
        }
        return { kind: points.length === 3 ? "quadratic" : "cubic", points } as PathSegment;
    });
    if (reverse) segments.reverse();
    return segments;
}

/**
 * The segments drawing `edge`, in the direction `reverse` asks for. The edge's own orientation
 * flips that direction, as it does in build123d.
 */
export function edgeSegments(edge: Edge, reverse: boolean, precision: number): PathSegment[] {
    let flipped = reverse !== (shapes.orientation(edge.wrapped) === Orientation.Reversed);
    if (edge.geomType === GeomType.Line) return lineSegments(edge, flipped, precision);
    if (edge.geomType === GeomType.Circle || edge.geomType === GeomType.Ellipse) {
        return conicSegments(edge, flipped, precision);
    }
    return bezierSegments(edge, flipped, precision);
}
