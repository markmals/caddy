/** Shared placement of a sketch object: align its bounds, then turn it (build123d
 * `BaseSketchObject.__init__`). */

import type { Align2DLike } from "../geometry/enums.ts";
import type { Face } from "../topology/face.ts";
import type { Shape } from "../topology/shape.ts";

import { Align } from "../geometry/enums.ts";
import { Pos, Rotation } from "../geometry/location.ts";

export interface SketchPlacement {
    /** Degrees counter-clockwise about the sketch plane's origin. */
    readonly rotation?: number | undefined;
    /** Where the object's bounds sit; `null` leaves it where it was built. */
    readonly align?: Align2DLike | undefined;
}

/** The default alignment of most sketch objects. */
export const CENTERED: Align2DLike = [Align.Center, Align.Center];

/** A single alignment applies to both axes, as build123d's `tuplify(align, 2)` does. */
export function alignPair(align: Align2DLike): Align2DLike {
    return typeof align === "string" ? [align, align] : align;
}

/**
 * Moves `shape` so its bounds sit where `align` asks, then turns it about the origin, and
 * returns the faces to assemble into the sketch. Alignment is measured before the rotation and
 * only touches the X and Y axes.
 */
export function placedFaces(shape: Shape, placement: SketchPlacement = {}): Face[] {
    let offset = shape.boundingBox.toAlignOffset(alignPair(placement.align ?? null));
    let placed = shape.moved(new Pos(offset));
    let rotation = placement.rotation ?? 0;
    return (rotation === 0 ? placed : placed.moved(new Rotation(0, 0, rotation))).faces;
}
