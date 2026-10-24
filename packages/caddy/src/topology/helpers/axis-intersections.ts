import { features } from "@roonieone/occt-native";

import type { Axis } from "../../geometry/axis.ts";
import type { Face } from "../face.ts";
import type { Shape } from "../shape.ts";

import { Vector } from "../../geometry/vector.ts";
import { native } from "../kernel.ts";
import { castShape } from "../registry.ts";

/** A point where an axis pierces a surface, with the surface's normal there. */
export type AxisIntersection = [point: Vector, normal: Vector];

/**
 * Where `axis` pierces the surfaces of `shape`, ordered along the axis (build123d
 * `Mixin2D.find_intersection_points`, which `Mixin3D` shares).
 */
export function axisIntersections(shape: Shape, axis: Axis, tolerance: number): AxisIntersection[] {
    let hits = native("Axis intersections", () =>
        features.axisHits(
            shape.wrapped,
            { origin: axis.position.toTuple(), direction: axis.direction.toTuple() },
            tolerance,
        ),
    );
    return hits.faces.map((wrapped, index) => {
        let point = new Vector(
            hits.points[index * 3] as number,
            hits.points[index * 3 + 1] as number,
            hits.points[index * 3 + 2] as number,
        );
        return [point, (castShape(wrapped) as Face).normalAt(point)];
    });
}
