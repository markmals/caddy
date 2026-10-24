/** Elliptical, parabolic and hyperbolic curve objects (build123d `EllipticalCenterArc`,
 * `EllipticalStartArc`, `ParabolicCenterArc`, `HyperbolicCenterArc`). */

import type { VectorLike } from "../../geometry/vector.ts";
import type { Edge } from "../../topology/edge.ts";
import type { ArcLimit } from "../arc-limit.ts";

import { GeometryError } from "../../errors.ts";
import { Axis } from "../../geometry/axis.ts";
import { DEG2RAD, RAD2DEG } from "../../geometry/constants.ts";
import { Plane } from "../../geometry/plane.ts";
import { Vector } from "../../geometry/vector.ts";
import { isArcLimit, trimToLimit } from "../arc-limit.ts";
import { BaseEdgeObject } from "../base-object.ts";
import { makeEllipse, makeHyperbola, makeParabola } from "../edge-makers.ts";
import { reverseEdge } from "../edge-trim.ts";
import { AngularDirection } from "../enums.ts";

/** The arc's angular size in degrees, or an object it is trimmed at. */
export type ArcSize = number | ArcLimit;

function sweepDirection(arcSize: number): AngularDirection {
    return arcSize >= 0 ? AngularDirection.CounterClockwise : AngularDirection.Clockwise;
}

/** Up axis of the plane every centre arc is built on before it is rotated and moved. */
const UP = new Vector(0, 0, 1);

export interface EllipticalCenterArcOptions {
    readonly startAngle?: number;
    /** Degrees of arc, or an object to trim the ellipse at; defaults to 90°. */
    readonly arcSize?: ArcSize;
    /** Degrees the whole arc is turned about the Z axis before it is moved to the centre. */
    readonly rotation?: number;
}

/** An arc of an axis-aligned ellipse centred on `center`. */
export class EllipticalCenterArc extends BaseEdgeObject {
    constructor(
        center: VectorLike,
        xRadius: number,
        yRadius: number,
        options: EllipticalCenterArcOptions = {},
    ) {
        let startAngle = options.startAngle ?? 0;
        let arcSize = options.arcSize ?? 90;
        let rotation = options.rotation ?? 0;
        let place = (edge: Edge) => edge.rotate(Axis.Z, rotation).translate(Vector.from(center));

        if (!isArcLimit(arcSize)) {
            let arc = makeEllipse(xRadius, yRadius, {
                startAngle,
                endAngle: startAngle + arcSize,
                angularDirection: sweepDirection(arcSize),
            });
            super(place(arc).wrapped);
            return;
        }

        let ellipse = place(makeEllipse(xRadius, yRadius));
        super(trimToLimit([ellipse, reverseEdge(ellipse)], arcSize, "EllipticalCenterArc").wrapped);
    }
}

export interface EllipticalStartArcOptions {
    /** Angular position of the start point on the ellipse, in degrees. */
    readonly startAngle?: number;
    /** Direction of the ellipse's x-axis; an alternative to `startAngle`. */
    readonly majorAxisDir?: VectorLike;
}

/**
 * An elliptical arc of `arcSize` degrees that leaves `start` along `tangent`. Either the start
 * point's angular position or the direction of the ellipse's major axis fixes which ellipse of
 * the given radii is used.
 */
export class EllipticalStartArc extends BaseEdgeObject {
    constructor(
        start: VectorLike,
        tangent: VectorLike,
        xRadius: number,
        yRadius: number,
        arcSize: number,
        options: EllipticalStartArcOptions = {},
    ) {
        let from = Vector.from(start);
        let along = Vector.from(tangent).normalized();
        let { startAngle, xDir } = ellipseFrame(along, xRadius, yRadius, options);
        let yDir = UP.cross(xDir);
        let radians = startAngle * DEG2RAD;
        let origin = from
            .sub(xDir.multiply(xRadius * Math.cos(radians)))
            .sub(yDir.multiply(yRadius * Math.sin(radians)));
        super(
            makeEllipse(xRadius, yRadius, {
                plane: new Plane({ origin, xDir, zDir: UP }),
                startAngle,
                endAngle: startAngle + arcSize,
                angularDirection: sweepDirection(arcSize),
            }).wrapped,
        );
    }
}

/** Where the start point sits on the ellipse and which way the ellipse's x-axis points. */
function ellipseFrame(
    tangent: Vector,
    xRadius: number,
    yRadius: number,
    options: EllipticalStartArcOptions,
): { startAngle: number; xDir: Vector } {
    let planar = tangent.sub(UP.multiply(tangent.dot(UP)));
    if (options.startAngle !== undefined) {
        let radians = options.startAngle * DEG2RAD;
        let along = planar.normalized();
        let xScale = -xRadius * Math.sin(radians);
        let yScale = yRadius * Math.cos(radians);
        let xDir = along
            .multiply(xScale)
            .sub(UP.cross(along).multiply(yScale))
            .multiply(1 / (xScale * xScale + yScale * yScale));
        return { startAngle: options.startAngle, xDir: xDir.normalized() };
    }
    if (options.majorAxisDir === undefined) {
        throw new GeometryError("Either startAngle or majorAxisDir must be provided");
    }
    let major = Vector.from(options.majorAxisDir);
    let xDir = major.sub(UP.multiply(major.dot(UP))).normalized();
    let yDir = UP.cross(xDir);
    let radians = Math.atan2(-(planar.dot(xDir) / xRadius), planar.dot(yDir) / yRadius);
    return { startAngle: radians * RAD2DEG, xDir };
}

export interface ParabolicCenterArcOptions {
    readonly startAngle?: number;
    /** Degrees of arc, or an object to trim the parabola at; defaults to 90°. */
    readonly arcSize?: ArcSize;
    /** Degrees the whole arc is turned about the Z axis before it is moved to the vertex. */
    readonly rotation?: number;
}

/** An arc of the parabola with the given focal length and its vertex at `vertex`. */
export class ParabolicCenterArc extends BaseEdgeObject {
    constructor(vertex: VectorLike, focalLength: number, options: ParabolicCenterArcOptions = {}) {
        let startAngle = options.startAngle ?? 0;
        let arcSize = options.arcSize ?? 90;
        let rotation = options.rotation ?? 0;
        let place = (edge: Edge) => edge.rotate(Axis.Z, rotation).translate(Vector.from(vertex));

        if (!isArcLimit(arcSize)) {
            let arc = makeParabola(focalLength, {
                startAngle,
                endAngle: startAngle + arcSize,
                angularDirection: sweepDirection(arcSize),
            });
            super(place(arc).wrapped);
            return;
        }

        let half = place(makeParabola(focalLength, { startAngle, endAngle: startAngle + 180 }));
        super(trimToLimit([half, reverseEdge(half)], arcSize, "ParabolicCenterArc").wrapped);
    }
}

export interface HyperbolicCenterArcOptions {
    readonly startAngle?: number;
    /** Degrees of arc, or an object to trim the hyperbola at; defaults to 90°. */
    readonly arcSize?: ArcSize;
    /** Degrees the whole arc is turned about the Z axis before it is moved to the centre. */
    readonly rotation?: number;
}

/** An arc of the hyperbola branch with the given radii, centred on `center`. */
export class HyperbolicCenterArc extends BaseEdgeObject {
    constructor(
        center: VectorLike,
        xRadius: number,
        yRadius: number,
        options: HyperbolicCenterArcOptions = {},
    ) {
        let startAngle = options.startAngle ?? 0;
        let arcSize = options.arcSize ?? 90;
        let rotation = options.rotation ?? 0;
        let place = (edge: Edge) => edge.rotate(Axis.Z, rotation).translate(Vector.from(center));

        if (!isArcLimit(arcSize)) {
            let arc = makeHyperbola(xRadius, yRadius, {
                startAngle,
                endAngle: startAngle + arcSize,
                angularDirection: sweepDirection(arcSize),
            });
            super(place(arc).wrapped);
            return;
        }

        let half = place(
            makeHyperbola(xRadius, yRadius, { startAngle, endAngle: startAngle + 180 }),
        );
        super(trimToLimit([half, reverseEdge(half)], arcSize, "HyperbolicCenterArc").wrapped);
    }
}
