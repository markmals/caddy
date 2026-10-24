// Gordon surface interpolation of a network of profile and guide curves.

import type { Shape, Vec3 } from "./types.ts";

import { addon } from "./addon.ts";

/** One profile or guide: an edge, or a point the network degenerates to at that position. */
export type NetworkCurve = Shape | Vec3;

export interface GordonSurfaceOptions {
    /** Tolerance for the intersection search and the surface construction. */
    readonly tolerance?: number;
}

interface GordonAddon {
    makeGordonSurfaceFace(
        profiles: readonly NetworkCurve[],
        guides: readonly NetworkCurve[],
        tolerance: number,
    ): Shape;
}

function native(): GordonAddon {
    return addon<GordonAddon>();
}

/**
 * Face of the Gordon surface interpolating a curve network. Every profile must intersect every
 * guide, and only the first or last entry of either list may be a point.
 */
export function makeGordonSurfaceFace(
    profiles: readonly NetworkCurve[],
    guides: readonly NetworkCurve[],
    options: GordonSurfaceOptions = {},
): Shape {
    return native().makeGordonSurfaceFace(profiles, guides, options.tolerance ?? 3e-4);
}
