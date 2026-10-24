/**
 * The path segments of an SVG document, in `svgelements`' representation.
 *
 * Arcs are the interesting case: rather than SVG's endpoint parameters they are kept as a centre
 * with the points at parameters 0 and a quarter turn (`prx`, `pry`) plus a signed sweep, which is
 * what makes them transformable by the same matrix as every other segment. The accessors below
 * recover the ellipse parameters OCCT wants from that form.
 */

import type { Matrix2D, Point2D } from "./svg-transform.ts";

import { apply, determinant } from "./svg-transform.ts";

export interface MoveSegment {
    readonly kind: "move";
    readonly end: Point2D;
}

export interface LineSegment {
    readonly kind: "line";
    readonly start: Point2D;
    readonly end: Point2D;
}

export interface QuadraticSegment {
    readonly kind: "quadratic";
    readonly start: Point2D;
    readonly control: Point2D;
    readonly end: Point2D;
}

export interface CubicSegment {
    readonly kind: "cubic";
    readonly start: Point2D;
    readonly control1: Point2D;
    readonly control2: Point2D;
    readonly end: Point2D;
}

export interface ArcSegment {
    readonly kind: "arc";
    readonly start: Point2D;
    readonly end: Point2D;
    readonly center: Point2D;
    /** The point at parameter 0: its distance from the centre is the first radius. */
    readonly prx: Point2D;
    /** The point a quarter turn on: its distance from the centre is the second radius. */
    readonly pry: Point2D;
    /** Signed parameter span, in radians. */
    readonly sweep: number;
}

/** A `Z`: the closing line back to the start of the subpath. */
export interface CloseSegment {
    readonly kind: "close";
    readonly start: Point2D;
    readonly end: Point2D;
}

export type SvgSegment =
    | MoveSegment
    | LineSegment
    | QuadraticSegment
    | CubicSegment
    | ArcSegment
    | CloseSegment;

/** `svgelements` treats points this close together as the same point. */
const POINT_ERROR = 1e-12;

const TAU = 2 * Math.PI;

export function samePoint(first: Point2D, second: Point2D): boolean {
    return (
        Math.abs(first.x - second.x) <= POINT_ERROR && Math.abs(first.y - second.y) <= POINT_ERROR
    );
}

export function distance(from: Point2D, to: Point2D): number {
    return Math.hypot(to.x - from.x, to.y - from.y);
}

export function angleBetween(from: Point2D, to: Point2D): number {
    return Math.atan2(to.y - from.y, to.x - from.x);
}

/** A mirroring matrix turns the arc the other way, so its sweep flips with the determinant. */
export function transformSegment(segment: SvgSegment, matrix: Matrix2D): SvgSegment {
    let point = (value: Point2D): Point2D => apply(matrix, value);
    switch (segment.kind) {
        case "move":
            return { kind: "move", end: point(segment.end) };
        case "line":
        case "close":
            return { kind: segment.kind, start: point(segment.start), end: point(segment.end) };
        case "quadratic":
            return {
                kind: "quadratic",
                start: point(segment.start),
                control: point(segment.control),
                end: point(segment.end),
            };
        case "cubic":
            return {
                kind: "cubic",
                start: point(segment.start),
                control1: point(segment.control1),
                control2: point(segment.control2),
                end: point(segment.end),
            };
        case "arc":
            return {
                kind: "arc",
                start: point(segment.start),
                end: point(segment.end),
                center: point(segment.center),
                prx: point(segment.prx),
                pry: point(segment.pry),
                sweep: determinant(matrix) < 0 ? -segment.sweep : segment.sweep,
            };
    }
}

export function arcRadii(arc: ArcSegment): { major: number; minor: number } {
    return { major: distance(arc.center, arc.prx), minor: distance(arc.center, arc.pry) };
}

/** Angle of the arc's first radius, which is where its parametrisation starts. */
export function arcRotation(arc: ArcSegment): number {
    return angleBetween(arc.center, arc.prx);
}

/** Angle of the arc's start, in degrees in `[0, 360)`, which is build123d's `theta`. */
export function arcStartAngle(arc: ArcSegment): number {
    let parameter = parameterAtPoint(arc, pointAtAngle(arc, angleBetween(arc.center, arc.start)));
    let degrees = (parameter * 180) / Math.PI;
    return ((degrees % 360) + 360) % 360;
}

/** Signed angular span of the arc, in degrees, which is build123d's `delta`. */
export function arcSweepAngle(arc: ArcSegment): number {
    return (arc.sweep * 180) / Math.PI;
}

/**
 * The parameter of a point on the ellipse. For a non-circular ellipse the parameter is not the
 * angle from the centre, so the angle is mapped through the radius ratio and corrected on the
 * half where the arctangent folds back.
 */
function parameterAtPoint(arc: ArcSegment, point: Point2D): number {
    let { major, minor } = arcRadii(arc);
    let angle = angleBetween(arc.center, point) - arcRotation(arc);
    let parameter = Math.atan2(major * Math.tan(angle), minor);
    if (foldedBack(angle)) parameter += Math.PI;
    return parameter;
}

function pointAtAngle(arc: ArcSegment, angle: number): Point2D {
    let { major, minor } = arcRadii(arc);
    let local = angle - arcRotation(arc);
    if (major === minor) return pointAtParameter(arc, local);
    let parameter = Math.atan2(major * Math.tan(local), minor);
    return pointAtParameter(arc, foldedBack(local) ? parameter + Math.PI : parameter);
}

function foldedBack(angle: number): boolean {
    let folded = Math.abs(angle) % TAU;
    return folded > TAU / 4 && folded <= (3 * TAU) / 4;
}

function pointAtParameter(arc: ArcSegment, parameter: number): Point2D {
    let { major, minor } = arcRadii(arc);
    let rotation = arcRotation(arc);
    return {
        x:
            arc.center.x +
            major * Math.cos(parameter) * Math.cos(rotation) -
            minor * Math.sin(parameter) * Math.sin(rotation),
        y:
            arc.center.y +
            major * Math.cos(parameter) * Math.sin(rotation) +
            minor * Math.sin(parameter) * Math.cos(rotation),
    };
}
