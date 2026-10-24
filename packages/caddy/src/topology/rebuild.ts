/**
 * Rebuilding an object whose constructor takes design parameters rather than a native shape.
 *
 * `Shape#withWrapped` makes the copy that every transform returns by calling the subclass
 * constructor with a native shape. Objects such as `Rectangle` or `JernArc` take their
 * dimensions instead, so they construct through their base class under their own prototype and
 * carry across the fields the base constructor does not set — build123d deep-copies the object
 * and swaps its `wrapped` for the same reason.
 */

import type * as occt from "@roonieone/occt-native";

import type { Shape, ShapeOptions } from "./shape.ts";

export type ShapeBase = new (wrapped: occt.Shape, options?: ShapeOptions) => Shape;

export function rebuilt<T extends Shape>(original: T, base: ShapeBase, wrapped: occt.Shape): T {
    let options: ShapeOptions =
        original.color === undefined
            ? { label: original.label }
            : { label: original.label, color: original.color };
    let copy = Reflect.construct(base, [wrapped, options], original.constructor as ShapeBase) as T;
    let carried = Object.entries(original).filter(([key]) => !Object.hasOwn(copy, key));
    Object.assign(copy, Object.fromEntries(carried));
    for (let joint of original.joints.values()) {
        joint.rebind(copy);
    }
    return copy;
}
