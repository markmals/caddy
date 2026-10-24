// Turning edges into DXF entities (build123d's `ExportDXF._convert_*` methods).
//
// DXF is a 2D format here: every coordinate is taken in the XY plane and z is dropped, exactly
// as build123d's `_convert_point` does.

import { export2d, query } from "@roonieone/occt-native";

import type { Edge } from "../../topology/index.ts";
import type { Point2 } from "./segments.ts";

import { GeomType } from "../../topology/index.ts";
import { native } from "../../topology/kernel.ts";

export interface LineEntity {
    readonly kind: "line";
    readonly start: Point2;
    readonly end: Point2;
}

export interface CircleEntity {
    readonly kind: "circle";
    readonly center: Point2;
    readonly radius: number;
}

export interface ArcEntity {
    readonly kind: "arc";
    readonly center: Point2;
    readonly radius: number;
    /** Degrees, counter-clockwise from the x axis; DXF always sweeps start → end that way. */
    readonly startAngle: number;
    readonly endAngle: number;
}

export interface EllipseEntity {
    readonly kind: "ellipse";
    readonly center: Point2;
    /** Major axis as a vector from the centre. */
    readonly majorAxis: Point2;
    readonly ratio: number;
    readonly startParam: number;
    readonly endParam: number;
}

export interface SplineEntity {
    readonly kind: "spline";
    readonly degree: number;
    readonly controlPoints: readonly Point2[];
    readonly knots: readonly number[];
    readonly weights: readonly number[] | null;
}

export type DxfEntity = LineEntity | CircleEntity | ArcEntity | EllipseEntity | SplineEntity;

const RAD2DEG = 180 / Math.PI;

/** Signed angle from the x axis to `direction` about +Z, in radians (OCCT `AngleWithRef`). */
function rotationOf(direction: readonly [number, number, number]): number {
    let [x, y, z] = direction;
    return Math.atan2(Math.hypot(y, z) * Math.sign(y || 1), x);
}

function flatten(point: readonly [number, number, number]): Point2 {
    return [point[0], point[1]];
}

function lineEntity(edge: Edge): LineEntity {
    return {
        kind: "line",
        start: flatten(edge.startPoint().toTuple()),
        end: flatten(edge.endPoint().toTuple()),
    };
}

function circleEntity(edge: Edge): DxfEntity {
    let conic = requireConic(edge);
    let center = flatten(conic.center);
    if (native("Curve closure", () => export2d.edgeCurveIsClosed(edge.wrapped))) {
        return { kind: "circle", center, radius: conic.majorRadius };
    }
    let info = native("Curve range", () => query.curveInfo(edge.wrapped));
    let phi = rotationOf(conic.xDirection);
    let clockwise = conic.zDirection[2] <= 0;
    let [first, last] = clockwise
        ? [(phi - info.first) * RAD2DEG, (phi - info.last) * RAD2DEG]
        : [(phi + info.first) * RAD2DEG, (phi + info.last) * RAD2DEG];
    // A clockwise arc is stored by swapping its ends, which is how ezdxf writes one.
    return {
        kind: "arc",
        center,
        radius: conic.majorRadius,
        startAngle: clockwise ? last : first,
        endAngle: clockwise ? first : last,
    };
}

function ellipseEntity(edge: Edge): EllipseEntity {
    let conic = requireConic(edge);
    let info = native("Curve range", () => query.curveInfo(edge.wrapped));
    let [startParam, endParam] =
        conic.zDirection[2] > 0 ? [info.first, info.last] : [-info.last, -info.first];
    return {
        kind: "ellipse",
        center: flatten(conic.center),
        majorAxis: [
            conic.majorRadius * conic.xDirection[0],
            conic.majorRadius * conic.xDirection[1],
        ],
        ratio: conic.minorRadius / conic.majorRadius,
        startParam,
        endParam,
    };
}

function splineEntity(edge: Edge): SplineEntity {
    let spline = native("B-spline conversion", () => export2d.edgeBSpline(edge.wrapped));
    let controlPoints: Point2[] = [];
    for (let index = 0; index < spline.poles.length; index += 3) {
        controlPoints.push([spline.poles[index] as number, spline.poles[index + 1] as number]);
    }
    // A periodic spline closes by repeating its first poles, which DXF expects spelled out.
    controlPoints.push(...controlPoints.slice(0, spline.periodicPoleCount));
    return {
        kind: "spline",
        degree: spline.degree,
        controlPoints,
        knots: [...spline.knots],
        weights: spline.weights === null ? null : [...spline.weights],
    };
}

function requireConic(edge: Edge): export2d.EdgeConic {
    let conic = native("Conic geometry", () => export2d.edgeConic(edge.wrapped));
    if (conic === undefined) {
        throw new Error(`A ${edge.geomType} edge has no conic geometry`);
    }
    return conic;
}

/** The DXF entity drawing `edge`; anything but a line or a conic becomes a spline. */
export function edgeEntity(edge: Edge): DxfEntity {
    if (edge.geomType === GeomType.Line) return lineEntity(edge);
    if (edge.geomType === GeomType.Circle) return circleEntity(edge);
    if (edge.geomType === GeomType.Ellipse) return ellipseEntity(edge);
    return splineEntity(edge);
}
