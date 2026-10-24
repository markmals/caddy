/** Edges from analytic geometry: lines, circular arcs and elliptical arcs (build123d `Edge.make_*`). */

import { construct } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/vector.ts";
import type { Edge } from "../topology/edge.ts";
import type { AngularDirection } from "./enums.ts";

import { DEG2RAD } from "../geometry/constants.ts";
import { Plane } from "../geometry/plane.ts";
import { Vector } from "../geometry/vector.ts";
import { castEdge } from "./cast.ts";
import { AngularDirection as Direction } from "./enums.ts";
import { frameOf } from "./frame.ts";

/** Angles are in degrees; equal start and end angles give the full circle or ellipse. */
export interface ArcOptions {
    readonly plane?: Plane;
    readonly startAngle?: number;
    readonly endAngle?: number;
    readonly angularDirection?: AngularDirection;
}

export function makeLine(start: VectorLike, end: VectorLike): Edge {
    let from = Vector.from(start).toTuple();
    let to = Vector.from(end).toTuple();
    return castEdge("Edge.makeLine", () => construct.makeLineEdge(from, to));
}

/** Circle centred on the plane's origin, or the arc between the two angles. */
export function makeCircle(radius: number, options: ArcOptions = {}): Edge {
    let plane = options.plane ?? Plane.XY;
    let startAngle = options.startAngle ?? 360;
    let endAngle = options.endAngle ?? 360;
    let counterClockwise =
        (options.angularDirection ?? Direction.CounterClockwise) === Direction.CounterClockwise;
    return castEdge("Edge.makeCircle", () =>
        construct.makeCircleEdge(
            frameOf(plane),
            radius,
            startAngle * DEG2RAD,
            endAngle * DEG2RAD,
            counterClockwise,
        ),
    );
}

/** Ellipse centred on the plane's origin, or the arc between the two angles. */
export function makeEllipse(xRadius: number, yRadius: number, options: ArcOptions = {}): Edge {
    let plane = options.plane ?? Plane.XY;
    let startAngle = options.startAngle ?? 360;
    let endAngle = options.endAngle ?? 360;
    let counterClockwise =
        (options.angularDirection ?? Direction.CounterClockwise) === Direction.CounterClockwise;
    return castEdge("Edge.makeEllipse", () =>
        construct.makeEllipseEdge(
            frameOf(plane),
            xRadius,
            yRadius,
            startAngle * DEG2RAD,
            endAngle * DEG2RAD,
            counterClockwise,
        ),
    );
}

/** Parabola with its vertex at the plane's origin, opening along the plane's X axis. */
export function makeParabola(focalLength: number, options: ArcOptions = {}): Edge {
    let plane = options.plane ?? Plane.XY;
    let startAngle = options.startAngle ?? 0;
    let endAngle = options.endAngle ?? 90;
    let counterClockwise =
        (options.angularDirection ?? Direction.CounterClockwise) === Direction.CounterClockwise;
    return castEdge("Edge.makeParabola", () =>
        construct.makeParabolaEdge(
            frameOf(plane),
            focalLength,
            startAngle * DEG2RAD,
            endAngle * DEG2RAD,
            counterClockwise,
        ),
    );
}

/** Hyperbola branch centred on the plane's origin, opening along the plane's X axis. */
export function makeHyperbola(xRadius: number, yRadius: number, options: ArcOptions = {}): Edge {
    let plane = options.plane ?? Plane.XY;
    let startAngle = options.startAngle ?? 360;
    let endAngle = options.endAngle ?? 360;
    let counterClockwise =
        (options.angularDirection ?? Direction.CounterClockwise) === Direction.CounterClockwise;
    return castEdge("Edge.makeHyperbola", () =>
        construct.makeHyperbolaEdge(
            frameOf(plane),
            xRadius,
            yRadius,
            startAngle * DEG2RAD,
            endAngle * DEG2RAD,
            counterClockwise,
        ),
    );
}

/** The circular arc running from `start` through `middle` to `end`. */
export function makeThreePointArc(start: VectorLike, middle: VectorLike, end: VectorLike): Edge {
    let points = [start, middle, end].map(point => Vector.from(point).toTuple());
    return castEdge("Edge.makeThreePointArc", () =>
        construct.makeThreePointArc(points[0]!, points[1]!, points[2]!),
    );
}

/** The circular arc leaving `start` along `tangent` and reaching `end`. */
export function makeTangentArc(start: VectorLike, tangent: VectorLike, end: VectorLike): Edge {
    let from = Vector.from(start).toTuple();
    let direction = Vector.from(tangent).toTuple();
    let to = Vector.from(end).toTuple();
    return castEdge("Edge.makeTangentArc", () => construct.makeTangentArc(from, direction, to));
}
