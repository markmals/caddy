// Hidden-line removal: projecting a shape onto a viewport and separating visible from hidden
// edges (OCCT HLRBRep_Algo).

import type { Shape, Vec3 } from "./types.ts";

import { addon } from "./addon.ts";

interface HlrAddon {
    hiddenLineEdges(
        shape: Shape,
        camera: Float64Array,
        focus: number | null,
    ): { visible: Shape[]; hidden: Shape[] };
}

/** The camera a shape is projected from. */
export interface Camera {
    /** Eye position. */
    readonly origin: Vec3;
    /** Projection direction, pointing from the scene towards the eye. */
    readonly direction: Vec3;
    /** Direction of the viewport's y axis. */
    readonly up: Vec3;
    /** Focal length of a perspective projection; omitted for an orthographic one. */
    readonly focus?: number;
}

/** Edges of a hidden-line projection, in the projection plane's coordinates. */
export interface ProjectedEdges {
    /** Visible sharp (C0), smooth (G1) and silhouette edges, in that order. */
    readonly visible: readonly Shape[];
    /** The same families of edges where the shape occludes them. */
    readonly hidden: readonly Shape[];
}

export function hiddenLineEdges(shape: Shape, camera: Camera): ProjectedEdges {
    let frame = Float64Array.of(...camera.origin, ...camera.direction, ...camera.up);
    return addon<HlrAddon>().hiddenLineEdges(shape, frame, camera.focus ?? null);
}
