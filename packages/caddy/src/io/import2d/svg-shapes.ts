/**
 * The geometry of an SVG shape element, decomposed as SVG 2 chapter 10 prescribes.
 *
 * Circles and ellipses keep their analytic form instead of becoming arcs, because that is what
 * build123d's importer builds them from; every other shape becomes path segments. Attribute
 * defaults are `svgelements`' (a rectangle without `width` is one unit wide, a circle without
 * `r` has radius one), not the specification's.
 */

import type { LengthContext } from "./svg-length.ts";
import type { SvgSegment } from "./svg-segments.ts";
import type { Point2D } from "./svg-transform.ts";

import { arcFromCorner } from "./svg-arc.ts";
import { diagonalLength, parseLength, parseNumberList } from "./svg-length.ts";
import { parsePathData } from "./svg-path-data.ts";

export interface EllipseGeometry {
    readonly kind: "ellipse";
    readonly center: Point2D;
    readonly radiusX: number;
    readonly radiusY: number;
}

export interface SegmentsGeometry {
    readonly kind: "segments";
    readonly segments: readonly SvgSegment[];
}

export type SvgGeometry = EllipseGeometry | SegmentsGeometry;

export const SHAPE_TAGS: Readonly<Record<string, true>> = {
    path: true,
    rect: true,
    circle: true,
    ellipse: true,
    line: true,
    polyline: true,
    polygon: true,
};

/** `undefined` for a degenerate shape, which the importer drops exactly as `svgelements` does. */
export function shapeGeometry(
    name: string,
    values: ReadonlyMap<string, string>,
    context: LengthContext,
): SvgGeometry | undefined {
    let length = (attribute: string, fallback: number, relative: number): number =>
        parseLength(values.get(attribute), relative, context) ?? fallback;
    switch (name) {
        case "path":
            return segmentsOf(parsePathData(values.get("d") ?? ""));
        case "rect":
            return rectangle(length, context);
        case "circle":
        case "ellipse":
            return roundShape(name, length, context);
        case "line":
            return lineShape(length, context);
        case "polyline":
        case "polygon":
            return polyShape(name, values.get("points") ?? "");
        default:
            return undefined;
    }
}

type LengthReader = (attribute: string, fallback: number, relative: number) => number;

function segmentsOf(segments: readonly SvgSegment[]): SvgGeometry | undefined {
    return segments.length === 0 ? undefined : { kind: "segments", segments };
}

function rectangle(length: LengthReader, context: LengthContext): SvgGeometry | undefined {
    let x = length("x", 0, context.width);
    let y = length("y", 0, context.height);
    let width = length("width", 1, context.width);
    let height = length("height", 1, context.height);
    if (width === 0 || height === 0) return undefined;
    let { radiusX, radiusY, scooped } = cornerRadii(length, width, height, context);
    let corners = radiusX === 0 && radiusY === 0;
    return {
        kind: "segments",
        segments: corners
            ? sharpRectangle(x, y, width, height)
            : roundedRectangle(x, y, width, height, radiusX, radiusY, scooped),
    };
}

/** `rx` alone mirrors into `ry` (and the other way round), and neither may pass half the side. */
function cornerRadii(
    length: LengthReader,
    width: number,
    height: number,
    context: LengthContext,
): { radiusX: number; radiusY: number; scooped: boolean } {
    let givenX = length("rx", Number.NaN, width);
    let givenY = length("ry", Number.NaN, height);
    let radiusX = Number.isNaN(givenX) ? givenY : givenX;
    let radiusY = Number.isNaN(givenY) ? givenX : givenY;
    if (Number.isNaN(radiusX) || Number.isNaN(radiusY))
        return { radiusX: 0, radiusY: 0, scooped: false };
    let scooped = radiusX < 0 && 0 < width && radiusY < 0 && 0 < height;
    if (scooped) {
        radiusX = Math.abs(radiusX);
        radiusY = Math.abs(radiusY);
    } else if ((radiusX < 0 && 0 < width) || (radiusY < 0 && 0 < height)) {
        return { radiusX: 0, radiusY: 0, scooped: false };
    }
    if (radiusX === 0 || radiusY === 0) return { radiusX: 0, radiusY: 0, scooped: false };
    void context;
    return {
        radiusX: Math.min(radiusX, width / 2),
        radiusY: Math.min(radiusY, height / 2),
        scooped,
    };
}

function sharpRectangle(x: number, y: number, width: number, height: number): SvgSegment[] {
    let corners: Point2D[] = [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
    ];
    let [first, second, third, fourth] = corners as [Point2D, Point2D, Point2D, Point2D];
    return [
        { kind: "move", end: first },
        { kind: "line", start: first, end: second },
        { kind: "line", start: second, end: third },
        { kind: "line", start: third, end: fourth },
        { kind: "close", start: fourth, end: first },
    ];
}

function roundedRectangle(
    x: number,
    y: number,
    width: number,
    height: number,
    radiusX: number,
    radiusY: number,
    scooped: boolean,
): SvgSegment[] {
    let corner = (from: Point2D, to: Point2D): SvgSegment =>
        arcFromCorner(from, to, radiusX, radiusY, scooped);
    let start: Point2D = { x: x + radiusX, y };
    let topRight: Point2D = { x: x + width - radiusX, y };
    let rightTop: Point2D = { x: x + width, y: y + radiusY };
    let rightBottom: Point2D = { x: x + width, y: y + height - radiusY };
    let bottomRight: Point2D = { x: x + width - radiusX, y: y + height };
    let bottomLeft: Point2D = { x: x + radiusX, y: y + height };
    let leftBottom: Point2D = { x, y: y + height - radiusY };
    let leftTop: Point2D = { x, y: y + radiusY };
    return [
        { kind: "move", end: start },
        { kind: "line", start, end: topRight },
        corner(topRight, rightTop),
        { kind: "line", start: rightTop, end: rightBottom },
        corner(rightBottom, bottomRight),
        { kind: "line", start: bottomRight, end: bottomLeft },
        corner(bottomLeft, leftBottom),
        { kind: "line", start: leftBottom, end: leftTop },
        corner(leftTop, start),
        { kind: "close", start, end: start },
    ];
}

function roundShape(
    name: string,
    length: LengthReader,
    context: LengthContext,
): SvgGeometry | undefined {
    let radius = name === "circle" ? length("r", Number.NaN, diagonalLength(context)) : Number.NaN;
    let radiusX = Number.isNaN(radius) ? length("rx", 1, context.width) : radius;
    let radiusY = Number.isNaN(radius) ? length("ry", 1, context.height) : radius;
    if (radiusX === 0 || radiusY === 0) return undefined;
    return {
        kind: "ellipse",
        center: { x: length("cx", 0, context.width), y: length("cy", 0, context.height) },
        radiusX,
        radiusY,
    };
}

function lineShape(length: LengthReader, context: LengthContext): SvgGeometry {
    let start: Point2D = { x: length("x1", 0, context.width), y: length("y1", 0, context.height) };
    let end: Point2D = { x: length("x2", 0, context.width), y: length("y2", 0, context.height) };
    return {
        kind: "segments",
        segments: [
            { kind: "move", end: start },
            { kind: "line", start, end },
        ],
    };
}

/** A polygon closes, a polyline does not; both draw one line per point, degenerate ones included. */
function polyShape(name: string, text: string): SvgGeometry | undefined {
    let numbers = parseNumberList(text);
    let points: Point2D[] = [];
    for (let index = 0; index + 1 < numbers.length; index += 2) {
        points.push({ x: numbers[index] ?? 0, y: numbers[index + 1] ?? 0 });
    }
    let first = points[0];
    if (first === undefined) return undefined;
    let segments: SvgSegment[] = [{ kind: "move", end: first }];
    for (let index = 1; index < points.length; index += 1) {
        let previous = points[index - 1];
        let current = points[index];
        if (previous !== undefined && current !== undefined) {
            segments.push({ kind: "line", start: previous, end: current });
        }
    }
    let last = points[points.length - 1];
    if (name === "polygon" && last !== undefined) {
        segments.push({ kind: "close", start: last, end: first });
    }
    return { kind: "segments", segments };
}
