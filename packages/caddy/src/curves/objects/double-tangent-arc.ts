/** An arc that leaves a point along a tangent and runs tangent to another curve (build123d
 * `DoubleTangentArc`). */

import type { VectorLike } from "../../geometry/vector.ts";
import type { Curve } from "../../topology/composite.ts";
import type { Edge } from "../../topology/edge.ts";
import type { Keep } from "../../topology/enums.ts";
import type { Wire } from "../../topology/wire.ts";

import { GeometryError } from "../../errors.ts";
import { Axis } from "../../geometry/axis.ts";
import { TOLERANCE } from "../../geometry/constants.ts";
import { Plane } from "../../geometry/plane.ts";
import { Vector } from "../../geometry/vector.ts";
import { Keep as KeepOption } from "../../topology/enums.ts";
import { BaseEdgeObject } from "../base-object.ts";
import { makeCircle, makeLine, makeTangentArc } from "../edge-makers.ts";

/** A curve a double tangent arc can run into. */
export type TangentTarget = Curve | Edge | Wire;

export interface DoubleTangentArcOptions {
    /** Which solution to keep when the curve can be reached two ways; defaults to the first. */
    readonly keep?: Keep;
}

/**
 * The circular arc that leaves `point` along `tangent` and meets `other` tangentially. Which of
 * the two solutions `Keep.Top` and `Keep.Bottom` pick follows the geometry and is not predictable,
 * as in build123d.
 */
export class DoubleTangentArc extends BaseEdgeObject {
    constructor(
        point: VectorLike,
        tangent: VectorLike,
        other: TangentTarget,
        options: DoubleTangentArcOptions = {},
    ) {
        let keep = options.keep ?? KeepOption.Top;
        if (keep !== KeepOption.Top && keep !== KeepOption.Bottom) {
            throw new GeometryError(`Only the Top or Bottom options are supported, not ${keep}`);
        }
        let start = Vector.from(point);
        let direction = Vector.from(tangent).normalized();
        let centers = tangentCenters(start, direction, other);
        if (centers.length === 0) {
            throw new GeometryError("No double tangent arcs found");
        }
        let center = keep === KeepOption.Top ? centers[0]! : centers[centers.length - 1]!;
        let contact = other.closestPoints(center)[0];
        super(makeTangentArc(start, direction, contact).wrapped);
    }
}

/** Centres of the circles through `start` tangent to both `direction` and `other`. */
function tangentCenters(start: Vector, direction: Vector, other: TangentTarget): Vector[] {
    let plane = makeLine(start, start.add(direction)).commonPlane(...other.edges);
    if (plane === undefined) {
        throw new GeometryError("DoubleTangentArc only works on a single plane");
    }
    // build123d turns about the flipped common plane. The tangent line here crosses the target's
    // edges, and for crossing lines every sampled triple spans the same area, so which of the two
    // opposite normals `commonPlane` returns is a tie - build123d breaks it through CPython's set
    // ordering, Caddy through insertion order. The plane is the same either way, so the two
    // solutions are generated in the other order to keep `Keep.Top` and `Keep.Bottom` on the arcs
    // build123d picks.
    let turnAxis = new Axis(new Vector(0, 0, 0), plane.negate().zDir);
    // Guard against circles so large they are effectively straight lines.
    let maxRadius = 10 * other.boundingBox.add(start).diagonal;

    let centers: Vector[] = [];
    for (let angle of [-90, 90]) {
        let towardsCenter = direction.rotate(turnAxis, angle);
        let radius = tangentRadius(start, towardsCenter, other, maxRadius);
        if (radius === undefined) {
            continue;
        }
        let center = start.add(towardsCenter.multiply(radius));
        if (isTangentTo(center, radius, other, turnAxis)) {
            centers.push(center);
        }
    }
    return centers;
}

/**
 * The radius whose circle, centred along `towardsCenter`, just touches `other`: the root of the
 * gap between the distance to `other` and the radius itself, which shrinks as the circle grows.
 * `undefined` when the circle never catches up with `other` on this side.
 */
function tangentRadius(
    start: Vector,
    towardsCenter: Vector,
    other: TangentTarget,
    maxRadius: number,
): number | undefined {
    let gap = (radius: number): number =>
        other.distanceTo(start.add(towardsCenter.multiply(radius))) - radius;
    if (gap(maxRadius) > 0) {
        return undefined;
    }
    let [low, high] = [0, maxRadius];
    while (high - low > TOLERANCE / 100) {
        let middle = (low + high) / 2;
        if (gap(middle) > 0) {
            low = middle;
        } else {
            high = middle;
        }
    }
    return (low + high) / 2;
}

/** Does the circle touch `other` with matching tangents, rather than crossing it? */
function isTangentTo(
    center: Vector,
    radius: number,
    other: TangentTarget,
    turnAxis: Axis,
): boolean {
    if (radius <= TOLERANCE) {
        return false;
    }
    let circle = makeCircle(radius, {
        plane: new Plane({ origin: center, zDir: turnAxis.direction }),
    });
    let [distance, onOther, onCircle] = other.distanceToWithClosestPoints(circle);
    if (distance > TOLERANCE) {
        return false;
    }
    let alongOther = new Axis(onOther, tangentAtPoint(other, onOther));
    let alongCircle = new Axis(onCircle, circle.tangentAt(onCircle));
    return alongOther.isParallel(alongCircle, 0.05);
}

/** Tangent of whichever edge of `curve` passes through `point`. */
function tangentAtPoint(curve: TangentTarget, point: Vector): Vector {
    let edges = [...curve.edges];
    let nearest = edges.reduce((best, edge) =>
        edge.distanceTo(point) < best.distanceTo(point) ? edge : best,
    );
    return nearest.tangentAt(point);
}
