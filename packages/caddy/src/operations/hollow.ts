import { features } from "@roonieone/occt-native";

import type { Face } from "../topology/face.ts";

import { GeometryError, NativeKernelError } from "../errors.ts";
import { Kind } from "../sketch/enums.ts";
import { Shape } from "../topology/shape.ts";

export interface HollowOptions {
    /** Modelling tolerance of the shelling algorithm; defaults to 1e-4 as in build123d. */
    readonly tolerance?: number;
    /** Corner treatment; `Kind.Tangent` is rejected, as OCCT cannot shell with it. */
    readonly kind?: Kind;
}

/**
 * Native `Mixin3D.hollow`: a wall of `thickness` around the solid. `faces` are left open; with
 * none the result is a watertight shell built from the offset and original boundaries.
 */
export function hollowSolid(
    solid: Shape,
    faces: readonly Face[],
    thickness: number,
    options: HollowOptions = {},
): Shape {
    let kind = options.kind ?? Kind.Arc;
    if (kind === Kind.Tangent) throw new GeometryError("Kind.Tangent is not supported by hollow");
    try {
        let shelled = Shape.cast(
            features.hollow(
                solid.wrapped,
                thickness,
                faces.map(face => face.wrapped),
                kind === Kind.Intersection ? 1 : 0,
                options.tolerance ?? 1e-4,
            ),
        );
        return faces.length > 0 ? shelled : shelled.fix();
    } catch (cause) {
        throw new NativeKernelError("Hollow failed; an alternative join kind may help", { cause });
    }
}
