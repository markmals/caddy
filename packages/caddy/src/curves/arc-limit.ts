/** Arc objects accept an object to run into instead of an angular size: the arc is built both
 * ways from its start and trimmed at the first crossing, keeping the shorter travel (build123d's
 * "arc limit" parameters). */

import type { Edge } from "../topology/edge.ts";

import { GeometryError } from "../errors.ts";
import { Axis } from "../geometry/axis.ts";
import { TOLERANCE } from "../geometry/constants.ts";
import { Plane } from "../geometry/plane.ts";
import { Vector } from "../geometry/vector.ts";
import { Shape } from "../topology/shape.ts";
import { makeLine } from "./edge-makers.ts";
import { trimEdgeToOther } from "./edge-trim.ts";

/** What an arc or line can be told to stop at instead of a size. */
export type ArcLimit = Shape | Axis | Plane;

export function isArcLimit(value: unknown): value is ArcLimit {
    return value instanceof Shape || value instanceof Axis || value instanceof Plane;
}

/**
 * The shorter of the two candidate arcs trimmed at `limit`. Because each candidate is cut at its
 * first crossing, a limit can only produce arcs below 180°.
 */
export function trimToLimit(
    candidates: readonly Edge[],
    limit: ArcLimit,
    objectName: string,
): Edge {
    let trimmed = candidates
        .map(candidate => trimEdgeToOther(candidate, limit))
        .filter((candidate): candidate is Edge => candidate !== undefined);
    if (trimmed.length === 0) {
        throw new GeometryError(`${objectName} doesn't intersect its arc limit`);
    }
    return trimmed.reduce((shortest, arc) => (arc.length < shortest.length ? arc : shortest));
}

/**
 * Where a ray leaving `from` along `direction` first meets `limit`, or `undefined` when it never
 * does. Shapes are met by trimming a long enough line against them; axes and planes are solved
 * directly, as build123d does for the `PolarLine` length limit.
 */
export function rayLimitPoint(
    from: Vector,
    direction: Vector,
    limit: ArcLimit,
): Vector | undefined {
    if (limit instanceof Plane) {
        let along = direction.dot(limit.zDir);
        if (Math.abs(along) < TOLERANCE) {
            return undefined;
        }
        let distance = limit.origin.sub(from).dot(limit.zDir) / along;
        return distance > TOLERANCE ? from.add(direction.multiply(distance)) : undefined;
    }
    if (limit instanceof Axis) {
        return axisContact(from, direction, limit);
    }
    let reach = limit.boundingBox.add(from).diagonal;
    let trimmed = trimEdgeToOther(makeLine(from, from.add(direction.multiply(reach))), limit);
    return trimmed?.positionAt(1);
}

/** Closest approach of a ray and an axis, kept only when they actually meet ahead of the ray. */
function axisContact(from: Vector, direction: Vector, axis: Axis): Vector | undefined {
    let along = direction.dot(axis.direction);
    let separation = 1 - along * along;
    if (Math.abs(separation) < TOLERANCE) {
        return undefined;
    }
    let offset = from.sub(axis.position);
    let onRay = (along * offset.dot(axis.direction) - offset.dot(direction)) / separation;
    let onAxis = (offset.dot(axis.direction) - along * offset.dot(direction)) / separation;
    if (onRay <= TOLERANCE) {
        return undefined;
    }
    let contact = from.add(direction.multiply(onRay));
    let onAxisPoint = axis.position.add(axis.direction.multiply(onAxis));
    return contact.sub(onAxisPoint).length <= TOLERANCE ? contact : undefined;
}
