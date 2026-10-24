/** Gordon surfaces: a face interpolating a network of profile and guide curves. */

import { gordon } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/vector.ts";
import type { Face } from "./face.ts";

import { GeometryError } from "../errors.ts";
import { Vector } from "../geometry/vector.ts";
import { Edge } from "./edge.ts";
import { native } from "./kernel.ts";
import { Shape } from "./shape.ts";

/** Options of {@link Face.makeGordonSurface}. */
export interface GordonSurfaceOptions {
    /**
     * How far apart a profile and a guide may be and still count as intersecting, and how
     * closely the surface follows the network; defaults to 3e-4.
     */
    readonly tolerance?: number;
}

function networkCurves(curves: Iterable<Edge | VectorLike>): gordon.NetworkCurve[] {
    return [...curves].map(curve =>
        curve instanceof Edge ? curve.wrapped : Vector.from(curve).toTuple(),
    );
}

/**
 * Face of the Gordon surface through a network of profiles and guides (build123d
 * `Face.make_gordon_surface`).
 *
 * Every profile must intersect every guide, both ends of every profile must lie on a guide and
 * both ends of every guide on a profile. Profiles and guides may be points instead of edges, but
 * only as the first or last entry of their list, and at least one profile and one guide must be
 * a real curve.
 */
export function makeGordonSurface(
    profiles: Iterable<Edge | VectorLike>,
    guides: Iterable<Edge | VectorLike>,
    options: GordonSurfaceOptions = {},
): Face {
    let profileCurves = networkCurves(profiles);
    let guideCurves = networkCurves(guides);
    let face = native(
        "Face.makeGordonSurface",
        () =>
            gordon.makeGordonSurfaceFace(profileCurves, guideCurves, {
                tolerance: options.tolerance ?? 3e-4,
            }),
        GeometryError,
    );
    return Shape.cast(face) as Face;
}
