import type { Shape as NativeShape } from "@roonieone/occt-native";

import { measure, shapes, topology } from "@roonieone/occt-native";

import type { Align3DLike, RotationLike } from "../geometry/index.ts";

import { NativeKernelError } from "../errors.ts";
import { BoundingBox, Pos, Rotation, Vector } from "../geometry/index.ts";

export function placePart(
    shape: NativeShape,
    align: Align3DLike,
    rotation: RotationLike,
): NativeShape {
    let placed = shape;
    if (align !== null) {
        let bounds = measure.boundingBox(shape);
        if (bounds === undefined) throw new Error("Cannot align an empty part");
        let offset = new BoundingBox(bounds.min, bounds.max).toAlignOffset(align);
        if (!offset.equals(new Vector())) {
            placed = shapes.moved(placed, new Pos(offset).transform.toRows().flat());
        }
    }
    let turn = rotation instanceof Rotation ? rotation : new Rotation(rotation);
    if (!turn.equals(new Rotation())) {
        placed = shapes.moved(placed, turn.transform.toRows().flat());
    }
    return placed;
}

export function makePartShape(
    build: () => NativeShape,
    align: Align3DLike,
    rotation: RotationLike,
): NativeShape {
    try {
        return topology.makeCompound([placePart(build(), align, rotation)]);
    } catch (cause) {
        throw new NativeKernelError("Part construction failed", { cause });
    }
}
