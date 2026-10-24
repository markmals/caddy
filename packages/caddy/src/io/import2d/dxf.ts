/**
 * DXF import (build123d `import_dxf`).
 *
 * Each supported entity becomes the Caddy curve object build123d builds from it, so an arc is a
 * `CenterArc`, a bulged polyline segment a `SagittaArc`, and a spline a `BSpline` through its
 * control points. Entities come back in file order.
 */

import { readFile } from "node:fs/promises";

import type { Shape } from "../../topology/index.ts";
import type { DxfEntity } from "./dxf-reader.ts";

import { makeCircle } from "../../curves/edge-makers.ts";
import { CenterArc, SagittaArc } from "../../curves/objects/arcs.ts";
import { EllipticalCenterArc } from "../../curves/objects/conic-arcs.ts";
import { Line } from "../../curves/objects/lines.ts";
import { BSpline, Spline } from "../../curves/objects/splines.ts";
import { ImportError } from "../../errors.ts";
import { Vector } from "../../geometry/vector.ts";
import { Edge, ShapeList, Wire } from "../../topology/index.ts";
import { readDxfEntities, tagNumber, tagNumbers, tagPoint, tagPoints } from "./dxf-reader.ts";

/** build123d's `TOLERANCE`, below which a segment counts as degenerate. */
const TOLERANCE = 1e-6;

const DEGREES_PER_RADIAN = 180 / Math.PI;

/** Entity types this importer converts; anything else in the drawing is ignored. */
const SUPPORTED: Readonly<Record<string, true>> = {
    LINE: true,
    ARC: true,
    CIRCLE: true,
    ELLIPSE: true,
    LWPOLYLINE: true,
    POLYLINE: true,
    SPLINE: true,
};

/** Reads a DXF file path, or a buffer holding one, as edges and wires. */
export async function importDxf(source: string | Uint8Array): Promise<ShapeList<Shape>> {
    let text =
        typeof source === "string"
            ? await readFile(source, "latin1")
            : new TextDecoder("latin1").decode(source);
    return importDxfText(text);
}

/** The importer itself, for callers that already hold the drawing's text. */
export function importDxfText(text: string): ShapeList<Shape> {
    let shapes: Shape[] = [];
    for (let entity of readDxfEntities(text)) {
        if (SUPPORTED[entity.type] !== true) continue;
        let shape = convert(entity);
        if (shape !== undefined) shapes.push(shape);
    }
    return new ShapeList(shapes);
}

function convert(entity: DxfEntity): Shape | undefined {
    switch (entity.type) {
        case "LINE":
            return lineOf(entity);
        case "ARC":
            return arcOf(entity);
        case "CIRCLE":
            return circleOf(entity);
        case "ELLIPSE":
            return ellipseOf(entity);
        case "LWPOLYLINE":
            return lightweightPolylineOf(entity);
        case "POLYLINE":
            return polylineOf(entity);
        case "SPLINE":
            return splineOf(entity);
        default:
            return undefined;
    }
}

function lineOf(entity: DxfEntity): Shape | undefined {
    let start = tagPoint(entity, 10);
    let end = tagPoint(entity, 11);
    if (Vector.from(start).sub(Vector.from(end)).length < TOLERANCE) return undefined;
    return new Line(start, end);
}

/** DXF arcs always run counter-clockwise from their start angle. */
function arcOf(entity: DxfEntity): Shape {
    let start = normalizedAngle(tagNumber(entity, 50, 0));
    let end = normalizedAngle(tagNumber(entity, 51, 0));
    return new CenterArc(
        tagPoint(entity, 10),
        tagNumber(entity, 40, 0),
        start,
        (end - start + 360) % 360,
    );
}

function circleOf(entity: DxfEntity): Shape {
    return makeCircle(tagNumber(entity, 40, 0)).translate(tagPoint(entity, 10));
}

/** An ellipse carries its major axis as a vector and its minor as a ratio of that. */
function ellipseOf(entity: DxfEntity): Shape {
    let [majorX, majorY] = tagPoint(entity, 11);
    let xRadius = Math.hypot(majorX, majorY);
    let arcSize = (tagNumber(entity, 42, 0) - tagNumber(entity, 41, 0)) * DEGREES_PER_RADIAN;
    return new EllipticalCenterArc(
        tagPoint(entity, 10),
        xRadius,
        xRadius * tagNumber(entity, 40, 1),
        {
            startAngle: tagNumber(entity, 41, 0) * DEGREES_PER_RADIAN,
            arcSize: (arcSize + 360) % 360,
            rotation: Math.atan2(majorY, majorX) * DEGREES_PER_RADIAN,
        },
    );
}

function lightweightPolylineOf(entity: DxfEntity): Shape | undefined {
    let elevation = tagNumber(entity, 38, 0);
    let points: PolylinePoint[] = [];
    let pending: PolylinePoint | undefined;
    for (let tag of entity.tags) {
        if (tag.code === 10) {
            if (pending !== undefined) points.push(pending);
            pending = { x: Number.parseFloat(tag.value), y: 0, bulge: 0 };
        } else if (tag.code === 20 && pending !== undefined) {
            pending.y = Number.parseFloat(tag.value);
        } else if (tag.code === 42 && pending !== undefined) {
            pending.bulge = Number.parseFloat(tag.value);
        }
    }
    if (pending !== undefined) points.push(pending);
    if (points.length < 2) return undefined;
    return bulgedPolyline(points, isClosed(entity), elevation);
}

function polylineOf(entity: DxfEntity): Shape | undefined {
    let vertices = entity.vertices;
    if (vertices.length < 2) return undefined;
    let points = vertices.map(vertex => {
        let [x, y] = tagPoint(vertex, 10);
        return { x, y, bulge: tagNumber(vertex, 42, 0) };
    });
    let first = vertices[0];
    return bulgedPolyline(
        points,
        isClosed(entity),
        first === undefined ? 0 : tagPoint(first, 10)[2],
    );
}

interface PolylinePoint {
    x: number;
    y: number;
    bulge: number;
}

function isClosed(entity: DxfEntity): boolean {
    return (tagNumber(entity, 70, 0) & 1) === 1;
}

/**
 * A polyline's vertices carry the bulge of the segment that starts there; build123d negates it,
 * because a positive DXF bulge turns counter-clockwise while its sagitta is measured the other
 * way round.
 */
function bulgedPolyline(
    points: readonly PolylinePoint[],
    closed: boolean,
    elevation: number,
): Shape | undefined {
    let edges: Edge[] = [];
    let count = closed ? points.length : points.length - 1;
    for (let index = 0; index < count; index += 1) {
        let from = points[index];
        let to = points[(index + 1) % points.length];
        if (from === undefined || to === undefined) continue;
        let start = new Vector(from.x, from.y, elevation);
        let end = new Vector(to.x, to.y, elevation);
        if (end.sub(start).length < TOLERANCE) continue;
        let bulge = -from.bulge;
        edges.push(
            Math.abs(bulge) < TOLERANCE
                ? new Line(start, end)
                : new SagittaArc(start, end, (bulge * end.sub(start).length) / 2),
        );
    }
    let [single] = edges;
    if (single === undefined) return undefined;
    return edges.length === 1 ? single : new Wire(edges);
}

/** Splines come as control points with knots, or as fit points with optional end tangents. */
function splineOf(entity: DxfEntity): Shape {
    let controlPoints = tagPoints(entity, 10);
    let knots = tagNumbers(entity, 40);
    let weights = tagNumbers(entity, 41);
    if (controlPoints.length > 0 && knots.length > 0) {
        return new BSpline(controlPoints, knots, tagNumber(entity, 71, 3), {
            periodic: (tagNumber(entity, 70, 0) & 2) === 2,
            ...(weights.length > 0 ? { weights } : {}),
        });
    }
    let fitPoints = tagPoints(entity, 11);
    if (fitPoints.length === 0) {
        throw new ImportError("DXF SPLINE has neither control points with knots nor fit points");
    }
    let startTangent = entity.tags.some(tag => tag.code === 12) ? tagPoint(entity, 12) : undefined;
    let endTangent = entity.tags.some(tag => tag.code === 13) ? tagPoint(entity, 13) : undefined;
    return new Spline(
        fitPoints,
        startTangent !== undefined && endTangent !== undefined
            ? { tangents: [startTangent, endTangent] }
            : {},
    );
}

function normalizedAngle(angle: number): number {
    return ((angle % 360) + 360) % 360;
}
