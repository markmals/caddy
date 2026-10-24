/** Placements on a face's surface: the frame at a point on it, and at its centre. */

import { Orientation, query, shapes, surfaces } from "@roonieone/occt-native";

import type { Location } from "../geometry/location.ts";
import type { VectorLike } from "../geometry/vector.ts";
import type { Face } from "./face.ts";

import { Plane } from "../geometry/plane.ts";
import { Vector } from "../geometry/vector.ts";
import { fromVec3, toVec3 } from "./conversions.ts";
import { native } from "./kernel.ts";

/** Options of {@link Face#locationAt} and {@link Shell#locationAt}. */
export interface SurfaceLocationOptions {
    /** Direction the frame's X axis aims at, instead of the surface's U tangent. */
    readonly xDir?: VectorLike;
}

/** Where a location on a surface sits: normalized parameters, or a point to project onto it. */
export type SurfacePoint =
    | { readonly u: number; readonly v: number }
    | { readonly point: VectorLike };

/**
 * The placement on `face` at `where`: the surface point as origin, the outward normal as Z and
 * the surface's U tangent as X unless `xDir` overrides it (build123d `Face.location_at`).
 */
export function locationOnSurface(
    face: Face,
    where: SurfacePoint,
    options: SurfaceLocationOptions = {},
): Location {
    let [u, v] =
        "point" in where
            ? native("Surface location", () =>
                  query.projectPointOnFace(face.wrapped, toVec3(Vector.from(where.point))),
              )
            : surfaceParameters(face, where.u, where.v);
    let { point, uTangent, vTangent } = native("Surface location", () =>
        surfaces.faceDerivatives(face.wrapped, u, v),
    );
    let normal = fromVec3(uTangent).cross(fromVec3(vTangent)).normalized();
    // The surface normal ignores the face's orientation flag, so flip it as `normalAt` does.
    let zDir = shapes.orientation(face.wrapped) === Orientation.Reversed ? normal.negate() : normal;
    let xDir = options.xDir === undefined ? fromVec3(uTangent) : Vector.from(options.xDir);
    return new Plane({ origin: fromVec3(point), xDir: xDir.normalized(), zDir }).location;
}

/** The placement at the middle of a face's parameter range (build123d `Face.center_location`). */
export function centerLocation(face: Face): Location {
    let origin = face.positionAt(0.5, 0.5);
    return new Plane({ origin, zDir: face.normalAt(origin) }).location;
}

function surfaceParameters(face: Face, u: number, v: number): readonly [number, number] {
    let bounds = query.uvBounds(face.wrapped);
    return [
        bounds.uMin + u * (bounds.uMax - bounds.uMin),
        bounds.vMin + v * (bounds.vMax - bounds.vMin),
    ];
}
