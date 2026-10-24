import { features, shapes } from "@roonieone/occt-native";

import type { Face } from "../topology/face.ts";

import { NativeKernelError } from "../errors.ts";
import { Kind } from "../sketch/enums.ts";
import { Shape } from "../topology/shape.ts";

/** Native `Mixin3D.offset_3d`: no openings offsets the full solid; openings remove faces. */
export function offsetSolid(
    solid: Shape,
    amount: number,
    openings: readonly Face[],
    kind: Kind,
    tolerance: number,
): Shape {
    try {
        let result = features.offset(
            solid.wrapped,
            amount,
            openings.map(face => face.wrapped),
            kind === Kind.Intersection ? 1 : 0,
            tolerance,
        );
        let offsetted = Shape.cast(result);
        return offsetted.volume < 0 ? Shape.cast(shapes.reversed(offsetted.wrapped)) : offsetted;
    } catch (cause) {
        throw new NativeKernelError("Offset failed; an alternative join kind may help", { cause });
    }
}
