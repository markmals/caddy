/** A line that stops at the first thing it runs into (build123d `IntersectingLine`). */

import { booleans } from "@roonieone/occt-native";

import type { VectorLike } from "../../geometry/vector.ts";
import type { Shape } from "../../topology/shape.ts";

import { GeometryError } from "../../errors.ts";
import { Vector } from "../../geometry/vector.ts";
import { native } from "../../topology/kernel.ts";
import { Shape as ShapeClass } from "../../topology/shape.ts";
import { BaseEdgeObject } from "../base-object.ts";
import { makeLine } from "../edge-makers.ts";

/**
 * Where a ray leaving `start` along `direction` crosses `other`.
 *
 * The ray is drawn long enough to clear the target's bounds and intersected with it
 * (BRepAlgoAPI_Section), which yields exactly the points that lie on both curves — the same set
 * build123d reads out of its 2D curve intersector.
 */
function crossings(start: Vector, direction: Vector, other: Shape): Vector[] {
    let bounds = other.boundingBox().add(start);
    let reach = bounds.diagonal;
    if (reach === 0) {
        throw new GeometryError("No intersections found");
    }
    let ray = makeLine(start.sub(direction.multiply(reach)), start.add(direction.multiply(reach)));
    let crossed = native("IntersectingLine", () =>
        booleans.section(
            [ray.wrapped],
            other.edges().map(edge => edge.wrapped),
        ),
    );
    return ShapeClass.cast(crossed)
        .vertices()
        .map(vertex => vertex.center());
}

export class IntersectingLine extends BaseEdgeObject {
    constructor(start: VectorLike, direction: VectorLike, other: Shape) {
        let from = Vector.from(start);
        let along = Vector.from(direction).normalized();
        let ahead = crossings(from, along, other).filter(point => point.sub(from).dot(along) > 0);
        if (ahead.length === 0) {
            throw new GeometryError("No intersections found");
        }
        let reach = Math.min(...ahead.map(point => point.sub(from).length));
        super(makeLine(from, from.add(along.multiply(reach))).wrapped);
    }
}
