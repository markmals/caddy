import { shapes } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/index.ts";

import { GeometryError, NativeKernelError } from "../errors.ts";
import { Plane, Transform, Vector } from "../geometry/index.ts";
import { Shape } from "../topology/shape.ts";

export function mirror(shape: Shape, about: Plane = Plane.XZ): Shape {
    let transform = Transform.fromPlaneMirror(about.origin, about.zDir);
    try {
        return Shape.cast(shapes.transformed(shape.wrapped, transform.toRows().flat(), true));
    } catch (cause) {
        throw new NativeKernelError("Mirror failed", { cause });
    }
}

export function scale(
    shape: Shape,
    by: number | readonly [number, number, number],
    about?: VectorLike,
): Shape {
    let location = about === undefined ? shapes.location(shape.wrapped) : undefined;
    let origin =
        about === undefined
            ? new Vector(location![3] ?? 0, location![7] ?? 0, location![11] ?? 0)
            : Vector.from(about);
    if (typeof by === "number") {
        let transform = Transform.fromScale(origin, by);
        try {
            return Shape.cast(shapes.transformed(shape.wrapped, transform.toRows().flat(), true));
        } catch (cause) {
            throw new NativeKernelError("Scale failed", { cause });
        }
    }
    if (by.length !== 3 || by.some(axis => !Number.isFinite(axis) || axis === 0)) {
        throw new GeometryError("Scale factors must be three nonzero finite numbers");
    }
    let [x, y, z] = by;
    let matrix = [
        x,
        0,
        0,
        origin.x * (1 - x),
        0,
        y,
        0,
        origin.y * (1 - y),
        0,
        0,
        z,
        origin.z * (1 - z),
    ];
    try {
        return Shape.cast(shapes.generalTransformed(shape.wrapped, matrix, true));
    } catch (cause) {
        throw new NativeKernelError("Non-uniform scale failed", { cause });
    }
}
