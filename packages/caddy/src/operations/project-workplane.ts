import type { VectorLike } from "../geometry/index.ts";

import { GeometryError } from "../errors.ts";
import { TOLERANCE } from "../geometry/constants.ts";
import { Plane, Vector } from "../geometry/index.ts";
import { Vertex } from "../topology/vertex.ts";

/**
 * build123d `project_workplane`: the plane `distance` away along `projectionDir` whose origin and
 * X direction are the projections of `origin` and `xDir` in that direction.
 */
export function projectWorkplane(
    origin: VectorLike | Vertex,
    xDir: VectorLike | Vertex,
    projectionDir: VectorLike,
    distance: number,
): Plane {
    let start = pointOf(origin);
    let normal = Vector.from(projectionDir).normalized();
    let planeOrigin = start.add(normal.multiply(distance));
    let probe = start.add(pointOf(xDir).normalized());
    let planeXDir = probe.add(normal.multiply(planeOrigin.sub(probe).dot(normal))).sub(planeOrigin);
    if (planeXDir.length < TOLERANCE) {
        throw new GeometryError("x_dir is perpendicular to the projection direction");
    }
    return new Plane({ origin: planeOrigin, xDir: planeXDir, zDir: normal });
}

function pointOf(value: VectorLike | Vertex): Vector {
    return value instanceof Vertex ? value.center : Vector.from(value);
}
